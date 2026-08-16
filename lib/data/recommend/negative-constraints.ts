/**
 * Query-time negative constraints（排除条件）。
 * 只影响 Context 解析与候选过滤/排序，不改书籍 metadata / embedding / enrichment。
 */

import { GENRE_TAG_WHITELIST, type GenreTag } from "@/lib/data/book-tags";
import type { Book, StructuredDemandContext } from "@/lib/types";

const TAXONOMY = GENRE_TAG_WHITELIST;

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

/** 常见自由排除词（非 taxonomy） */
const CONCEPT_HINTS = [
  "空间引导",
  "玩家导航",
  "系统设计",
  "数值",
  "玩法",
  "引擎",
  "小说",
  "英文",
  "英语",
] as const;

export type NegativeConstraints = {
  excludedTopics: string[];
  excludedKeywords: string[];
  excludedConcepts: string[];
  /** 原文中被判定为否定的片段（用于正向抽取时 mask） */
  negativeSpans: string[];
};

function uniq(items: string[]): string[] {
  const out: string[] = [];
  for (const x of items) {
    const t = x.trim();
    if (!t || out.includes(t)) continue;
    out.push(t);
  }
  return out;
}

function pushTopic(out: string[], raw: string) {
  const s = raw.trim();
  if (!s) return;
  for (const tag of TAXONOMY) {
    if (s.includes(tag) && !out.includes(tag)) out.push(tag);
  }
  for (const [alias, tag] of Object.entries(THEME_ALIASES)) {
    if (s.includes(alias) && !out.includes(tag)) out.push(tag);
  }
}

function pushFree(out: string[], raw: string) {
  const s = raw.trim();
  if (!s) return;
  for (const hint of CONCEPT_HINTS) {
    if (s.includes(hint) && !out.includes(hint)) out.push(hint);
  }
}

/**
 * 识别否定片段：不要 / 除了X以外 / 不想看 / 排除 / 避免 / 不是X …
 */
const NEGATIVE_SPAN_RES: RegExp[] = [
  /除了([^以之]{1,32}?)(?:以外|之外)/g,
  /除([^外，。,.!！？]{1,24}?)外/g,
  /不要(?:再)?(?:看|读|推|要)?([^，。,.!！？；;、\n]{1,24})/g,
  /别(?:再)?(?:看|读|推|要)?([^，。,.!！？；;、\n]{1,24})/g,
  /不想(?:再)?(?:看|读|要)?([^，。,.!！？；;、\n]{1,24})/g,
  /排除([^，。,.!！？；;、\n]{1,24})/g,
  /避免([^，。,.!！？；;、\n]{1,24})/g,
  /不是([^，。,.!！？；;、\n]{1,24})/g,
  /非(?![常])([^，。,.!！？；;、\n]{1,16})/g,
];

/** 「不要太理论」等偏好负向，不当作题材排除 */
function isPreferenceOnlyNegation(fragment: string): boolean {
  return /理论|案例|实操|跨领域|跨界/.test(fragment) && !TAXONOMY.some((t) => fragment.includes(t));
}

export function extractNegativeConstraints(text: string): NegativeConstraints {
  const source = text.trim();
  const excludedTopics: string[] = [];
  const excludedKeywords: string[] = [];
  const excludedConcepts: string[] = [];
  const negativeSpans: string[] = [];

  if (!source) {
    return { excludedTopics, excludedKeywords, excludedConcepts, negativeSpans };
  }

  for (const re of NEGATIVE_SPAN_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) != null) {
      const full = m[0] ?? "";
      const frag = (m[1] ?? "").trim();
      if (!full) continue;
      if (!negativeSpans.includes(full)) negativeSpans.push(full);
      if (!frag || isPreferenceOnlyNegation(frag)) continue;

      pushTopic(excludedTopics, frag);
      pushFree(excludedKeywords, frag);
      pushFree(excludedConcepts, frag);

      // 片段本身若是短自由词且非 taxonomy
      const cleaned = frag.replace(/[的地得了啊呢吧呀]/g, "").trim();
      if (
        cleaned.length >= 2 &&
        cleaned.length <= 12 &&
        !TAXONOMY.some((t) => cleaned.includes(t) || t.includes(cleaned)) &&
        !excludedKeywords.includes(cleaned)
      ) {
        // 仅当不像完整句子
        if (!/[我想要学关于]/.test(cleaned)) {
          excludedKeywords.push(cleaned);
          excludedConcepts.push(cleaned);
        }
      }
    }
  }

  return {
    excludedTopics: uniq(excludedTopics).slice(0, 6),
    excludedKeywords: uniq(excludedKeywords).slice(0, 8),
    excludedConcepts: uniq(excludedConcepts).slice(0, 8),
    negativeSpans,
  };
}

/** 把否定片段替换为空格，供正向题材/关键词抽取 */
export function maskNegativeSpans(text: string): string {
  const { negativeSpans } = extractNegativeConstraints(text);
  let out = text;
  // 长片段优先，避免部分重叠
  const spans = [...negativeSpans].sort((a, b) => b.length - a.length);
  for (const span of spans) {
    out = out.split(span).join(" ".repeat(Math.min(span.length, 4)));
  }
  return out;
}

export function emptyNegativeConstraints(): {
  excludedTopics: string[];
  excludedKeywords: string[];
  excludedConcepts: string[];
} {
  return {
    excludedTopics: [],
    excludedKeywords: [],
    excludedConcepts: [],
  };
}

export function mergeNegativeConstraints(
  ...parts: Array<Partial<NegativeConstraints> | null | undefined>
): {
  excludedTopics: string[];
  excludedKeywords: string[];
  excludedConcepts: string[];
} {
  const topics: string[] = [];
  const keywords: string[] = [];
  const concepts: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    for (const t of p.excludedTopics ?? []) {
      if (TAXONOMY.includes(t as GenreTag) && !topics.includes(t)) topics.push(t);
    }
    for (const k of p.excludedKeywords ?? []) {
      if (k && !keywords.includes(k) && !topics.includes(k)) keywords.push(k);
    }
    for (const c of p.excludedConcepts ?? []) {
      if (c && !concepts.includes(c) && !topics.includes(c)) concepts.push(c);
    }
  }
  return {
    excludedTopics: topics.slice(0, 6),
    excludedKeywords: keywords.slice(0, 8),
    excludedConcepts: concepts.slice(0, 8),
  };
}

/** 从正向 topics 中去掉已被排除的题材 */
export function stripExcludedFromTopics(
  topics: string[],
  excludedTopics: string[],
): string[] {
  if (excludedTopics.length === 0) return topics;
  const ban = new Set(excludedTopics);
  return topics.filter((t) => !ban.has(t));
}

function tagHits(haystack: string[], needles: string[]): boolean {
  if (needles.length === 0 || haystack.length === 0) return false;
  return needles.some((n) =>
    haystack.some((h) => h === n || h.includes(n) || n.includes(h)),
  );
}

function freeHits(haystack: string[], needles: string[]): boolean {
  if (needles.length === 0) return false;
  const blob = haystack.join("\n").toLowerCase();
  return needles.some((n) => {
    const nl = n.toLowerCase();
    return nl.length >= 2 && blob.includes(nl);
  });
}

/**
 * Hard filter：primary_topics 命中 excludedTopics → 直接淘汰。
 * 不改书的 tags；仅候选过滤。
 */
export function hardRejectByExcludedPrimary(
  book: Book,
  demand: StructuredDemandContext,
): boolean {
  const excluded = demand.excludedTopics ?? [];
  if (excluded.length === 0) return false;
  const primary = book.primary_topics ?? [];
  if (primary.length === 0) return false;
  return tagHits(primary, excluded);
}

/**
 * Soft：仅 related topics / concepts / keywords 命中排除项时降权。
 * 返回应从 sortScore 扣减的点数（≥0）；不改变 contextMatchScore / Match%。
 */
export function softExclusionSortPenalty(
  book: Book,
  demand: StructuredDemandContext,
): number {
  const excludedTopics = demand.excludedTopics ?? [];
  const excludedKeywords = demand.excludedKeywords ?? [];
  const excludedConcepts = demand.excludedConcepts ?? [];
  if (
    excludedTopics.length === 0 &&
    excludedKeywords.length === 0 &&
    excludedConcepts.length === 0
  ) {
    return 0;
  }

  // primary 已在 hard filter；此处只看非 primary 相关命中
  const primary = new Set(book.primary_topics ?? []);
  const relatedTopics = (book.tags ?? []).filter((t) => !primary.has(t));
  const concepts = book.concepts ?? [];

  let penalty = 0;

  if (excludedTopics.length > 0) {
    if (tagHits(relatedTopics, excludedTopics)) penalty += 10;
    if (freeHits(concepts, excludedTopics)) penalty += 6;
  }

  const freeNeedles = uniq([...excludedKeywords, ...excludedConcepts]);
  if (freeNeedles.length > 0) {
    if (freeHits(concepts, freeNeedles)) penalty += 8;
    if (freeHits(relatedTopics, freeNeedles)) penalty += 5;
    const blob = [
      book.title,
      book.display_summary ?? "",
      book.description ?? "",
    ]
      .join("\n")
      .toLowerCase();
    if (freeNeedles.some((n) => n.length >= 2 && blob.includes(n.toLowerCase()))) {
      penalty += 4;
    }
  }

  return Math.min(24, penalty);
}

/**
 * 是否通过负向硬约束（含 legacy exclusions: 英文/小说/理论）。
 * primary_topics ∩ excludedTopics → false。
 */
export function passesNegativeHardFilters(
  book: Book,
  demand: StructuredDemandContext,
): boolean {
  if (hardRejectByExcludedPrimary(book, demand)) return false;
  return true;
}
