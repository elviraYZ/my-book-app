/**
 * 数据访问层（前端逻辑入口）
 *
 * 页面 / 组件请只从这里 import，不要直接依赖 `@/lib/mock-data`。
 * 设 NEXT_PUBLIC_DATA_SOURCE=api 时书目/探索/推荐候选池走 Supabase works（+代表版）。
 */

export { DATA_SOURCE, isMockMode } from "@/lib/data/config";

export { getProfile, saveProfile } from "@/lib/data/profile";
export type { SaveProfileInput } from "@/lib/data/profile";

export {
  listTopics,
  getTopic,
  getTopicBooks,
  createTopic,
  deleteTopic,
  updateTopic,
  syncTopicRecommendations,
} from "@/lib/data/topics";

export {
  EXPLORE_PAGE_SIZE,
  listExploreBooks,
  listExploreBooksPage,
  listExploreItems,
  getExploreFilters,
  getSuggestPrompts,
  EXPLORE_FILTER_OPTIONS,
  GENRE_FILTER_GROUPS,
  emptyExploreFilters,
  filterExploreBooks,
  countActiveFilters,
  getActiveFilterChips,
  toggleFilterValue,
  removeFilterValue,
  filtersToSearchParams,
  filtersFromSearchParams,
} from "@/lib/data/explore";
export type {
  ActiveFilterChip,
  ExploreBooksPage,
  ExploreFilterKey,
  GenreFilterGroup,
  GenreFilterOption,
} from "@/lib/data/explore";

export { setBookAction, getBookAction, listDislikedBookIds } from "@/lib/data/book-actions";

export {
  listBookmarks,
  getBookmark,
  saveBookmark,
  removeBookmark,
} from "@/lib/data/bookmarks";

export { getBook, getRelatedBooks } from "@/lib/data/books";

export {
  recommend,
  getLastRecommend,
  ensureContextTurns,
  hideBookFromLastRecommend,
} from "@/lib/data/recommend-client";

export {
  PROFILE_INTEREST_OPTIONS,
  mapInterestsToBookTags,
  rankByInterestTags,
  filterByExploreTagGate,
  takeRotatedSlice,
} from "@/lib/data/interest-map";

export {
  RECOMMEND_TAG_CATALOG,
  THEME_OPTIONS,
  PREFERENCE_OPTIONS,
  GOAL_OPTIONS,
  DEPTH_OPTIONS,
  DEPTH_DISPLAY,
  SESSION_OPTIONS,
  PURPOSE_OPTIONS,
  FILTER_SECTION_LABELS,
  sessionOptionLabel,
  depthOptionLabel,
  MAX_THEMES,
  MAX_PREFERENCES,
  MAX_KEYWORDS,
  MAX_GOALS,
  extractCatalogTagsFromText,
  extractCoreConditionsFromText,
  mapToCatalogTags,
  normalizeToCatalogTag,
  clampThemes,
  clampPreferences,
  clampKeywords,
  clampGoals,
  normalizeGoalSelection,
  normalizeGoalsSelection,
  searchCatalogTags,
} from "@/lib/data/recommend-tags";

/** Google Books 增量扩库请从 `@/lib/data/ingest` 引用（含 server 依赖，勿经本 barrel 进 Client） */