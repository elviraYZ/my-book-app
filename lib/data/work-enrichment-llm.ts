/**
 * LLM enrichment：在完整 whitelist 上裁定最终 topics，
 * 再选 primary_topics（1–2）+ concepts + display_summary。
 * 规则 topics 仅作 evidence/建议，不是硬限制。
 */

import { hasLlmProvider } from "@/lib/ai/config";
import { completeJson } from "@/lib/ai/llm";
import {
  GENRE_TAG_WHITELIST,
  filterWhitelistTags,
  isGenreTag,
  pickPrimaryTopics,
  type GenreTag,
} from "@/lib/data/book-tags";
import type { TopicSources } from "@/lib/data/ingest/types";
import {
  mergeConcepts,
  USE_CASE_WHITELIST,
} from "@/lib/data/work-enrichment";

const USE_CASE_SET = new Set<string>(USE_CASE_WHITELIST);
const WHITELIST_LIST = [...GENRE_TAG_WHITELIST];

export type LlmEnrichmentFields = {
  topics: GenreTag[];
  topic_sources: TopicSources;
  primary_topics: GenreTag[];
  concepts: string[];
  display_summary: string | null;
  source: "llm" | "rules";
};

const SYSTEM = `你是游戏/设计/技术书目的元数据标注助手。根据书名、简介、规则建议题材与已有概念，输出 JSON：
{
  "topics": string[],
  "primary_topics": string[],
  "concepts": string[],
  "display_summary": string
}

规则：
1. topics：只能从「whitelist」中选择（0–5 个）。表示这本书真正相关的正式题材。
   - 「rule_topics」是规则引擎建议，可保留、可删除误标、可补充规则漏掉的 whitelist 标签。
   - 不要生成 whitelist 之外的 canonical topic。
   - 不要因为简介里顺带提到某个技术词就强行挂上（例如新零售书偶尔提 AI → 不要因此以人工智能为主题）。
2. primary_topics：必须从你输出的最终 topics 中选择。默认 1 个，最多 2 个。
   表示「如果只能用最少标签描述这本书主要讲什么」。
   只有两个主题都占核心地位时才选 2 个。工具、附带章节、应用场景不要当 primary。
3. concepts：自由概念词（中文优先），3–8 个，要具体可检索。
   不要重复 whitelist 标签，不要写阅读目的枚举（工作调研/系统学习/找灵感/快速入门/休闲阅读）。
4. display_summary：1–2 句中文，概括主要讲什么、适合谁，不超过 120 字。
5. 只输出 JSON，不要 markdown。`;

const FEW_SHOT = `示例（学习格式，不要原样照抄到无关书）：
书名: Cocos2d-x之Lua核心编程
rule_topics: ["游戏设计","编程","图形渲染"]
→ {"topics":["编程","游戏设计"],"primary_topics":["编程"],"concepts":["Cocos2d-x","Lua","游戏引擎","脚本编程"],"display_summary":"面向用 Lua 做 Cocos2d-x 开发的编程教程，侧重引擎与脚本。"}

书名: 媒介环境学派视角下的网络游戏玩家研究
rule_topics: []
→ {"topics":["心理学","交互体验","游戏设计"],"primary_topics":["心理学"],"concepts":["玩家研究","媒介环境","网络游戏","用户行为"],"display_summary":"从媒介环境学视角研究网络游戏玩家，偏玩家行为与传播/心理，而非玩法设计手册。"}

书名: 新零售实战：商业模式+技术驱动+应用案例
rule_topics: ["人工智能"]
→ {"topics":["管理","产品"],"primary_topics":["管理"],"concepts":["新零售","商业模式","数字化转型","大数据应用"],"display_summary":"讲新零售商业模式与落地案例；AI/技术只是手段，不是主体。"}

书名: Game User Experience Evaluation
rule_topics: ["游戏设计","交互体验"]
→ {"topics":["交互体验","游戏设计"],"primary_topics":["交互体验"],"concepts":["游戏UX","可用性评测","玩家体验","用户研究"],"display_summary":"讲解如何评估游戏用户体验，偏 UX 方法与评测。"}

书名: 三维游戏美术设计
rule_topics: ["游戏设计","美术"]
→ {"topics":["美术","游戏设计"],"primary_topics":["美术"],"concepts":["3D美术","角色建模","场景建模","游戏资产"],"display_summary":"三维游戏美术与资产制作导向，主讲建模与美术流程。"}`;

function sanitizeConcepts(raw: unknown, fallback: string[]): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const t = item.trim().replace(/\s+/g, " ");
    if (t.length < 2 || t.length > 24) continue;
    if (isGenreTag(t) || USE_CASE_SET.has(t)) continue;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
    if (out.length >= 8) break;
  }
  if (out.length >= 3) return out;
  return mergeConcepts(out, fallback).slice(0, 8);
}

function sanitizeTopics(raw: unknown): GenreTag[] {
  if (!Array.isArray(raw)) return [];
  return filterWhitelistTags(
    raw.filter((x): x is string => typeof x === "string"),
  ).slice(0, 5);
}

function sanitizePrimary(
  raw: unknown,
  finalTopics: GenreTag[],
): GenreTag[] {
  const allow = new Set(finalTopics);
  const list = Array.isArray(raw) ? raw : [];
  const out: GenreTag[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!allow.has(t as GenreTag)) continue;
    if (out.includes(t as GenreTag)) continue;
    out.push(t as GenreTag);
    if (out.length >= 2) break;
  }
  if (out.length > 0) return out;
  return pickPrimaryTopics(finalTopics).slice(0, 1);
}

function sanitizeSummary(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < 12) return fallback;
  return t.slice(0, 160);
}

/** 规则保留 → evidence；LLM 新补 → llm（覆盖旧 seed） */
export function buildEnrichmentTopicSources(
  finalTopics: GenreTag[],
  ruleTopics: GenreTag[],
): TopicSources {
  const ruleSet = new Set(ruleTopics);
  const out: TopicSources = {};
  for (const t of finalTopics) {
    out[t] = ruleSet.has(t) ? "evidence" : "llm";
  }
  return out;
}

function rulesOnlyResult(input: {
  ruleTopics: GenreTag[];
  fallbackSummary: string;
  fallbackConcepts: string[];
}): LlmEnrichmentFields {
  const topics = input.ruleTopics;
  return {
    topics,
    topic_sources: buildEnrichmentTopicSources(topics, topics),
    primary_topics: pickPrimaryTopics(topics).slice(0, 2),
    concepts: input.fallbackConcepts.slice(0, 8),
    display_summary: input.fallbackSummary,
    source: "rules",
  };
}

/**
 * LLM 裁定最终 topics / primary / concepts / summary。
 * 失败时回退规则 topics。
 */
export async function enrichTopicsWithLlm(input: {
  title: string;
  description?: string | null;
  /** 规则建议题材（可被 LLM 增删） */
  ruleTopics: GenreTag[];
  fallbackSummary: string;
  fallbackConcepts: string[];
}): Promise<LlmEnrichmentFields> {
  const ruleTopics = filterWhitelistTags(input.ruleTopics);

  if (!hasLlmProvider()) {
    return rulesOnlyResult({
      ruleTopics,
      fallbackSummary: input.fallbackSummary,
      fallbackConcepts: input.fallbackConcepts,
    });
  }

  const desc = (input.description ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
  const conceptHint =
    input.fallbackConcepts.length > 0
      ? JSON.stringify(input.fallbackConcepts)
      : "[]";

  const user = `${FEW_SHOT}

—— 当前书 ——
书名: ${input.title}
简介: ${desc || "（无）"}
whitelist: ${JSON.stringify(WHITELIST_LIST)}
rule_topics（建议，非硬限制）: ${JSON.stringify(ruleTopics)}
hint_concepts: ${conceptHint}

请输出 JSON（topics 只能来自 whitelist）。`;

  try {
    const raw = await completeJson({
      system: SYSTEM,
      user,
      temperature: 0.2,
    });
    const obj =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

    const topics = sanitizeTopics(obj.topics);
    const primary_topics = sanitizePrimary(obj.primary_topics, topics);
    const concepts = sanitizeConcepts(obj.concepts, input.fallbackConcepts);
    const display_summary = sanitizeSummary(
      obj.display_summary,
      input.fallbackSummary,
    );

    return {
      topics,
      topic_sources: buildEnrichmentTopicSources(topics, ruleTopics),
      primary_topics,
      concepts,
      display_summary,
      source: "llm",
    };
  } catch (err) {
    console.warn(
      "[enrich-llm] fallback rules:",
      err instanceof Error ? err.message : err,
    );
    return rulesOnlyResult({
      ruleTopics,
      fallbackSummary: input.fallbackSummary,
      fallbackConcepts: input.fallbackConcepts,
    });
  }
}

/** @deprecated 使用 enrichTopicsWithLlm */
export const enrichPrimaryAndConceptsWithLlm = enrichTopicsWithLlm;
