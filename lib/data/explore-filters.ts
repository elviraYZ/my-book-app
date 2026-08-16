import type { ExploreBook, ExploreFilters, ReadingDepth } from "@/lib/types";
import { GENRE_TAG_WHITELIST } from "@/lib/data/book-tags";
import {
  DEPTH_OPTIONS,
  FILTER_SECTION_LABELS,
  PURPOSE_OPTIONS,
  SESSION_OPTIONS,
} from "@/lib/data/recommend-tags";

export type FilterOption = { value: string; label: string };

/** 探索题材筛选项：value/label 即书库正式题材（白名单） */
export type GenreFilterOption = FilterOption & {
  /** 匹配 book.tags；MVP 与 value 一致 */
  catalogTags: readonly string[];
};

export type GenreFilterGroup = {
  title: string;
  options: readonly GenreFilterOption[];
};

function tagOpt(tag: (typeof GENRE_TAG_WHITELIST)[number]): GenreFilterOption {
  return { value: tag, label: tag, catalogTags: [tag] };
}

/**
 * 探索侧栏题材：按使用场景分组，每项直接对应正式白名单（无假精细别名）。
 * 细粒度词留给 concepts / AI 搜索。
 */
export const GENRE_FILTER_GROUPS: readonly GenreFilterGroup[] = [
  {
    title: "做设计",
    options: [
      tagOpt("游戏设计"),
      tagOpt("关卡设计"),
      tagOpt("交互体验"),
      tagOpt("设计思维"),
    ],
  },
  {
    title: "做内容",
    options: [
      tagOpt("叙事"),
      tagOpt("神话"),
      tagOpt("科幻"),
      tagOpt("悬疑"),
    ],
  },
  {
    title: "做视觉",
    options: [tagOpt("美术"), tagOpt("建筑")],
  },
  {
    title: "做技术",
    options: [tagOpt("编程"), tagOpt("人工智能"), tagOpt("图形渲染")],
  },
  {
    title: "做研究",
    options: [tagOpt("心理学"), tagOpt("经济"), tagOpt("产品")],
  },
  {
    title: "做管理",
    options: [tagOpt("管理")],
  },
] as const;

/**
 * 旧版 UI 别名 → 正式题材（兼容 URL ?genres=玩法,AI）
 */
const LEGACY_GENRE_ALIASES: Record<string, string> = {
  玩法: "游戏设计",
  系统: "游戏设计",
  数值: "游戏设计",
  机制: "游戏设计",
  关卡: "关卡设计",
  叙事设计: "叙事",
  文案: "叙事",
  剧情: "叙事",
  角色: "叙事",
  世界观: "叙事",
  任务: "游戏设计",
  文化与历史参考: "神话",
  角色美术: "美术",
  场景: "美术",
  美术设定: "美术",
  构图: "美术",
  色彩: "美术",
  概念设计: "美术",
  引擎: "编程",
  图形学: "图形渲染",
  AI: "人工智能",
  渲染: "图形渲染",
  动画: "美术",
  技术美术: "美术",
  玩家研究: "交互体验",
  "UX/HCI": "交互体验",
  认知: "心理学",
  用户研究: "交互体验",
  数据分析: "产品",
  制作: "管理",
  项目管理: "管理",
  团队协作: "管理",
  领导力: "管理",
  商业化: "经济",
  历史: "神话",
  社会学: "心理学",
  人类学: "心理学",
  文学: "叙事",
  跨领域参考: "设计思维",
};

const GENRE_OPTION_BY_VALUE = new Map<string, GenreFilterOption>();
for (const group of GENRE_FILTER_GROUPS) {
  for (const opt of group.options) {
    GENRE_OPTION_BY_VALUE.set(opt.value, opt);
  }
}

const WHITELIST_SET = new Set<string>(GENRE_TAG_WHITELIST);

/** 规范化题材筛选取值（别名 → 白名单；去重） */
export function normalizeGenreFilterValues(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const mapped = LEGACY_GENRE_ALIASES[v] ?? v;
    if (!WHITELIST_SET.has(mapped) && !GENRE_OPTION_BY_VALUE.has(mapped)) {
      continue;
    }
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    out.push(mapped);
  }
  return out;
}

/** 勾选值 → 书库 tags */
export function catalogTagsForGenreFilter(value: string): string[] {
  const normalized = LEGACY_GENRE_ALIASES[value] ?? value;
  const opt = GENRE_OPTION_BY_VALUE.get(normalized);
  if (opt) return [...opt.catalogTags];
  if (WHITELIST_SET.has(normalized)) return [normalized];
  return [value];
}

function genreMatchesBook(bookTags: string[], genreValue: string): boolean {
  const needles = catalogTagsForGenreFilter(genreValue);
  return needles.some((needle) =>
    bookTags.some((t) => t.includes(needle) || needle.includes(t)),
  );
}

export function genreGroupTitleForValue(value: string): string | null {
  const normalized = LEGACY_GENRE_ALIASES[value] ?? value;
  for (const group of GENRE_FILTER_GROUPS) {
    if (group.options.some((o) => o.value === normalized)) return group.title;
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
  const normalized =
    key === "genres" ? (LEGACY_GENRE_ALIASES[value] ?? value) : value;
  return (
    EXPLORE_FILTER_OPTIONS[key].find((o) => o.value === normalized)?.label ??
    normalized
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
      const displayValue =
        key === "genres" ? (LEGACY_GENRE_ALIASES[value] ?? value) : value;
      chips.push({
        key,
        value: displayValue,
        label: getFilterLabel(key, displayValue),
        group:
          key === "genres"
            ? (genreGroupTitleForValue(displayValue) ?? groupTitles.genres)
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
    const values =
      key === "genres"
        ? normalizeGenreFilterValues(filters[key])
        : filters[key];
    if (values.length > 0) {
      qs.set(key, values.join(","));
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
    genres: normalizeGenreFilterValues(
      params.get("genres")?.split(",").filter(Boolean) ?? [],
    ),
    purposes: params.get("purposes")?.split(",").filter(Boolean) ?? [],
    times: params.get("times")?.split(",").filter(Boolean) ?? [],
    difficulties: params.get("difficulties")?.split(",").filter(Boolean) ?? [],
  };
}
