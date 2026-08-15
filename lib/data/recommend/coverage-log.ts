/**
 * 将 coverage gap 写入 Supabase（失败只打日志，不阻断推荐）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CoverageLogPayload } from "@/lib/data/recommend/coverage";

export async function persistCoverageLog(
  supabase: SupabaseClient | undefined,
  payload: CoverageLogPayload,
): Promise<void> {
  if (!supabase) return;
  try {
    const reasons = [...payload.reasons];
    if (payload.contextSpecificity) {
      reasons.push(`specificity:${payload.contextSpecificity}`);
    }
    if (payload.uiTip) {
      reasons.push(`uiTip:${payload.uiTip}`);
    }
    const { error } = await supabase.from("recommend_coverage_logs").insert({
      request_id: payload.requestId,
      prompt: payload.prompt,
      topics: payload.topics,
      keywords: payload.keywords,
      top_match: payload.topMatch,
      core_relevance: payload.coreRelevance,
      result_count: payload.resultCount,
      coverage_status: payload.coverageStatus,
      suggested_search_queries: payload.suggestedSearchQueries,
      high_match_count: payload.highMatchCount,
      reasons,
    });
    if (error) {
      console.warn("[coverage-log] insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[coverage-log] skipped:", err);
  }
}
