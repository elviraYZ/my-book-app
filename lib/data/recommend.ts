/**
 * 推荐模块服务端入口（含 pipeline / LLM）。
 * 客户端请从 `@/lib/data/recommend-client` 或 `@/lib/data` 的 recommend/getLastRecommend 引用。
 */

import { mockStore } from "@/lib/data/mock-store";
import { runRecommendPipeline } from "@/lib/data/recommend/pipeline";
import type {
  RecommendRequest,
  RecommendResponse,
} from "@/lib/types";

export { runRecommendPipeline } from "@/lib/data/recommend/pipeline";
export type { RecommendPipelineOptions } from "@/lib/data/recommend/pipeline";
export { scoreCandidate, combineScores } from "@/lib/data/recommend/score";
export { enrichBookForScoring } from "@/lib/data/recommend/enrich";
export { isLocalSufficient } from "@/lib/data/recommend/sufficiency";
export { parseDemandContext } from "@/lib/data/recommend/parse-context";
export {
  parseDemandContextWithLLM,
  normalizeStructuredDemand,
  applyManualContextOverrides,
  isValidStructuredDemand,
} from "@/lib/data/recommend/parse-context-llm";
export type {
  DemandParseSource,
  ParseDemandResult,
} from "@/lib/data/recommend/parse-context-llm";

export {
  recommend,
  getLastRecommend,
  ensureContextTurns,
} from "@/lib/data/recommend-client";

/**
 * 本地 / mock 流水线（无外部补库）。
 * 带 Google 补库请在 Route Handler 调 runRecommendPipeline。
 */
export async function runMockRecommend(
  input: RecommendRequest,
): Promise<RecommendResponse> {
  const result = await runRecommendPipeline(input, { enableIngest: false });
  if (typeof window !== "undefined") {
    mockStore.saveLastRecommend(result);
  }
  return result;
}
