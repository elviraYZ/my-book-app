/**
 * 本地足够性：优先 absolute gate 命中与 core coverage，
 * 不以含 Profile/Goal/Style 的综合 matchScore 为主条件。
 */

import { SUFFICIENCY } from "@/lib/data/recommend/weights";
import type { DimensionScores, StructuredDemandContext } from "@/lib/types";
import type { Book } from "@/lib/types";

export type ScoredRow = {
  book: Book;
  scores: DimensionScores;
};

export type SufficiencyResult = {
  enough: boolean;
  /** 通过 absolute gate 的候选数（主信号） */
  localAbsoluteHits: number;
  /** raw internal matchScore 最高分（次要观测） */
  topScore: number;
  /** raw matchScore >= 60 的数量（次要观测） */
  qualifiedCount: number;
  topicCoverage: number;
  keywordCoverage: number;
  semanticCoverage: number;
  coreContextHits: number;
  keywordEvidenceHits: number;
  semanticStrongHits: number;
  reasons: string[];
};

function rawMatch(scores: DimensionScores): number {
  return scores.matchScore;
}

function keywordSoft(scores: DimensionScores): number {
  return scores.keywordScore ?? 0;
}

function semanticSoft(scores: DimensionScores): number {
  return scores.semanticScore ?? 0;
}

function coreSoft(scores: DimensionScores): number {
  return scores.coreRelevance ?? 0;
}

export function topicCoverageRatio(
  rows: ScoredRow[],
  demand: StructuredDemandContext,
): number {
  const topics =
    demand.explicitTopics?.length ? demand.explicitTopics : demand.topics;
  if (topics.length === 0) return 1;
  if (rows.length === 0) return 0;

  let covered = 0;
  for (const topic of topics) {
    const hit = rows.some((r) =>
      r.book.tags.some((t) => t.includes(topic) || topic.includes(t)),
    );
    if (hit) covered += 1;
  }
  return covered / topics.length;
}

/**
 * core-context hit：用绝对 core / keyword / semantic，而非综合 matchScore。
 */
export function isCoreContextHit(scores: DimensionScores): boolean {
  const kw = keywordSoft(scores);
  const sem = semanticSoft(scores);
  const core = coreSoft(scores);
  const s = SUFFICIENCY;
  if (core >= 0.45) return true;
  if (kw >= s.keywordStrongFloor) return true;
  if (sem >= s.semanticStrongFloor) return true;
  if (kw >= s.keywordWeakFloor && sem >= s.semanticComboFloor) return true;
  return false;
}

export function countCoreContextHits(rows: ScoredRow[]): number {
  return rows.filter((r) => isCoreContextHit(r.scores)).length;
}

export function countKeywordEvidenceHits(rows: ScoredRow[]): number {
  const floor = SUFFICIENCY.keywordEvidenceFloor;
  return rows.filter((r) => keywordSoft(r.scores) >= floor).length;
}

export function countSemanticStrongHits(rows: ScoredRow[]): number {
  const floor = SUFFICIENCY.semanticStrongFloor;
  return rows.filter((r) => semanticSoft(r.scores) >= floor).length;
}

export function keywordCoverageRatio(
  rows: ScoredRow[],
  demand: StructuredDemandContext,
): number {
  const hasKw =
    (demand.explicitKeywords?.length ?? 0) > 0 ||
    (demand.keywords?.length ?? 0) > 0;
  if (!hasKw) return 1;
  const hits = countKeywordEvidenceHits(rows);
  const need = SUFFICIENCY.minCoreContextHits;
  return Math.min(1, hits / Math.max(1, need));
}

export function semanticCoverageRatio(
  rows: ScoredRow[],
  demand: StructuredDemandContext,
): number {
  const hasKw =
    (demand.explicitKeywords?.length ?? 0) > 0 ||
    (demand.keywords?.length ?? 0) > 0;
  if (!hasKw) return 1;
  const hits = countSemanticStrongHits(rows);
  const need = SUFFICIENCY.minCoreContextHits;
  return Math.min(1, hits / Math.max(1, need));
}

/**
 * 本地是否足够：
 * 1) absolute hits 够数
 * 2) core / keyword / semantic 覆盖
 * matchScore 仅作旁路观测，不作为主条件。
 */
export function isLocalSufficient(
  rows: ScoredRow[],
  demand: StructuredDemandContext,
): SufficiencyResult {
  const sorted = [...rows].sort(
    (a, b) => rawMatch(b.scores) - rawMatch(a.scores),
  );
  const localAbsoluteHits = sorted.filter(
    (r) => r.scores.admittedByCoreGate !== false,
  ).length;
  const topScore = sorted[0] ? rawMatch(sorted[0].scores) : 0;
  const qualifiedCount = sorted.filter(
    (r) => rawMatch(r.scores) >= SUFFICIENCY.minQualifiedScore,
  ).length;
  const topicCoverage = topicCoverageRatio(sorted, demand);
  const coreContextHits = countCoreContextHits(sorted);
  const keywordEvidenceHits = countKeywordEvidenceHits(sorted);
  const semanticStrongHits = countSemanticStrongHits(sorted);
  const keywordCoverage = keywordCoverageRatio(sorted, demand);
  const semanticCoverage = semanticCoverageRatio(sorted, demand);
  const hasKeywords =
    (demand.explicitKeywords?.length ?? 0) > 0 ||
    (demand.keywords?.length ?? 0) > 0;

  const reasons: string[] = [];
  if (localAbsoluteHits < SUFFICIENCY.minAbsoluteHits) {
    reasons.push(
      `localAbsoluteHits ${localAbsoluteHits} < ${SUFFICIENCY.minAbsoluteHits}`,
    );
  }
  if (hasKeywords && coreContextHits < SUFFICIENCY.minCoreContextHits) {
    reasons.push(
      `coreContextHits ${coreContextHits} < ${SUFFICIENCY.minCoreContextHits}`,
    );
  }
  if (!hasKeywords && topicCoverage < 0.34) {
    reasons.push(`topicCoverage ${topicCoverage.toFixed(2)} too low`);
  }
  // 次要观测（不阻断 enough，只记日志）
  if (topScore < SUFFICIENCY.minTopScore) {
    reasons.push(
      `(obs) rawTopScore ${topScore} < ${SUFFICIENCY.minTopScore}`,
    );
  }
  if (qualifiedCount < SUFFICIENCY.minQualifiedCount) {
    reasons.push(
      `(obs) qualifiedRaw60 ${qualifiedCount} < ${SUFFICIENCY.minQualifiedCount}`,
    );
  }

  const coverageOk = hasKeywords
    ? coreContextHits >= SUFFICIENCY.minCoreContextHits ||
      keywordCoverage >= 0.5 ||
      semanticCoverage >= 0.5
    : topicCoverage >= 0.34;

  const enough =
    localAbsoluteHits >= SUFFICIENCY.minAbsoluteHits && coverageOk;

  return {
    enough,
    localAbsoluteHits,
    topScore,
    qualifiedCount,
    topicCoverage,
    keywordCoverage,
    semanticCoverage,
    coreContextHits,
    keywordEvidenceHits,
    semanticStrongHits,
    reasons,
  };
}
