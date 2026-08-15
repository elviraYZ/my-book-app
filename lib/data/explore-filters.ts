import type { ExploreBook, ExploreFilters, ReadingDepth } from "@/lib/types";
import {
  DEPTH_OPTIONS,
  FILTER_SECTION_LABELS,
  PURPOSE_OPTIONS,
  SESSION_OPTIONS,
} from "@/lib/data/recommend-tags";

export type FilterOption = { value: string; label: string };

/** 探索题材筛选项：展示文案 + 映射到书库正式 taxonomy */
export type GenreFilterOption = FilterOption & {
  catalogTags: readonly string[];
};

export type GenreFilterGroup = {
  title: string;
  options: readonly GenreFilterOption[];
};

/**
 * 探索侧栏题材分组（岗位向）。
 * value 用于 URL / 勾选状态；catalogTags 用于匹配 book.tags。
 */
export const GENRE_FILTER_GROUPS: readonly GenreFilterGroup[] = [
  {
    title: "做设计",
    options: [
      { value: "玩法", label: "玩法", catalogTags: ["游戏设计"] },
      { value: "系统", label: "系统", catalogTags: ["游戏设计"] },
      { value: "关卡", label: "关卡", catalogTags: ["关卡设计", "游戏设计"] },
      { value: "数值", label: "数值", catalogTags: ["游戏设计"] },
      { value: "机制", label: "机制", catalogTags: ["游戏设计"] },
      { value: "叙事设计", label: "叙事设计", catalogTags: ["叙事", "游戏设计"] },
    ],
  },
  {
    title: "做内容",
    options: [
      { value: "文案", label: "文案", catalogTags: ["叙事"] },
      { value: "剧情", label: "剧情", catalogTags: ["叙事"] },
      { value: "角色", label: "角色", catalogTags: ["叙事", "美术"] },
      { value: "世界观", label: "世界观", catalogTags: ["叙事", "神话"] },
      { value: "任务", label: "任务", catalogTags: ["游戏设计", "叙事"] },
      {
        value: "文化与历史参考",
        label: "文化与历史参考",
        catalogTags: ["神话", "叙事", "建筑"],
      },
    ],
  },
  {
    title: "做视觉",
    options: [
      { value: "角色美术", label: "角色美术", catalogTags: ["美术"] },
      { value: "场景", label: "场景", catalogTags: ["美术", "建筑"] },
      { value: "美术设定", label: "美术设定", catalogTags: ["美术"] },
      { value: "建筑", label: "建筑", catalogTags: ["建筑"] },
      { value: "构图", label: "构图", catalogTags: ["美术"] },
      { value: "色彩", label: "色彩", catalogTags: ["美术"] },
      { value: "概念设计", label: "概念设计", catalogTags: ["美术"] },
    ],
  },
  {
    title: "做技术",
    options: [
      { value: "编程", label: "编程", catalogTags: ["编程"] },
      { value: "引擎", label: "引擎", catalogTags: ["编程", "图形渲染", "游戏设计"] },
      { value: "图形学", label: "图形学", catalogTags: ["图形渲染"] },
      { value: "AI", label: "AI", catalogTags: ["人工智能"] },
      { value: "渲染", label: "渲染", catalogTags: ["图形渲染"] },
      { value: "动画", label: "动画", catalogTags: ["美术", "图形渲染"] },
      { value: "技术美术", label: "技术美术", catalogTags: ["美术", "图形渲染", "编程"] },
    ],
  },
  {
    title: "做研究",
    options: [
      { value: "玩家研究", label: "玩家研究", catalogTags: ["交互体验", "心理学"] },
      { value: "UX/HCI", label: "UX/HCI", catalogTags: ["交互体验", "设计思维"] },
      { value: "心理学", label: "心理学", catalogTags: ["心理学"] },
      { value: "认知", label: "认知", catalogTags: ["心理学"] },
      { value: "用户研究", label: "用户研究", catalogTags: ["交互体验", "产品"] },
      { value: "数据分析", label: "数据分析", catalogTags: ["产品", "经济"] },
    ],
  },
  {
    title: "做管理",
    options: [
      { value: "制作", label: "制作", catalogTags: ["管理", "游戏设计"] },
      { value: "项目管理", label: "项目管理", catalogTags: ["管理"] },
      { value: "团队协作", label: "团队协作", catalogTags: ["管理"] },
      { value: "领导力", label: "领导力", catalogTags: ["管理"] },
      { value: "商业化", label: "商业化", catalogTags: ["经济", "产品", "管理"] },
    ],
  },
  {
    title: "找灵感",
    options: [
      { value: "神话", label: "神话", catalogTags: ["神话"] },
      { value: "历史", label: "历史", catalogTags: ["神话", "建筑", "叙事"] },
      { value: "社会学", label: "社会学", catalogTags: ["心理学", "设计思维"] },
      { value: "人类学", label: "人类学", catalogTags: ["心理学", "神话"] },
      { value: "科幻", label: "科幻", catalogTags: ["科幻"] },
      { value: "文学", label: "文学", catalogTags: ["叙事", "科幻", "悬疑"] },
      {
        value: "跨领域参考",
        label: "跨领域参考",
        catalogTags: ["设计思维", "建筑", "美术"],
      },
    ],
  },
] as const;

const GENRE_OPTION_BY_VALUE = new Map<string, GenreFilterOption>();
for (const group of GENRE_FILTER_GROUPS) {
  for (const opt of group.options) {
    GENRE_OPTION_BY_VALUE.set(opt.value, opt);
  }
}

/** 勾选值 → 书库 tags（兼容旧 URL 里直接写的 taxonomy） */
export function catalogTagsForGenreFilter(value: string): string[] {
  const opt = GENRE_OPTION_BY_VALUE.get(value);
  if (opt) return [...opt.catalogTags];
  return [value];
}

function genreMatchesBook(bookTags: string[], genreValue: string): boolean {
  const needles = catalogTagsForGenreFilter(genreValue);
  return needles.some((needle) =>
    bookTags.some((t) => t.includes(needle) || needle.includes(t)),
  );
}

export function genreGroupTitleForValue(value: string): string | null {
  for (const group of GENRE_FILTER_GROUPS) {
    if (group.options.some((o) => o.value === value)) return group.title;
  }
  return null;
}

/** 扁平选项（chips / URL / 兼容旧调用） */
export const EXPLORE_FILTER_OPTIONS = {
  genres: GENRE_FILTER_GROUPS.flatMap((g) =>
    g.options.map(({ value, label }) => ({ value, label })),
  ),
  purposes: PURPOSE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  times: SESSION_OPTIONS.filter((o) => o.value !== "").map((o) => ({
    value: o.value,
    label: o.label,
  })),
  difficulties: DEPTH_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  })),
} as const satisfies Record<string, FilterOption[]>;

export type ExploreFilterKey = keyof typeof EXPLORE_FILTER_OPTIONS;

const purposeTagMap: Record<string, string[]> = {
  solve: ["游戏设计", "关卡设计", "交互体验", "产品", "管理", "编程", "图形渲染"],
  learn: [
    "设计思维",
    "心理学",
    "建筑",
    "美术",
    "经济",
    "叙事",
    "编程",
    "人工智能",
    "图形渲染",
  ],
  inspire: ["科幻", "神话", "叙事", "设计思维", "美术", "人工智能"],
  relax: ["科幻", "悬疑", "神话", "叙事"],
};

function matchesTime(minutes: number | null | undefined, times: string[]) {
  if (times.length === 0) return true;
  if (minutes == null) return false;
  return times.some((time) => {
    if (time === "15") return minutes <= 15;
    if (time === "30") return minutes > 15 && minutes <= 30;
    if (time === "60") return minutes > 30 && minutes <= 60;
    if (time === "90") return minutes > 60;
    return false;
  });
}

function matchesPurpose(book: ExploreBook, purposes: string[]) {
  if (purposes.length === 0) return true;
  return purposes.some((purpose) => {
    const keywords = purposeTagMap[purpose] ?? [];
    const hit = keywords.some((k) =>
      book.tags.some((t) => t.includes(k) || k.includes(t)),
    );
    const styleHit =
      (purpose === "inspire" && book.content_style?.includes("inspiration")) ||
      (purpose === "solve" && book.content_style?.includes("case")) ||
      (purpose === "learn" &&
        (book.content_style?.includes("theory") ||
          book.content_style?.includes("method"))) ||
      (purpose === "relax" && book.content_style?.includes("inspiration"));
    return hit || styleHit;
  });
}

export function filterExploreBooks(
  books: ExploreBook[],
  filters: ExploreFilters,
): ExploreBook[] {
  const { genres, purposes, times, difficulties } = filters;

  return books.filter((book) => {
    if (
      genres.length > 0 &&
      !genres.some((genre) => genreMatchesBook(book.tags, genre))
    ) {
      return false;
    }
    if (!matchesPurpose(book, purposes)) return false;
    if (!matchesTime(book.reading_minutes, times)) return false;
    if (
      difficulties.length > 0 &&
      !difficulties.includes(book.difficulty as ReadingDepth)
    ) {
      return false;
    }
    return true;
  });
}

export function emptyExploreFilters(): ExploreFilters {
  return {
    genres: [],
    purposes: [],
    times: [],
    difficulties: [],
  };
}

export function countActiveFilters(filters: ExploreFilters) {
  return (
    filters.genres.length +
    filters.purposes.length +
    filters.times.length +
    filters.difficulties.length
  );
}

export function getFilterLabel(key: ExploreFilterKey, value: string) {
  return (
    EXPLORE_FILTER_OPTIONS[key].find((o) => o.value === value)?.label ?? value
  );
}

export type ActiveFilterChip = {
  key: ExploreFilterKey;
  value: string;
  label: string;
  group: string;
};

const groupTitles: Record<ExploreFilterKey, string> = {
  genres: "题材",
  purposes: FILTER_SECTION_LABELS.purposes,
  times: FILTER_SECTION_LABELS.times,
  difficulties: FILTER_SECTION_LABELS.difficulties,
};

export function getActiveFilterChips(
  filters: ExploreFilters,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  (Object.keys(EXPLORE_FILTER_OPTIONS) as ExploreFilterKey[]).forEach((key) => {
    for (const value of filters[key]) {
      chips.push({
        key,
        value,
        label: getFilterLabel(key, value),
        group:
          key === "genres"
            ? (genreGroupTitleForValue(value) ?? groupTitles.genres)
            : groupTitles[key],
      });
    }
  });
  return chips;
}

export function toggleFilterValue(
  filters: ExploreFilters,
  key: ExploreFilterKey,
  value: string,
): ExploreFilters {
  const current = filters[key];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return { ...filters, [key]: next };
}

export function removeFilterValue(
  filters: ExploreFilters,
  key: ExploreFilterKey,
  value: string,
): ExploreFilters {
  return {
    ...filters,
    [key]: filters[key].filter((v) => v !== value),
  };
}

/** URL: genres=a,b&purposes=c */
export function filtersToSearchParams(filters: ExploreFilters) {
  const qs = new URLSearchParams();
  (Object.keys(EXPLORE_FILTER_OPTIONS) as ExploreFilterKey[]).forEach((key) => {
    if (filters[key].length > 0) {
      qs.set(key, filters[key].join(","));
    }
  });
  return qs;
}

export function filtersFromSearchParams(
  params: URLSearchParams | null,
): ExploreFilters {
  const base = emptyExploreFilters();
  if (!params) return base;
  return {
    genres: params.get("genres")?.split(",").filter(Boolean) ?? [],
    purposes: params.get("purposes")?.split(",").filter(Boolean) ?? [],
    times: params.get("times")?.split(",").filter(Boolean) ?? [],
    difficulties: params.get("difficulties")?.split(",").filter(Boolean) ?? [],
  };
}
