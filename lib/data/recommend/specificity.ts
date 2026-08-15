/**
 * Intent Specificity：主要看 explicit 信息。
 * inferred 不得把 LOW 抬成 HIGH。
 */

import {
  CONTEXT_SPECIFICITY,
  type ContextSpecificity,
} from "@/lib/data/recommend/weights";
import { isBroadExplicitQuery } from "@/lib/data/recommend/context-partition";
import type { StructuredDemandContext } from "@/lib/types";

const BROAD = new Set<string>(CONTEXT_SPECIFICITY.broadTopics);

/**
 * 只根据 explicit topic/keyword/goal/style（及原文长度信号）判定。
 */
export function evaluateContextSpecificity(
  demand: StructuredDemandContext,
  promptText = "",
): ContextSpecificity {
  const explicitTopics = demand.explicitTopics ?? [];
  const explicitKeywords = demand.explicitKeywords ?? [];
  // goal/styles：宽 query 分区后已清空非 explicit；此处用当前 demand 字段即可
  const explicitGoal = demand.goal?.trim() ?? "";
  const explicitStyles = demand.styles ?? [];

  if (
    isBroadExplicitQuery(
      promptText || demand.topics.join(""),
      explicitTopics.length > 0 ? explicitTopics : demand.topics,
      explicitKeywords,
      explicitGoal,
      explicitStyles,
    )
  ) {
    return "LOW";
  }

  let points = 0;

  if (explicitKeywords.length >= CONTEXT_SPECIFICITY.keywordHighMin) points += 3;
  else if (explicitKeywords.length >= CONTEXT_SPECIFICITY.keywordMediumMin)
    points += 2;
  else if (explicitKeywords.length === 1) points += 1;

  if (explicitTopics.length === 0) {
    if (explicitKeywords.length >= CONTEXT_SPECIFICITY.keywordMediumMin) {
      points += 1;
    }
  } else if (explicitTopics.length >= 2) {
    const allBroad = explicitTopics.every((t) => BROAD.has(t));
    points += allBroad ? 1 : 2;
  } else if (BROAD.has(explicitTopics[0]!)) {
    points += 0;
  } else {
    points += 2;
  }

  if (explicitGoal) points += 1;
  if (explicitStyles.length > 0) points += 1;
  if (demand.difficulty != null || demand.time != null) points += 1;

  // 不用 inferred，也不用被补高的 intentConfidence 抬档
  if (points <= 1) return "LOW";
  if (points >= 5) return "HIGH";
  return "MEDIUM";
}
