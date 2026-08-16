import {
  bookToExploreBook,
  listCatalogBooksPage,
} from "@/lib/data/catalog";
import {
  catalogTagsForGenreFilter,
  emptyExploreFilters,
  filterExploreBooks,
} from "@/lib/data/explore-filters";
import { rankByInterestTags, filterByExploreTagGate } from "@/lib/data/interest-map";
import { mockStore } from "@/lib/data/mock-store";
import type { ExploreBook, ExploreFilters, ExploreItem } from "@/lib/types";

export {
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
} from "@/lib/data/explore-filters";
export type {
  ActiveFilterChip,
  ExploreFilterKey,
  GenreFilterGroup,
  GenreFilterOption,
} from "@/lib/data/explore-filters";

/** 探索页每批条数（网格约 3×12） */
export const EXPLORE_PAGE_SIZE = 36;

export type ExploreBooksPage = {
  books: ExploreBook[];
  nextOffset: number;
  hasMore: boolean;
};

function genreTagsFromFilters(genres: string[]): string[] {
  const tags = new Set<string>();
  for (const genre of genres) {
    for (const tag of catalogTagsForGenreFilter(genre)) {
      tags.add(tag);
    }
  }
  return [...tags];
}

/**
 * 探索分页。
 * - 侧栏勾了题材 → 按题材查
 * - 否则有画像兴趣标签 → 只出 topics 命中这些标签的书（避免「最新入库」全是编程）
 * - 用途/时长/难度在内存过滤，不足时多拉几页补齐
 */
export async function listExploreBooksPage(options: {
  filters?: ExploreFilters;
  offset?: number;
  limit?: number;
  /** 画像兴趣映射后的书目标签；无侧栏题材时用于 DB 偏好 */
  interestTags?: string[];
} = {}): Promise<ExploreBooksPage> {
  const filters = options.filters ?? emptyExploreFilters();
  const interestTags = [...new Set((options.interestTags ?? []).filter(Boolean))];
  const limit = Math.min(
    Math.max(1, options.limit ?? EXPLORE_PAGE_SIZE),
    100,
  );
  let cursor = Math.max(0, options.offset ?? 0);

  const genreTags = genreTagsFromFilters(filters.genres);
  /** 显式筛选优先；否则用画像兴趣收窄候选池 */
  const dbTags =
    genreTags.length > 0
      ? genreTags
      : interestTags.length > 0
        ? interestTags
        : [];
  /** 门禁：画像 ∪ 侧栏题材；未点「编程」则滤掉带编程标签的书 */
  const gateTags = [...new Set([...interestTags, ...genreTags])];

  const needsPostFilter =
    filters.purposes.length > 0 ||
    filters.times.length > 0 ||
    filters.difficulties.length > 0;

  const collected: ExploreBook[] = [];
  let dbHasMore = true;
  let rounds = 0;
  const chunkSize = needsPostFilter || gateTags.length > 0
    ? Math.max(limit * 2, 48)
    : limit;

  while (collected.length < limit && dbHasMore && rounds < 8) {
    rounds += 1;
    const catalogPage = await listCatalogBooksPage({
      offset: cursor,
      limit: chunkSize,
      genreTags: dbTags.length > 0 ? dbTags : undefined,
    });
    let filtered = filterExploreBooks(
      catalogPage.books.map(bookToExploreBook),
      filters,
    );
    if (gateTags.length > 0) {
      filtered = filterByExploreTagGate(filtered, gateTags);
    }
    collected.push(...filtered);
    cursor = catalogPage.nextOffset;
    dbHasMore = catalogPage.hasMore;
  }

  const books = rankByInterestTags(
    collected.slice(0, limit),
    interestTags,
  );
  return {
    books,
    nextOffset: cursor,
    hasMore: dbHasMore || collected.length > limit,
  };
}

/** 首页预览等：只取一页，勿再拉全库 */
export async function listExploreBooks(
  filters: ExploreFilters = emptyExploreFilters(),
  limit = EXPLORE_PAGE_SIZE,
): Promise<ExploreBook[]> {
  const page = await listExploreBooksPage({ filters, offset: 0, limit });
  return page.books;
}

export async function listExploreItems(): Promise<ExploreItem[]> {
  return [...mockStore.constants.exploreItems];
}

export function getSuggestPrompts(): readonly string[] {
  return mockStore.constants.suggestPrompts;
}

/** @deprecated 使用 EXPLORE_FILTER_OPTIONS */
export function getExploreFilters(): readonly string[] {
  return mockStore.constants.exploreFilters;
}
