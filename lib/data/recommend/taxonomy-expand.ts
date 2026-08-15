/**
 * Broad taxonomy：父题材 → exact / child / related（召回用并集；topic 分按档）。
 * 仅在 Specificity=LOW 且用户 explicit 为宽题材时展开，避免窄需求被稀释。
 */

import { CONTEXT_SPECIFICITY } from "@/lib/data/recommend/weights";

export type TopicHitTier = "exact" | "child" | "related" | "none";

export type BroadTopicTiers = {
  /** 与用户 explicit 完全同名的 catalog tag */
  exact: readonly string[];
  /** 明确子类（如 游戏设计 → 关卡设计） */
  child: readonly string[];
  /** 相邻领域（如 交互体验 / 叙事），可召回但 topic 分更低 */
  related: readonly string[];
};

/**
 * 宽父题材分层。
 * 刻意不含「编程 / 图形渲染 / 经济」等易漂到纯技术或商科的边（除非作为 related）。
 */
export const BROAD_TOPIC_TIERS: Record<string, BroadTopicTiers> = {
  游戏设计: {
    exact: ["游戏设计"],
    child: ["关卡设计"],
    related: ["交互体验", "叙事"],
  },
  游戏美术: {
    exact: ["游戏美术"],
    child: ["美术"],
    related: ["图形渲染"],
  },
  美术: {
    exact: ["美术"],
    child: [],
    related: ["图形渲染"],
  },
  玩家体验: {
    exact: ["玩家体验"],
    child: ["交互体验"],
    related: ["心理学", "游戏设计"],
  },
  玩家心理: {
    exact: ["玩家心理"],
    child: ["心理学"],
    related: ["交互体验"],
  },
  心理学: {
    exact: ["心理学"],
    child: [],
    related: ["交互体验"],
  },
  叙事: {
    exact: ["叙事"],
    child: [],
    related: ["神话"],
  },
  系统设计: {
    exact: ["系统设计"],
    child: ["游戏设计", "关卡设计"],
    related: [],
  },
  策划: {
    exact: ["策划"],
    child: ["游戏设计", "关卡设计"],
    related: ["管理"],
  },
  编程: {
    exact: ["编程"],
    child: [],
    related: ["人工智能", "图形渲染"],
  },
  音效: {
    exact: ["音效"],
    child: [],
    related: ["美术"],
  },
};

/** @deprecated 兼容：展开并集（exact ∪ child ∪ related） */
export const BROAD_TOPIC_EXPAND: Record<string, readonly string[]> =
  Object.fromEntries(
    Object.entries(BROAD_TOPIC_TIERS).map(([k, v]) => [
      k,
      [...v.exact, ...v.child, ...v.related],
    ]),
  );

const BROAD_SET = new Set<string>(CONTEXT_SPECIFICITY.broadTopics);

/** topic 档位 soft score（exact ≈ 1；child / related 明显更低） */
export const TOPIC_TIER_SCORE: Record<Exclude<TopicHitTier, "none">, number> = {
  exact: 1,
  child: 0.72,
  related: 0.48,
};

export function isBroadParentTopic(topic: string): boolean {
  return BROAD_SET.has(topic) || Boolean(BROAD_TOPIC_TIERS[topic]);
}

function normalizeTag(t: string): string {
  return t.trim().toLowerCase();
}

/** 完全相同 tag（大小写不敏感），不做 substring */
export function tagsMatchExact(
  bookTags: string[],
  needles: string[],
): boolean {
  if (needles.length === 0) return false;
  const set = new Set(bookTags.map(normalizeTag));
  return needles.some((n) => set.has(normalizeTag(n)));
}

/** book.tags 是否命中任一 needle（双向 includes；召回 / 弱匹配用） */
export function tagsMatchAny(bookTags: string[], needles: string[]): boolean {
  if (needles.length === 0) return false;
  for (const n of needles) {
    const nl = normalizeTag(n);
    if (
      bookTags.some((h) => {
        const hl = normalizeTag(h);
        return hl.includes(nl) || nl.includes(hl);
      })
    ) {
      return true;
    }
  }
  return false;
}

/** 单个 topic 展开为可匹配的 catalog tags（含自身） */
export function expandTopicToCatalogTags(topic: string): string[] {
  const tiers = BROAD_TOPIC_TIERS[topic];
  if (tiers) {
    return [...tiers.exact, ...tiers.child, ...tiers.related];
  }
  return [topic];
}

/**
 * 一组 topics 展开并去重。
 * onlyIfBroadParents：仅当全部为宽父题材时才展开（窄题材如「关卡设计」不扩）。
 */
export function expandTopicsForMatch(
  topics: string[],
  options?: { forceExpand?: boolean },
): string[] {
  if (topics.length === 0) return [];
  const force = options?.forceExpand === true;
  const allBroad = topics.every((t) => isBroadParentTopic(t));
  if (!force && !allBroad) return [...topics];

  const out: string[] = [];
  for (const t of topics) {
    for (const x of expandTopicToCatalogTags(t)) {
      if (!out.includes(x)) out.push(x);
    }
  }
  return out;
}

function tiersForRoots(roots: string[]): BroadTopicTiers {
  const exact: string[] = [];
  const child: string[] = [];
  const related: string[] = [];
  for (const r of roots) {
    const t = BROAD_TOPIC_TIERS[r];
    if (t) {
      for (const x of t.exact) if (!exact.includes(x)) exact.push(x);
      for (const x of t.child) if (!child.includes(x)) child.push(x);
      for (const x of t.related) if (!related.includes(x)) related.push(x);
    } else if (!exact.includes(r)) {
      exact.push(r);
    }
  }
  // child/related 勿与 exact 重复计档
  const exactSet = new Set(exact.map(normalizeTag));
  return {
    exact,
    child: child.filter((c) => !exactSet.has(normalizeTag(c))),
    related: related.filter(
      (c) =>
        !exactSet.has(normalizeTag(c)) &&
        !child.some((ch) => normalizeTag(ch) === normalizeTag(c)),
    ),
  };
}

/**
 * 对宽题材：按 exact → child → related 判定最高档。
 * exact 必须完全同名 tag；child/related 用 exact 相等（catalog 规范 tag）。
 */
export function classifyTopicHit(
  bookTags: string[],
  roots: string[],
): TopicHitTier {
  if (roots.length === 0) return "none";
  const tiers = tiersForRoots(roots);
  if (tagsMatchExact(bookTags, [...tiers.exact])) return "exact";
  if (tagsMatchExact(bookTags, [...tiers.child])) return "child";
  if (tagsMatchExact(bookTags, [...tiers.related])) return "related";
  // 窄题材 / 无表项：根 tag 完全命中算 exact
  if (tagsMatchExact(bookTags, roots)) return "exact";
  return "none";
}

/** 命中 needle 个数 / needles.length */
export function tagOverlapRatio(bookTags: string[], needles: string[]): number {
  if (needles.length === 0) return 0;
  let hits = 0;
  for (const n of needles) {
    const nl = normalizeTag(n);
    if (
      bookTags.some((h) => {
        const hl = normalizeTag(h);
        return hl.includes(nl) || nl.includes(hl);
      })
    ) {
      hits += 1;
    }
  }
  return hits / needles.length;
}
