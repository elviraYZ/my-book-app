/**
 * 推荐条件「偏离原始需求」UI 提示（纯规则，不调 LLM，不改评分）。
 */

import { clampThemes } from "@/lib/data/recommend-tags";

export const TOPIC_DRIFT_HINT =
  "当前条件与原始需求差异较大，推荐将以当前条件为准。";

/**
 * 原始核心主题全部被移除，且当前出现了其他核心主题 → 提示。
 * 仅比 themes；改关键词 / 难度 / 时间 / 偏好不触发。
 */
export function shouldWarnTopicDrift(
  initialTopics: string[] | null | undefined,
  currentTopics: string[] | null | undefined,
): boolean {
  const initial = clampThemes(initialTopics ?? []);
  const current = clampThemes(currentTopics ?? []);
  if (initial.length === 0) return false;

  const currentSet = new Set(current);
  const allInitialRemoved = initial.every((t) => !currentSet.has(t));
  if (!allInitialRemoved) return false;

  const initialSet = new Set(initial);
  return current.some((t) => !initialSet.has(t));
}
