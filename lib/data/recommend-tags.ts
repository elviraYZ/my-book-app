import { GENRE_TAG_WHITELIST, type GenreTag } from "@/lib/data/book-tags";
import {
  extractNegativeConstraints,
  maskNegativeSpans,
  stripExcludedFromTopics,
} from "@/lib/data/recommend/negative-constraints";
import type { ReadingDepth } from "@/lib/types";

/** MVP：可见条件上限 */
export const MAX_THEMES = 3;
export const MAX_PREFERENCES = 3;
export const MAX_KEYWORDS = 8;
export const MAX_GOALS = 3;

export const GOAL_OPTIONS = [
  "工作调研",
  "系统学习",
  "找灵感",
  "快速入门",
  "休闲阅读",
] as const;

const GOAL_SET = new Set<string>(GOAL_OPTIONS);

export function clampGoals(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const x = t.trim();
    if (!x || !GOAL_SET.has(x) || out.includes(x)) continue;
    out.push(x);
    if (out.length >= MAX_GOALS) break;
  }
  return out;
}

/** 仅合法枚举；可多选 */
export function normalizeGoalSelection(
  goal: string | null | undefined,
): string {
  const g = goal?.trim() ?? "";
  if (!g || !GOAL_SET.has(g)) return "";
  return g;
}

export function normalizeGoalsSelection(
  goals: string[] | string | null | undefined,
): string[] {
  if (goals == null) return [];
  if (typeof goals === "string") {
    const g = normalizeGoalSelection(goals);
    return g ? [g] : [];
  }
  return clampGoals(goals);
}

/**
 * 正式主题 = 书库题材白名单（canonical taxonomy）。
 * 「空间引导」等具体关注点不在此列，应进 keywords。
 */
export const THEME_OPTIONS = GENRE_TAG_WHITELIST;

/** 内容偏好（含负向：少理论） */
export const PREFERENCE_OPTIONS = [
  "案例优先",
  "理论优先",
  "少理论",
  "跨领域",
  "实操",
] as const;

export const DEPTH_OPTIONS: { value: ReadingDepth; label: string }[] = [
  { value: "light", label: "轻松翻翻" },
  { value: "medium", label: "认真读读" },
  { value: "deep", label: "啃一啃" },
];

/** 全站统一展示（与 DEPTH_OPTIONS.label 一致） */
export const DEPTH_DISPLAY: Record<ReadingDepth, string> = {
  light: "轻松翻翻",
  medium: "认真读读",
  deep: "啃一啃",
};

/**
 * 可用时间分档（与探索筛选 / Context.session_bucket 一致）。
 * value "" = 不限（编辑器用）。
 */
export const SESSION_OPTIONS: { value: string; label: string }[] = [
  { value: "15", label: "≤ 15 分钟" },
  { value: "30", label: "15–30 分钟" },
  { value: "60", label: "30–60 分钟" },
  { value: "90", label: "1 小时以上" },
  { value: "", label: "不限" },
];

/** 阅读目的（画像 reading_purposes / 探索 purposes 共用 value） */
export const PURPOSE_OPTIONS: { value: string; label: string }[] = [
  { value: "solve", label: "解决问题" },
  { value: "learn", label: "学习提升" },
  { value: "inspire", label: "寻找灵感" },
  { value: "relax", label: "休闲放松" },
];

/** 筛选区块标题（探索侧栏 / 专题筛选等） */
export const FILTER_SECTION_LABELS = {
  purposes: "阅读目的",
  times: "可用时间",
  difficulties: "阅读投入",
} as const;

export function sessionOptionLabel(bucket: string): string {
  return (
    SESSION_OPTIONS.find((o) => o.value === bucket)?.label ??
    (bucket ? bucket : "不限")
  );
}

export function depthOptionLabel(depth: ReadingDepth | "" | null): string {
  if (!depth) return "不限";
  return DEPTH_DISPLAY[depth] ?? depth;
}

const THEME_SET = new Set<string>(THEME_OPTIONS);
const PREF_SET = new Set<string>(PREFERENCE_OPTIONS);

/** 口语 → 正式题材 */
const THEME_ALIASES: Record<string, GenreTag> = {
  关卡: "关卡设计",
  游戏: "游戏设计",
  美术: "美术",
  编程: "编程",
  程序: "编程",
  AI: "人工智能",
  人工: "人工智能",
  叙事: "叙事",
  剧情: "叙事",
  建筑: "建筑",
  心理: "心理学",
  产品: "产品",
  管理: "管理",
  渲染: "图形渲染",
  交互: "交互体验",
  UX: "交互体验",
};

const PREF_ALIASES: Record<string, string> = {
  案例: "案例优先",
  实操: "实操",
  实践: "实操",
  动手: "实操",
  跨界: "跨领域",
};

/** 非白名单、但常作「本次关注」的词 */
const KEYWORD_HINTS = [
  "空间引导",
  "玩家导航",
  "玩家体验",
  "系统设计",
  "森林",
  "地标",
  "迷路",
  "导航",
  "引导",
  "开放世界",
  "关卡结构",
  "手感",
  "反馈",
] as const;

function matchFromPool(
  text: string,
  pool: readonly string[],
  aliases: Record<string, string>,
  limit: number,
): string[] {
  const source = text.trim();
  if (!source) return [];
  const found: string[] = [];
  const push = (tag: string) => {
    if (!found.includes(tag) && found.length < limit) found.push(tag);
  };
  for (const tag of pool) {
    if (source.includes(tag)) push(tag);
  }
  for (const [alias, tag] of Object.entries(aliases)) {
    if (source.includes(alias)) push(tag);
  }
  return found;
}

export type CoreRecommendConditions = {
  themes: string[];
  keywords: string[];
  preferences: string[];
  depth: ReadingDepth | null;
  session_bucket: string | null;
  /** @deprecated 用 goals[0]；保留兼容 */
  goal: string | null;
  /** 原文中明确提到的阅读目标（可多选） */
  goals: string[];
  excludedTopics: string[];
  excludedKeywords: string[];
  excludedConcepts: string[];
};

/**
 * 规则解析：topics 仅白名单；keywords 自由；负向「不要太理论」→ 少理论（不是理论优先）。
 * 「除了X以外 / 不要X」等 → excluded*，且 X 不会进入正向 themes。
 */
export function extractCoreConditionsFromText(
  text: string,
): CoreRecommendConditions {
  const source = text.trim();
  const negatives = extractNegativeConstraints(source);
  const positiveSource = maskNegativeSpans(source);

  // 负向理论必须先于「理论」正向别名（在全文检测，含「不要太理论」）
  const avoidTheory = /不要\s*太?\s*理论|别\s*太?\s*理论|少\s*理论|轻\s*理论|拒\s*理论/.test(
    source,
  );
  const wantTheory =
    !avoidTheory && /理论优先|偏理论|要理论|理论向/.test(positiveSource);

  const themes = stripExcludedFromTopics(
    matchFromPool(positiveSource, THEME_OPTIONS, THEME_ALIASES, MAX_THEMES),
    negatives.excludedTopics,
  );

  const preferences: string[] = [];
  if (avoidTheory) preferences.push("少理论");
  if (wantTheory) preferences.push("理论优先");
  for (const tag of matchFromPool(
    positiveSource,
    PREFERENCE_OPTIONS.filter((p) => p !== "理论优先" && p !== "少理论"),
    PREF_ALIASES,
    MAX_PREFERENCES,
  )) {
    if (!preferences.includes(tag) && preferences.length < MAX_PREFERENCES) {
      preferences.push(tag);
    }
  }

  const keywords: string[] = [];
  const banKw = new Set([
    ...negatives.excludedTopics,
    ...negatives.excludedKeywords,
    ...negatives.excludedConcepts,
  ]);
  const pushKw = (k: string) => {
    const t = k.trim();
    if (!t || themes.includes(t) || keywords.includes(t) || banKw.has(t)) return;
    if (keywords.length < MAX_KEYWORDS) keywords.push(t);
  };
  for (const hint of KEYWORD_HINTS) {
    if (positiveSource.includes(hint)) pushKw(hint);
  }
  if (/森林/.test(positiveSource)) pushKw("森林");
  if (/地标/.test(positiveSource)) pushKw("地标");
  if (/迷路/.test(positiveSource)) pushKw("迷路");

  let depth: ReadingDepth | null = null;
  if (/入门|轻松|翻翻|浅/.test(positiveSource)) depth = "light";
  else if (/深入|啃|硬核/.test(positiveSource)) depth = "deep";
  else if (/中等|认真|系统学/.test(positiveSource)) depth = "medium";

  let session_bucket: string | null = null;
  if (/15\s*[-–~到至]?\s*30|半小时内|20\s*分钟/.test(positiveSource)) {
    session_bucket = "30";
  } else if (/30\s*[-–~到至]?\s*60|一小时|45\s*分钟/.test(positiveSource)) {
    session_bucket = "60";
  }

  const goals: string[] = [];
  const pushGoal = (g: string) => {
    if (!goals.includes(g) && goals.length < MAX_GOALS) goals.push(g);
  };
  if (/工作调研|调研|查资料/.test(positiveSource)) pushGoal("工作调研");
  if (/找灵感|灵感|找创意/.test(positiveSource)) pushGoal("找灵感");
  if (/快速入门|上手/.test(positiveSource)) pushGoal("快速入门");
  if (/系统学习|系统学/.test(positiveSource)) pushGoal("系统学习");
  if (/休闲阅读|休闲读|轻松读/.test(positiveSource)) pushGoal("休闲阅读");

  const goal = goals[0] ?? null;

  return {
    themes,
    keywords,
    preferences,
    depth,
    session_bucket,
    goal,
    goals,
    excludedTopics: negatives.excludedTopics,
    excludedKeywords: negatives.excludedKeywords,
    excludedConcepts: negatives.excludedConcepts,
  };
}

/**
 * 去掉需求口语壳（我想了解 / 帮我找 / 推荐…），露出核心短语。
 */
export function stripPromptShell(text: string): string {
  let t = text.trim().replace(/[。！？.!?]+$/g, "");
  t = t.replace(
    /^(我想要?|我要|帮我|请你?|麻烦你?)(了解一下|了解下|了解|知道|学习|调研|看看|找几本|找一些|找一下|找|搜一下|搜索|推荐一下|推荐)?[：:\s]*/u,
    "",
  );
  t = t.replace(
    /^(了解一下|了解下|了解|知道|学习|调研|看看|找几本|找一些|找一下|推荐一下|推荐|搜索|有没有)[：:\s]*/u,
    "",
  );
  t = t.replace(/^(关于|有关|针对)[：:\s]*/u, "");
  return t.trim();
}

/** 整句需求 / 口语壳 / 动词意图句，不应作为 keyword 标签 */
export function isPromptLikeKeyword(k: string): boolean {
  const t = k.trim();
  if (!t) return true;
  if (/我想|我要|帮我|请你?推荐|请帮|麻烦/.test(t)) return true;
  if (/了解[：:]|推荐[：:]|找书[：:]/.test(t)) return true;
  if (/[：:]/.test(t) && /(想|了解|推荐|找|搜)/.test(t)) return true;
  // 「研究…做…」「用于…」「如何…」等整句意图，交给 LLM 拆词
  if (/研究|用于|如何|怎样|怎么|辅助|帮我|做成|作为/.test(t) && t.length >= 8) {
    return true;
  }
  // 含多个动词/动宾结构的长串（无分隔仍可能是整句）
  if (t.length >= 10 && /[做为来去把被让给]/.test(t)) return true;
  return false;
}

/**
 * 仅极短名词可作 seed（如「狗狗」）；句子 / 意图短语一律 null，交给 LLM。
 * @deprecated 推荐主路径勿再自动 seed；保留给极短兜底场景。
 */
export function seedKeywordFromPrompt(text: string): string | null {
  const raw = text.trim();
  if (!raw || raw.length > 12) return null;

  const stripped = stripPromptShell(raw);
  if (!stripped) return null;
  if (isPromptLikeKeyword(stripped)) return null;
  if (THEME_SET.has(stripped)) return null;

  if (/[，。,.、；;\s]/.test(stripped)) return null;
  // 仅允许很短的名词标签
  if (stripped.length > 6) return null;

  return stripped.slice(0, 12);
}

export function clampThemes(tags: string[]): string[] {
  return tags.filter((t) => THEME_SET.has(t)).slice(0, MAX_THEMES);
}

export function clampPreferences(tags: string[]): string[] {
  return tags.filter((t) => PREF_SET.has(t)).slice(0, MAX_PREFERENCES);
}

export function clampKeywords(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().slice(0, 24);
    if (!t || THEME_SET.has(t) || out.includes(t)) continue;
    if (isPromptLikeKeyword(t)) continue;
    out.push(t);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/** @deprecated 兼容旧调用；请用 extractCoreConditionsFromText */
export function extractCatalogTagsFromText(text: string): string[] {
  const { themes, preferences } = extractCoreConditionsFromText(text);
  return [...themes, ...preferences];
}

/** @deprecated 兼容；仅映射主题+偏好白名单 */
export function mapToCatalogTags(rawTags: string[]): string[] {
  const themes = clampThemes(rawTags);
  const prefs = clampPreferences(rawTags);
  return [...themes, ...prefs];
}

export function normalizeToCatalogTag(raw: string): string | null {
  const t = raw.trim();
  if (THEME_SET.has(t) || PREF_SET.has(t)) return t;
  if (THEME_ALIASES[t]) return THEME_ALIASES[t];
  if (PREF_ALIASES[t]) return PREF_ALIASES[t];
  return null;
}

/** 扁平列表仅用于兼容旧 import */
export const RECOMMEND_TAG_CATALOG: string[] = [
  ...THEME_OPTIONS,
  ...PREFERENCE_OPTIONS,
];

export function searchCatalogTags(query: string, exclude: string[] = []) {
  const q = query.trim().toLowerCase();
  const excluded = new Set(exclude);
  const pool = RECOMMEND_TAG_CATALOG.filter((t) => !excluded.has(t));
  if (!q) return pool.slice(0, 8);
  return pool.filter((t) => t.toLowerCase().includes(q)).slice(0, 8);
}
