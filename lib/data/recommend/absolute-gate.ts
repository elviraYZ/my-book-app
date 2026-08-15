/**
 * Absolute relevance gate（六维个性化之前）。
 * 只根据 explicit topic/keyword + raw semantic similarity 判定是否真正相关。
 * inferred 可辅助分，但不能单独让候选通过。
 *
 * 注意：稀疏命中（5 个关键词里撞到 1 个常见词）不能当强证据。
 */

import {
  ABSOLUTE_RELEVANCE,
  type ContextSpecificity,
} from "@/lib/data/recommend/weights";
import {
  TOPIC_TIER_SCORE,
  classifyTopicHit,
  expandTopicsForMatch,
  tagsMatchAny,
} from "@/lib/data/recommend/taxonomy-expand";
import type { Book, StructuredDemandContext } from "@/lib/types";

export type AbsoluteRelevanceResult = {
  admit: boolean;
  explicitCoreScore: number;
  inferredCoreScore: number;
  coreRelevance: number;
  rawSemanticSimilarity: number;
  explicitTopicScore: number;
  explicitKeywordScore: number;
  inferredTopicScore: number;
  inferredKeywordScore: number;
  rejectReason: string | null;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function textBlob(book: Book): string {
  return [
    book.title,
    book.display_summary ?? "",
    book.description ?? "",
    book.tags.join(" "),
    (book.primary_topics ?? []).join(" "),
    (book.concepts ?? []).join(" "),
    (book.use_cases ?? []).join(" "),
  ]
    .join("\n")
    .toLowerCase();
}

function overlapHits(
  needles: string[],
  haystack: string[],
): { hits: number; ratio: number } {
  if (needles.length === 0) return { hits: 0, ratio: 0 };
  let hits = 0;
  for (const n of needles) {
    const nl = n.toLowerCase();
    if (
      haystack.some(
        (h) => h.toLowerCase().includes(nl) || nl.includes(h.toLowerCase()),
      )
    ) {
      hits += 1;
    }
  }
  return { hits, ratio: hits / needles.length };
}

function keywordHits(
  keywords: string[],
  blob: string,
): { hits: number; ratio: number } {
  if (keywords.length === 0) return { hits: 0, ratio: 0 };
  let hits = 0;
  for (const k of keywords) {
    const kl = k.toLowerCase().trim();
    // 过短词极易误伤（如「路径」「空间」），绝对相关不单靠它们
    if (kl.length < 2) continue;
    if (blob.includes(kl)) hits += 1;
  }
  return { hits, ratio: hits / keywords.length };
}

/**
 * 证据强度：禁止「1/N 命中 → 0.5」。
 * 单次弱命中最高 0.25（低于 admit.explicit*Weak），须 2+ 命中或高比例才过弱阈。
 */
function evidenceScore(hits: number, ratio: number): number {
  if (hits <= 0) return 0;
  if (ratio >= 0.67 || hits >= 3) return 1;
  if (ratio >= 0.34 || hits >= 2) return 0.8;
  // 单次命中：仅当该词几乎是唯一关键词时给弱分
  if (hits === 1 && ratio >= 0.5) return 0.5;
  if (hits === 1) return 0.25;
  return 0;
}

export function getExplicitTopics(demand: StructuredDemandContext): string[] {
  // 已分区时即使 [] 也要用，勿回退到含 inferred 的 topics
  if (demand.explicitTopics !== undefined) return demand.explicitTopics;
  return demand.topics ?? [];
}

export function getInferredTopics(demand: StructuredDemandContext): string[] {
  if (demand.inferredTopics !== undefined) return demand.inferredTopics;
  return [];
}

export function getExplicitKeywords(demand: StructuredDemandContext): string[] {
  if (demand.explicitKeywords !== undefined) return demand.explicitKeywords;
  return demand.keywords ?? [];
}

export function getInferredKeywords(demand: StructuredDemandContext): string[] {
  if (demand.inferredKeywords !== undefined) return demand.inferredKeywords;
  return [];
}

/**
 * 评估绝对相关性。
 * rawSemanticSimilarity：有语义召回证据时为 cosine；null/undefined = missing（≠ 不相关）。
 * taxonomy expand 只用于「是否命中可召回」；topic 强度按 exact/child/related，不被展开稀释。
 */
export function evaluateAbsoluteRelevance(
  book: Book,
  demand: StructuredDemandContext,
  rawSemanticSimilarity: number | null | undefined,
  specificity: ContextSpecificity = "MEDIUM",
): AbsoluteRelevanceResult {
  const hasSemanticEvidence =
    rawSemanticSimilarity != null &&
    Number.isFinite(rawSemanticSimilarity) &&
    rawSemanticSimilarity > 0;
  const rawSim = hasSemanticEvidence
    ? clamp01(rawSemanticSimilarity as number)
    : 0;

  const blob = textBlob(book);
  const tags = book.tags ?? [];

  const explicitTopics = getExplicitTopics(demand);
  const inferredTopics = getInferredTopics(demand);
  const explicitKeywords = getExplicitKeywords(demand);
  const inferredKeywords = getInferredKeywords(demand);

  // 召回用：展开；评分强度另算
  const matchTopics =
    specificity === "LOW"
      ? expandTopicsForMatch(explicitTopics, { forceExpand: true })
      : explicitTopics;

  const exTopicExpanded = overlapHits(matchTopics, tags);
  const inTopic = overlapHits(inferredTopics, tags);
  const exKw = keywordHits(explicitKeywords, blob);
  const inKw = keywordHits(inferredKeywords, blob);

  // topic 强度：LOW 用档位；勿用「1/展开N」稀释 exact
  let explicitTopicScore: number;
  if (specificity === "LOW" && explicitTopics.length > 0) {
    const tier = classifyTopicHit(tags, explicitTopics);
    explicitTopicScore =
      tier === "none" ? 0 : TOPIC_TIER_SCORE[tier];
  } else if (explicitTopics.length > 0) {
    const rootHits = overlapHits(explicitTopics, tags);
    explicitTopicScore = evidenceScore(rootHits.hits, rootHits.ratio);
  } else {
    explicitTopicScore = 0;
  }

  const inferredTopicScore = evidenceScore(inTopic.hits, inTopic.ratio);
  const explicitKeywordScore = evidenceScore(exKw.hits, exKw.ratio);
  const inferredKeywordScore = evidenceScore(inKw.hits, inKw.ratio);

  const w = ABSOLUTE_RELEVANCE.coreWeights;
  const mixEvidence = (
    topic: number,
    keyword: number,
    includeTopic: boolean,
    includeKeyword: boolean,
    semWeight: number,
  ): number => {
    let num = 0;
    let den = 0;
    if (includeTopic) {
      num += topic * w.topic;
      den += w.topic;
    }
    if (includeKeyword) {
      num += keyword * w.keyword;
      den += w.keyword;
    }
    if (hasSemanticEvidence) {
      num += rawSim * semWeight;
      den += semWeight;
    }
    if (den <= 0) return 0;
    return clamp01(num / den);
  };

  const explicitCoreScore = mixEvidence(
    explicitTopicScore,
    explicitKeywordScore,
    explicitTopics.length > 0,
    explicitKeywords.length > 0,
    w.semantic,
  );
  const inferredCoreScore = mixEvidence(
    inferredTopicScore,
    inferredKeywordScore,
    inferredTopics.length > 0,
    inferredKeywords.length > 0,
    w.semantic * 0.35,
  );

  // 无 inferred 面时不要用 0 inferred 拖累；仅 explicit
  const coreRelevance = clamp01(
    inferredTopics.length > 0 || inferredKeywords.length > 0
      ? explicitCoreScore * ABSOLUTE_RELEVANCE.explicitMix +
          inferredCoreScore * ABSOLUTE_RELEVANCE.inferredMix
      : explicitCoreScore,
  );

  const thr = ABSOLUTE_RELEVANCE.admit;
  let admit = false;
  let rejectReason: string | null = null;

  const hasExplicit =
    explicitTopics.length > 0 || explicitKeywords.length > 0;
  const hasLexicalEvidence =
    explicitTopicScore >= thr.explicitTopicWeak ||
    explicitKeywordScore >= thr.explicitKeywordWeak;
  // 宽 query：展开后的任一子类/相关 tag 命中即可进池（召回语义）
  const hasTopicTagHit =
    specificity === "LOW"
      ? tagsMatchAny(tags, matchTopics) || exTopicExpanded.hits >= 1
      : overlapHits(explicitTopics, tags).hits >= 1;

  if (specificity === "LOW") {
    if (hasTopicTagHit) {
      admit = true;
    } else if (hasSemanticEvidence && rawSim >= thr.rawSemanticStrong) {
      admit = true;
    } else if (explicitKeywordScore >= thr.explicitKeywordWeak) {
      admit = true;
    } else if (
      coreRelevance >= thr.minCoreRelevance &&
      hasSemanticEvidence &&
      rawSim >= 0.4
    ) {
      admit = true;
    } else {
      rejectReason = "broad_no_signal";
    }
  } else {
    // MEDIUM / HIGH
    if (explicitKeywordScore >= thr.explicitKeywordStrong) {
      admit = true;
    } else if (hasSemanticEvidence && rawSim >= thr.rawSemanticStrong) {
      if (
        !hasExplicit ||
        hasLexicalEvidence ||
        rawSim >= thr.rawSemanticSolo ||
        (specificity === "MEDIUM" && hasTopicTagHit)
      ) {
        admit = true;
      } else {
        rejectReason = "semantic_without_lexical";
      }
    } else if (
      explicitTopicScore >= thr.explicitTopicStrong &&
      hasSemanticEvidence &&
      rawSim >= thr.rawSemanticForTopic
    ) {
      admit = true;
    } else if (
      explicitKeywordScore >= thr.explicitKeywordWeak &&
      hasSemanticEvidence &&
      rawSim >= thr.rawSemanticCombo
    ) {
      admit = true;
    } else if (
      (inferredTopicScore >= 0.5 || inferredKeywordScore >= 0.5) &&
      hasSemanticEvidence &&
      rawSim >= thr.rawSemanticCombo
    ) {
      admit = true;
    } else if (hasTopicTagHit && explicitTopicScore >= thr.explicitTopicWeak) {
      admit = true;
    } else if (hasTopicTagHit && explicitTopics.length > 0) {
      admit = true;
    } else if (
      hasLexicalEvidence &&
      explicitCoreScore >= thr.minExplicitCoreToAdmit &&
      coreRelevance >= thr.minCoreRelevance
    ) {
      admit = true;
    } else {
      rejectReason = hasSemanticEvidence
        ? "weak_core"
        : "no_lexical_or_semantic";
    }

    if (
      specificity === "HIGH" &&
      admit &&
      hasExplicit &&
      !hasLexicalEvidence &&
      (!hasSemanticEvidence || rawSim < thr.rawSemanticSolo)
    ) {
      admit = false;
      rejectReason = "no_lexical_evidence";
    }
  }

  return {
    admit,
    explicitCoreScore,
    inferredCoreScore,
    coreRelevance,
    rawSemanticSimilarity: hasSemanticEvidence ? rawSim : 0,
    explicitTopicScore,
    explicitKeywordScore,
    inferredTopicScore,
    inferredKeywordScore,
    rejectReason: admit ? null : rejectReason,
  };
}
