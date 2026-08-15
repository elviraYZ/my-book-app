/**
 * Lexical 召回：topics / keywords / concepts，取 Top-K。
 * 在完整书目（DB 分页或传入 catalog）上打分，不依赖 explore 的 300 上限。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchWorksOverlappingTopics,
  fetchWorksPaged,
} from "@/lib/data/recommend/recall-fetch";
import { expandTopicsForMatch } from "@/lib/data/recommend/taxonomy-expand";
import { RECALL_LIMIT } from "@/lib/data/recommend/weights";
import type { Book, StructuredDemandContext } from "@/lib/types";

function blob(book: Book): string {
  return [
    book.title,
    book.description ?? "",
    book.tags.join(" "),
    (book.primary_topics ?? []).join(" "),
    (book.concepts ?? []).join(" "),
    (book.display_summary ?? ""),
    (book.use_cases ?? []).join(" "),
  ]
    .join("\n")
    .toLowerCase();
}

export function lexicalRecallRank(
  book: Book,
  demand: StructuredDemandContext,
): number {
  let score = 0;
  const b = blob(book);
  const topics = expandTopicsForMatch(
    demand.explicitTopics?.length
      ? demand.explicitTopics
      : demand.topics,
    { forceExpand: true },
  );
  for (const t of topics) {
    const tl = t.toLowerCase();
    if (book.tags.some((x) => x.includes(t) || t.includes(x))) score += 12;
    else if ((book.primary_topics ?? []).includes(t)) score += 14;
    else if (b.includes(tl)) score += 6;
  }
  for (const k of demand.keywords ?? []) {
    const kl = k.toLowerCase();
    if (!kl) continue;
    if ((book.concepts ?? []).some((c) => c.toLowerCase().includes(kl) || kl.includes(c.toLowerCase()))) {
      score += 10;
    } else if (b.includes(kl)) score += 8;
    else if (book.tags.some((x) => x.includes(k) || k.includes(x))) score += 4;
  }
  for (const s of demand.styles) {
    if (s.includes("案例") && book.content_style.includes("case")) score += 3;
    if (s === "理论优先" && book.content_style.includes("theory")) score += 3;
    if (s === "少理论") {
      if (
        book.content_style.includes("case") ||
        book.content_style.includes("method")
      ) {
        score += 3;
      }
      if (
        book.content_style.length === 1 &&
        book.content_style[0] === "theory"
      ) {
        score -= 4;
      }
    }
    if (s.includes("实操") && book.content_style.includes("method")) score += 3;
  }
  if (demand.difficulty && book.difficulty === demand.difficulty) score += 2;
  if (book.rating != null) score += Number(book.rating) * 0.3;
  return score;
}

/** @deprecated 用 lexicalRecallRank */
function recallRank(book: Book, demand: StructuredDemandContext): number {
  return lexicalRecallRank(book, demand);
}

/**
 * 本地 / 内存 lexical：topics + keywords + concepts 粗排，取 Top limit。
 */
export function recallLocalCandidates(
  catalog: Book[],
  demand: StructuredDemandContext,
  limit = RECALL_LIMIT,
): Book[] {
  if (catalog.length === 0) return [];
  if (catalog.length <= limit) {
    return [...catalog].sort(
      (a, b) => lexicalRecallRank(b, demand) - lexicalRecallRank(a, demand),
    );
  }

  const ranked = [...catalog]
    .map((book) => ({ book, score: recallRank(book, demand) }))
    .sort((a, b) => b.score - a.score);

  const top = ranked.slice(0, limit).map((r) => r.book);
  const matchTopics = expandTopicsForMatch(
    demand.explicitTopics?.length
      ? demand.explicitTopics
      : demand.topics,
    { forceExpand: true },
  );
  const focusHit = top.filter((b) => {
    const text = blob(b);
    return (
      matchTopics.some((t) =>
        b.tags.some((x) => x.includes(t) || t.includes(x)),
      ) ||
      (demand.keywords ?? []).some((k) => text.includes(k.toLowerCase())) ||
      (b.concepts ?? []).some((c) =>
        (demand.keywords ?? []).some((k) =>
          c.toLowerCase().includes(k.toLowerCase()),
        ),
      )
    );
  });
  if (focusHit.length >= 8) return top;

  const ids = new Set(top.map((b) => b.id));
  for (const { book, score } of ranked) {
    if (score <= 0) break;
    if (ids.has(book.id)) continue;
    top.push(book);
    ids.add(book.id);
    if (top.length >= limit) break;
  }
  return top;
}

/**
 * DB lexical：优先 topic overlaps 子集，不足再全表分页；内存打分取 Top-K。
 */
export async function recallLexicalCandidates(
  demand: StructuredDemandContext,
  options: {
    supabase?: SupabaseClient;
    catalog?: Book[];
    limit?: number;
  } = {},
): Promise<Book[]> {
  const limit = options.limit ?? RECALL_LIMIT;

  if (options.catalog && options.catalog.length > 0) {
    return recallLocalCandidates(options.catalog, demand, limit);
  }
  if (!options.supabase) return [];

  const roots =
    demand.explicitTopics?.length
      ? demand.explicitTopics
      : demand.topics;
  const topicRoots = [...new Set((roots ?? []).map((t) => t.trim()).filter(Boolean))];

  let pool: Book[] = [];
  if (topicRoots.length > 0) {
    const a = await fetchWorksOverlappingTopics(options.supabase, topicRoots, {
      column: "topics",
      max: Math.max(limit * 4, 400),
    });
    const b = await fetchWorksOverlappingTopics(options.supabase, topicRoots, {
      column: "primary_topics",
      max: Math.max(limit * 4, 400),
    });
    const seen = new Set<string>();
    for (const book of [...a, ...b]) {
      if (seen.has(book.id)) continue;
      seen.add(book.id);
      pool.push(book);
    }
  }

  // 关键词多或 topic 池太小：补全表扫描再打分
  const kwCount = demand.keywords?.length ?? 0;
  const needScan =
    pool.length < limit || (kwCount > 0 && pool.length < limit * 2);
  if (needScan) {
    const all = await fetchWorksPaged(options.supabase);
    const seen = new Set(pool.map((b) => b.id));
    for (const book of all) {
      if (seen.has(book.id)) continue;
      if (lexicalRecallRank(book, demand) > 0) {
        seen.add(book.id);
        pool.push(book);
      }
    }
  }

  return recallLocalCandidates(pool, demand, limit);
}
