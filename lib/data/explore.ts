import {
  bookToExploreBook,
  listCatalogBooks,
} from "@/lib/data/catalog";
import {
  emptyExploreFilters,
  filterExploreBooks,
} from "@/lib/data/explore-filters";
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

export async function listExploreBooks(
  filters: ExploreFilters = emptyExploreFilters(),
): Promise<ExploreBook[]> {
  const catalog = await listCatalogBooks();
  const books = catalog.map(bookToExploreBook);
  return filterExploreBooks(books, filters);
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
