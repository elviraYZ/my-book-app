/**
 * Top-K 推荐理由：一次 LLM call，不改分、不改排序。
 * 失败 / timeout → 保留模板理由（buildMatchReason）。
 */

import { hasLlmProvider } from "@/lib/ai/config";
import { completeJson } from "@/lib/ai/llm";
import { EXPLAIN_LLM } from "@/lib/data/recommend/weights";
import type {
  StructuredDemandContext,
  TopicBook,
} from "@/lib/types";

const SYSTEM_PROMPT = `你是游戏行业阅读助手「游研书伴」的推荐理由撰写器。

硬性规则：
1. 只输出一个 JSON 对象，不要 markdown，不要解释。
2. 不要重新打分、不要改排序、不要推荐新书、不要否定现有排名。
3. 字段必须是：{ "reasons": [ { "book_id": string, "reason": string } ] }
4. reasons 数量与输入 books 一致，book_id 必须与输入完全相同。
5. 每条 reason：中文 1–2 句，具体说明「为什么适合当前需求」；结合题材/关键词命中与书的内容要点；不要空泛套话；不要复述百分比分数。
6. 不要编造书中不存在的章节或案例。`;

type CacheEntry = { reasons: Record<string, string>; at: number };

const explainCache = new Map<string, CacheEntry>();

function trimText(s: string | null | undefined, max: number): string {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** 轻量 hash（避免依赖 node:crypto） */
function hashKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `x${(h >>> 0).toString(16)}`;
}

function cacheKey(
  demandText: string,
  demand: StructuredDemandContext,
  books: TopicBook[],
): string {
  const payload = {
    q: demandText.slice(0, 400),
    topics: demand.topics ?? [],
    keywords: (demand.keywords ?? []).slice(0, 8),
    goal: demand.goal ?? "",
    styles: demand.styles ?? [],
    books: books.map((b) => ({
      id: b.book_id,
      score: b.match_score ?? 0,
    })),
  };
  return hashKey(JSON.stringify(payload));
}

function getCached(key: string): Record<string, string> | null {
  const hit = explainCache.get(key);
  if (!hit) return null;
  // LRU-ish：触碰刷新
  explainCache.delete(key);
  explainCache.set(key, hit);
  return hit.reasons;
}

function setCached(key: string, reasons: Record<string, string>): void {
  explainCache.set(key, { reasons, at: Date.now() });
  while (explainCache.size > EXPLAIN_LLM.cacheMaxEntries) {
    const oldest = explainCache.keys().next().value;
    if (oldest == null) break;
    explainCache.delete(oldest);
  }
}

function buildUserPrompt(
  demandText: string,
  demand: StructuredDemandContext,
  books: TopicBook[],
): string {
  const context = {
    user_prompt: trimText(demandText, 500),
    topics: demand.topics ?? [],
    keywords: (demand.keywords ?? []).slice(0, 10),
    goal: demand.goal || null,
    styles: demand.styles ?? [],
    difficulty: demand.difficulty,
    time: demand.time,
  };

  const bookPayloads = books.map((item, index) => {
    const book = item.book;
    const scores = item.scores;
    return {
      book_id: item.book_id,
      rank: index + 1,
      title: book?.title ?? "",
      author: book?.author ?? "",
      tags: (book?.tags ?? []).slice(0, 8),
      matched_tags: item.matched_tags.slice(0, 6),
      summary: trimText(
        book?.display_summary ?? book?.description ?? "",
        280,
      ),
      content_style: book?.content_style ?? [],
      context_match_score: item.match_score ?? null,
      scoring_evidence: scores
        ? {
            topic: scores.topicScore,
            keyword: scores.keywordScore,
            semantic: scores.semanticScore,
            goal: scores.goalScore,
            style: scores.styleScore,
            difficulty: scores.difficultyScore,
            time: scores.timeScore,
            core_relevance: scores.coreRelevance,
          }
        : null,
      template_reason: item.match_reason ?? "",
    };
  });

  return `请为下列已排序的 Top ${books.length} 本分别写推荐理由。

## User Context
${JSON.stringify(context, null, 2)}

## Books（已按匹配度排好，勿改顺序）
${JSON.stringify(bookPayloads, null, 2)}

输出 JSON：{"reasons":[{"book_id":"...","reason":"..."}, ...]}`;
}

function parseReasons(
  raw: unknown,
  expectedIds: string[],
): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const reasons = (raw as { reasons?: unknown }).reasons;
  if (!Array.isArray(reasons)) return null;

  const out: Record<string, string> = {};
  for (const item of reasons) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { book_id?: unknown }).book_id;
    const reason = (item as { reason?: unknown }).reason;
    if (typeof id !== "string" || typeof reason !== "string") continue;
    const cleaned = reason.trim();
    if (!cleaned) continue;
    out[id] = cleaned.slice(0, 280);
  }

  // 至少覆盖一半才采纳，避免半截乱写盖掉模板
  const hit = expectedIds.filter((id) => out[id]).length;
  if (hit < Math.ceil(expectedIds.length / 2)) return null;
  return out;
}

/**
 * 就地写入 Top-K 的 match_reason；失败则原样返回（模板理由保留）。
 */
export async function enrichTopMatchReasonsWithLlm(
  books: TopicBook[],
  demandText: string,
  demand: StructuredDemandContext,
): Promise<{ books: TopicBook[]; source: "llm" | "template" | "cache" }> {
  const topK = Math.min(EXPLAIN_LLM.topK, books.length);
  if (topK === 0) return { books, source: "template" };
  if (!hasLlmProvider()) return { books, source: "template" };

  const slice = books.slice(0, topK);
  const key = cacheKey(demandText, demand, slice);
  const cached = getCached(key);
  if (cached) {
    return {
      books: applyReasons(books, cached, topK),
      source: "cache",
    };
  }

  try {
    const raw = await completeJson({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(demandText, demand, slice),
      temperature: 0.4,
    });
    const parsed = parseReasons(
      raw,
      slice.map((b) => b.book_id),
    );
    if (!parsed) {
      console.warn("[explain-llm] parse failed, keep template reasons");
      return { books, source: "template" };
    }
    setCached(key, parsed);
    return {
      books: applyReasons(books, parsed, topK),
      source: "llm",
    };
  } catch (err) {
    console.warn(
      "[explain-llm] failed, keep template reasons:",
      err instanceof Error ? err.message : err,
    );
    return { books, source: "template" };
  }
}

function applyReasons(
  books: TopicBook[],
  reasons: Record<string, string>,
  topK: number,
): TopicBook[] {
  return books.map((b, i) => {
    if (i >= topK) return b;
    const reason = reasons[b.book_id];
    if (!reason) return b;
    return { ...b, match_reason: reason };
  });
}
