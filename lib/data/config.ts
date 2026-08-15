/**
 * 数据源开关。
 * - mock：本地假数据 / localStorage
 * - api：Supabase（Auth、profiles、topics、bookmarks、works 目录）；
 *       推荐判定仍为本地打分（候选池来自 works + 代表版）
 *
 * 切换：.env.local 中 NEXT_PUBLIC_DATA_SOURCE=api|mock
 */
export type DataSource = "mock" | "api";

export const DATA_SOURCE: DataSource =
  process.env.NEXT_PUBLIC_DATA_SOURCE === "api" ? "api" : "mock";

export function isMockMode() {
  return DATA_SOURCE === "mock";
}
