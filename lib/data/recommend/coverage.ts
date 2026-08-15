/**
 * Coverage Gap Logging + 前台 tip 判定。
 * Match / Coverage / Specificity 三分开。
 */

import {
  COVERAGE,
  COVERAGE_TIP,
  REFINEMENT_TIP,
  type CoverageStatus,
  type ContextSpecificity,
  type UiTipKind,
} from "@/lib/data/recommend/weights";
import type { DimensionScores, StructuredDemandContext } from "@/lib/types";
import type { Book } from "@/lib/types";

export type ScoredRowLike = {
  book: Book;
  scores: DimensionScores;
};

export type CoverageResult = {
  status: CoverageStatus;
  admittedCount: number;
  highMatchCount: number;
  topContextMatch: number;
  topCoreRelevance: number;
  reasons: string[];
};

function contextMatch(scores: DimensionScores): number {
  return scores.contextMatchScore ?? scores.matchScore ?? 0;
}

function coreRel(scores: DimensionScores): number {
  return scores.coreRelevance ?? 0;
}

/**
 * GOOD / THIN / GAP — 仅后台 logging。
 */
export function evaluateCoverage(
  rows: ScoredRowLike[],
  specificity: ContextSpecificity = "MEDIUM",
): CoverageResult {
  const admittedCount = rows.length;
  const topContextMatch = rows[0] ? contextMatch(rows[0].scores) : 0;
  const topCoreRelevance = rows[0] ? coreRel(rows[0].scores) : 0;
  const highMatchCount = rows.filter(
    (r) => contextMatch(r.scores) >= COVERAGE.lowMatchThreshold,
  ).length;

  const reasons: string[] = [];
  const scores = rows.map((r) => contextMatch(r.scores));

  if (admittedCount === 0) {
    reasons.push("admittedCount 0");
    return {
      status: "GAP",
      admittedCount,
      highMatchCount,
      topContextMatch,
      topCoreRelevance,
      reasons,
    };
  }

  const displayable = rows.filter((r) => isDisplayableRow(r, specificity));
  if (displayable.length === 0) {
    reasons.push("no_displayable_above_floor");
    return {
      status: "GAP",
      admittedCount,
      highMatchCount,
      topContextMatch,
      topCoreRelevance,
      reasons,
    };
  }

  if (isCoverageGapByScores(scores) && specificity !== "LOW") {
    if (topContextMatch < COVERAGE_TIP.top1Below) {
      reasons.push(
        `top1 ${topContextMatch} < ${COVERAGE_TIP.top1Below}`,
      );
    }
    const top = scores.slice(0, COVERAGE_TIP.topN);
    const avg = top.reduce((a, b) => a + b, 0) / top.length;
    if (avg < COVERAGE_TIP.topAvgBelow) {
      reasons.push(
        `top${top.length}Avg ${avg.toFixed(1)} < ${COVERAGE_TIP.topAvgBelow}`,
      );
    }
    return {
      status: "GAP",
      admittedCount,
      highMatchCount,
      topContextMatch,
      topCoreRelevance,
      reasons,
    };
  }

  const good =
    topContextMatch >= COVERAGE.minGoodTopScore &&
    topCoreRelevance >= COVERAGE.minGoodTopCoreRelevance &&
    highMatchCount >= COVERAGE.minGoodHighMatchCount;

  if (good) {
    return {
      status: "GOOD",
      admittedCount,
      highMatchCount,
      topContextMatch,
      topCoreRelevance,
      reasons: [],
    };
  }

  return {
    status: "THIN",
    admittedCount,
    highMatchCount,
    topContextMatch,
    topCoreRelevance,
    reasons: specificity === "LOW" ? ["broad_query"] : ["top_ok_but_not_full_good"],
  };
}

export function isDisplayableRow(
  row: ScoredRowLike,
  specificity: ContextSpecificity = "MEDIUM",
): boolean {
  return displayRejectReason(row, specificity) == null;
}

export type DisplayRejectReason = "match_below" | "core_below";

/** 展示过滤原因（admitted → displayable）；null = 可通过 */
export function displayRejectReason(
  row: ScoredRowLike,
  specificity: ContextSpecificity = "MEDIUM",
): DisplayRejectReason | null {
  const match = contextMatch(row.scores);
  const core = coreRel(row.scores);
  const minMatch =
    specificity === "LOW"
      ? COVERAGE.minDisplayContextMatchBroad
      : COVERAGE.minDisplayContextMatch;
  const minCore =
    specificity === "LOW"
      ? COVERAGE.minDisplayCoreRelevanceBroad
      : COVERAGE.minDisplayCoreRelevance;
  if (match < minMatch) return "match_below";
  if (core < minCore) return "core_below";
  return null;
}

/** Top1 过低或 TopN 均分过低 → Coverage Gap */
export function isCoverageGapByScores(matchScores: number[]): boolean {
  if (matchScores.length === 0) return true;
  const top1 = matchScores[0] ?? 0;
  if (top1 < COVERAGE_TIP.top1Below) return true;
  const top = matchScores.slice(0, COVERAGE_TIP.topN);
  const avg = top.reduce((a, b) => a + b, 0) / top.length;
  return avg < COVERAGE_TIP.topAvgBelow;
}

/**
 * - LOW + 有结果 → refinement（不报 gap）
 * - 具体需求下 Top 质量不足 → coverage_gap
 */
export function resolveUiTip(
  matchScores: number[],
  specificity: ContextSpecificity,
): UiTipKind {
  if (specificity === "LOW") {
    if (matchScores.length === 0) return "coverage_gap";
    return "refinement";
  }

  if (isCoverageGapByScores(matchScores)) return "coverage_gap";
  return "none";
}

/** @deprecated */
export function shouldShowCoverageTip(matchScores: number[]): boolean {
  return isCoverageGapByScores(matchScores);
}

export type CoverageLogPayload = {
  requestId: string;
  prompt: string;
  topics: string[];
  keywords: string[];
  topMatch: number;
  coreRelevance: number;
  resultCount: number;
  coverageStatus: CoverageStatus;
  suggestedSearchQueries: string[];
  highMatchCount: number;
  reasons: string[];
  contextSpecificity?: ContextSpecificity;
  uiTip?: UiTipKind;
};

export function buildCoverageLogPayload(
  requestId: string,
  prompt: string,
  demand: StructuredDemandContext,
  coverage: CoverageResult,
  extra?: {
    contextSpecificity?: ContextSpecificity;
    uiTip?: UiTipKind;
  },
): CoverageLogPayload {
  return {
    requestId,
    prompt,
    topics: demand.topics ?? [],
    keywords: demand.keywords ?? [],
    topMatch: coverage.topContextMatch,
    coreRelevance: coverage.topCoreRelevance,
    resultCount: coverage.admittedCount,
    coverageStatus: coverage.status,
    suggestedSearchQueries: demand.searchQueries ?? [],
    highMatchCount: coverage.highMatchCount,
    reasons: coverage.reasons,
    contextSpecificity: extra?.contextSpecificity,
    uiTip: extra?.uiTip,
  };
}
