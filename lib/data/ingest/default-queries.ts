import type { IngestQuery } from "@/lib/data/ingest/types";

/**
 * Seed CLI 默认检索词表（题材级，不含作者名 / 单本书名）。
 * 推荐 API 应传入自己的 queries，不必依赖本表。
 */
export const DEFAULT_INGEST_QUERIES: IngestQuery[] = [
  // 游戏 / 关卡
  { q: "游戏设计", tags: ["游戏设计"], styles: ["method", "theory"] },
  { q: "游戏策划", tags: ["游戏设计"], styles: ["method", "case"] },
  { q: "游戏机制", tags: ["游戏设计"], styles: ["theory", "method"] },
  { q: "关卡设计", tags: ["关卡设计", "游戏设计"], styles: ["case", "method"] },
  { q: "玩家体验", tags: ["游戏设计", "交互体验"], styles: ["theory", "method"] },

  // 交互 / 设计
  { q: "用户体验设计", tags: ["交互体验", "设计思维"], styles: ["method"] },
  { q: "交互设计", tags: ["交互体验"], styles: ["method", "case"] },
  { q: "情感化设计", tags: ["交互体验", "设计思维"], styles: ["theory"] },
  { q: "产品设计", tags: ["产品", "设计思维"], styles: ["method"] },
  { q: "产品经理", tags: ["产品"], styles: ["method", "case"] },
  { q: "设计思维", tags: ["设计思维"], styles: ["theory", "inspiration"] },
  { q: "设计心理学", tags: ["设计思维", "心理学"], styles: ["theory"] },

  // 叙事
  { q: "叙事设计", tags: ["叙事", "游戏设计"], styles: ["theory", "inspiration"] },
  { q: "故事结构", tags: ["叙事"], styles: ["method", "inspiration"] },
  { q: "创意写作", tags: ["叙事"], styles: ["method", "inspiration"] },
  { q: "编剧", tags: ["叙事"], styles: ["method"] },

  // 心理 / 经济 / 管理
  { q: "心理学", tags: ["心理学"], styles: ["theory"] },
  { q: "认知心理学", tags: ["心理学"], styles: ["theory"] },
  { q: "行为经济学", tags: ["心理学", "经济"], styles: ["theory", "case"] },
  { q: "经济学入门", tags: ["经济"], styles: ["theory"] },
  { q: "管理学", tags: ["管理"], styles: ["method", "case"] },
  { q: "领导力", tags: ["管理"], styles: ["method", "case"] },
  { q: "组织行为", tags: ["管理", "心理学"], styles: ["theory"] },
  { q: "精益创业", tags: ["产品", "管理"], styles: ["method"] },

  // 文学向题材（类别词，非书名/作者）
  { q: "科幻小说", tags: ["科幻"], styles: ["inspiration"] },
  { q: "奇幻小说", tags: ["科幻", "神话"], styles: ["inspiration"] },
  { q: "悬疑推理", tags: ["悬疑"], styles: ["inspiration"] },
  { q: "侦探小说", tags: ["悬疑"], styles: ["inspiration"] },
  { q: "中国神话", tags: ["神话"], styles: ["inspiration"] },
  { q: "神话传说", tags: ["神话"], styles: ["inspiration"] },
  { q: "希腊神话", tags: ["神话"], styles: ["inspiration"] },

  // 建筑
  { q: "建筑设计", tags: ["建筑", "设计思维"], styles: ["theory"] },
  { q: "空间设计", tags: ["建筑"], styles: ["theory", "inspiration"] },

  // 美术（游戏向 + 通用视觉）
  { q: "游戏美术", tags: ["美术", "游戏设计"], styles: ["method", "inspiration"] },
  { q: "概念设计", tags: ["美术"], styles: ["method", "inspiration"] },
  { q: "原画设计", tags: ["美术"], styles: ["method", "inspiration"] },
  { q: "角色设计", tags: ["美术"], styles: ["method", "case"] },
  { q: "场景设计", tags: ["美术", "建筑"], styles: ["method", "inspiration"] },
  { q: "游戏视觉设计", tags: ["美术", "交互体验"], styles: ["theory", "method"] },
  { q: "插画", tags: ["美术"], styles: ["inspiration", "method"] },
  { q: "色彩理论", tags: ["美术", "设计思维"], styles: ["theory"] },
  { q: "构图", tags: ["美术"], styles: ["theory", "method"] },
  { q: "视觉叙事", tags: ["美术", "叙事"], styles: ["theory", "inspiration"] },

  // 编程
  { q: "编程思维", tags: ["编程"], styles: ["theory", "method"] },
  { q: "数据结构与算法", tags: ["编程"], styles: ["theory", "method"] },
  { q: "软件设计模式", tags: ["编程"], styles: ["theory", "method"] },
  { q: "Python编程", tags: ["编程"], styles: ["method"] },
  { q: "JavaScript编程", tags: ["编程"], styles: ["method"] },

  // AI
  { q: "人工智能导论", tags: ["人工智能"], styles: ["theory"] },
  { q: "机器学习", tags: ["人工智能"], styles: ["theory", "method"] },
  { q: "深度学习", tags: ["人工智能"], styles: ["theory"] },
  { q: "生成式人工智能", tags: ["人工智能"], styles: ["method", "inspiration"] },
  { q: "大语言模型", tags: ["人工智能"], styles: ["method"] },

  // 图形 / 引擎
  { q: "计算机图形学", tags: ["图形渲染"], styles: ["theory"] },
  { q: "实时渲染", tags: ["图形渲染"], styles: ["theory", "method"] },
  { q: "游戏引擎架构", tags: ["图形渲染", "游戏设计"], styles: ["theory"] },
  { q: "着色器编程", tags: ["图形渲染", "编程"], styles: ["method"] },
  { q: "光线追踪", tags: ["图形渲染"], styles: ["theory"] },
];

export function filterQueriesByTags(
  queries: IngestQuery[],
  tags: string[],
): IngestQuery[] {
  if (tags.length === 0) return queries;
  return queries.filter((q) => q.tags.some((t) => tags.includes(t)));
}

export function uniqueTagsFromQueries(queries: IngestQuery[]): string[] {
  const set = new Set<string>();
  for (const q of queries) for (const t of q.tags) set.add(t);
  return [...set];
}
