/**
 * 画像「感兴趣领域」→ 书目白名单 tags。
 * 兴趣文案可与 books.tags 不同；推荐打分时经此映射。
 */

import type { GenreTag } from "@/lib/data/book-tags";

/** onboarding 默认兴趣选项（与 onboarding-form 保持一致） */
export const PROFILE_INTEREST_OPTIONS = [
  "游戏设计",
  "关卡设计",
  "引擎开发",
  "产品策略",
  "用户研究",
  "叙事 / 剧情",
  "美术设定",
  "3D 技术",
  "AI / 算法",
  "游戏运营",
  "数据分析",
  "市场营销",
] as const;

export type ProfileInterest = (typeof PROFILE_INTEREST_OPTIONS)[number] | string;

const INTEREST_TO_BOOK_TAGS: Record<string, GenreTag[]> = {
  游戏设计: ["游戏设计"],
  关卡设计: ["关卡设计", "游戏设计"],
  引擎开发: ["图形渲染", "编程", "游戏设计"],
  产品策略: ["产品", "管理"],
  用户研究: ["交互体验", "心理学"],
  "叙事 / 剧情": ["叙事"],
  美术设定: ["美术", "设计思维", "图形渲染"],
  "3D 技术": ["图形渲染", "游戏设计"],
  "AI / 算法": ["人工智能", "编程"],
  游戏运营: ["管理", "产品"],
  数据分析: ["编程", "经济"],
  市场营销: ["管理", "产品"],
  // 口语/自定义
  设计: ["设计思维", "交互体验", "产品"],
  设计相关: ["设计思维", "交互体验", "产品"],
};

/** 自定义兴趣的弱匹配：命中这些关键词也映射 */
const CUSTOM_HINTS: { re: RegExp; tags: GenreTag[] }[] = [
  { re: /游戏|关卡/, tags: ["游戏设计", "关卡设计"] },
  { re: /美术|原画|概念设计|插画|角色设计|场景/, tags: ["美术", "设计思维"] },
  { re: /引擎|渲染|图形|3D|Shader/i, tags: ["图形渲染", "编程"] },
  { re: /AI|人工|智能|算法|机器学习/, tags: ["人工智能", "编程"] },
  { re: /程序|编程|代码/, tags: ["编程"] },
  { re: /产品/, tags: ["产品"] },
  { re: /叙事|剧情|故事/, tags: ["叙事"] },
  { re: /心理|用户研究|体验/, tags: ["交互体验", "心理学"] },
  { re: /运营|市场|营销|管理/, tags: ["管理", "产品"] },
];

/** 画像兴趣 → 去重后的书目标签 */
export function mapInterestsToBookTags(interests: string[]): GenreTag[] {
  const out = new Set<GenreTag>();
  for (const raw of interests) {
    const key = raw.trim();
    if (!key) continue;
    const mapped = INTEREST_TO_BOOK_TAGS[key];
    if (mapped) {
      for (const t of mapped) out.add(t);
      continue;
    }
    for (const hint of CUSTOM_HINTS) {
      if (hint.re.test(key)) {
        for (const t of hint.tags) out.add(t);
      }
    }
  }
  return [...out];
}

function tagHitCount(bookTags: string[], interestTags: string[]): number {
  let n = 0;
  for (const needle of interestTags) {
    if (bookTags.some((t) => t.includes(needle) || needle.includes(t))) n += 1;
  }
  return n;
}

/**
 * 探索 / 首页：按画像兴趣命中数降序；同分按 id 稳定排序（不靠 seed 假打散）。
 */
export function rankByInterestTags<T extends { id: string; tags: string[] }>(
  books: T[],
  interestTags: string[],
): T[] {
  if (interestTags.length === 0) {
    return [...books].sort((a, b) => a.id.localeCompare(b.id));
  }
  return [...books].sort((a, b) => {
    const sa = tagHitCount(a.tags, interestTags);
    const sb = tagHitCount(b.tags, interestTags);
    if (sb !== sa) return sb - sa;
    return a.id.localeCompare(b.id);
  });
}

/**
 * 「换一批」：从已排序列表按批次偏移取窗，真正换一批书，而不是同池微扰排序。
 * startIndex 通常为 batchIndex * batchSize；count 为本次展示条数（可含「加载更多」）。
 */
export function takeRotatedSlice<T>(
  items: T[],
  startIndex: number,
  count: number,
): T[] {
  if (items.length === 0 || count <= 0) return [];
  const n = Math.min(count, items.length);
  const start =
    ((startIndex % items.length) + items.length) % items.length;
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    out.push(items[(start + i) % items.length]);
  }
  return out;
}
