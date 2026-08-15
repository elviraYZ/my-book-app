/**
 * 书目标签规则：仅白名单中文题材；按标题/简介命中打标，不吞 Google 英文类目。
 */

/** 与探索「题材」筛选一致 */
export const GENRE_TAG_WHITELIST = [
  "游戏设计",
  "关卡设计",
  "交互体验",
  "产品",
  "设计思维",
  "叙事",
  "心理学",
  "管理",
  "经济",
  "科幻",
  "悬疑",
  "神话",
  "建筑",
  "美术",
  "编程",
  "人工智能",
  "图形渲染",
] as const;

export type GenreTag = (typeof GENRE_TAG_WHITELIST)[number];

const WHITELIST_SET = new Set<string>(GENRE_TAG_WHITELIST);

/** 每个题材的相关性证据词（标题/简介命中才可挂该 tag 入库） */
const TAG_EVIDENCE: { tag: GenreTag; patterns: RegExp[] }[] = [
  {
    tag: "关卡设计",
    patterns: [
      /关卡设计/,
      /关卡/,
      /level\s*design/i,
      /关卡编辑/,
      /空间引导/,
    ],
  },
  {
    tag: "游戏设计",
    // 必须有游戏/玩法侧证据；禁止仅凭 UX/HCI/用户体验挂本 tag
    patterns: [
      /游戏设计/,
      /游戏策划/,
      /游戏开发/,
      /游戏机制/,
      /游戏玩法/,
      /玩法设计/,
      /游戏系统/,
      /game\s*design/i,
      /gameplay/i,
      /video\s*game/i,
      /电子游戏/,
      /主机游戏/,
      /手游/,
      /独立游戏/,
    ],
  },
  {
    tag: "交互体验",
    patterns: [
      /交互体验/,
      /交互设计/,
      /用户体验/,
      /体验设计/,
      /可用性/,
      /人机交互/,
      /user\s*experience/i,
      /\bUI\s*\/\s*UX\b/i,
      /\bUX\s*design/i,
      /\bUX\b/i,
      /\bHCI\b/i,
    ],
  },
  {
    tag: "产品",
    patterns: [
      /产品设计/,
      /产品经理/,
      /产品思维/,
      /产品方法论/,
      /产品管理/,
      /需求分析/,
      /精益创业/,
      /product\s*management/i,
    ],
  },
  {
    tag: "设计思维",
    patterns: [
      /设计思维/,
      /design\s*thinking/i,
      /设计方法/,
      /设计原则/,
      /情感化设计/,
      /设计心理学/,
    ],
  },
  {
    tag: "叙事",
    patterns: [
      /叙事设计/,
      /叙事学/,
      /故事结构/,
      /编剧/,
      /创意写作/,
      /小说叙事/,
      /剧情/,
      /故事讲述/,
      /storytelling/i,
    ],
  },
  {
    tag: "心理学",
    patterns: [
      /心理学/,
      /认知心理/,
      /行为心理/,
      /心理效应/,
      /认知科学/,
      /行为科学/,
    ],
  },
  {
    tag: "管理",
    patterns: [
      /管理学/,
      /领导力/,
      /组织行为/,
      /团队管理/,
      /企业管理/,
      /项目管理/,
      /组织管理/,
    ],
  },
  {
    tag: "经济",
    patterns: [
      /经济学/,
      /行为经济学/,
      /微观经济/,
      /宏观经济/,
      /博弈论/,
      /市场机制/,
    ],
  },
  {
    tag: "科幻",
    patterns: [/科幻/, /奇幻小说/, /科幻小说/, /science\s*fiction/i, /\bSF\b/],
  },
  {
    tag: "悬疑",
    patterns: [/悬疑/, /推理小说/, /侦探/, /犯罪小说/, /推理/],
  },
  {
    tag: "神话",
    patterns: [/神话/, /神话学/, /mythology/i, /传说/, /民俗/],
  },
  {
    tag: "建筑",
    patterns: [/建[筑築]/, /空间设计/, /城市规划/, /景观设计/, /室内设计/],
  },
  {
    tag: "美术",
    patterns: [
      /游戏美术/,
      /概念设计/,
      /原画/,
      /角色设计/,
      /场景设计/,
      /视觉设计/,
      /插画/,
      /色彩理论/,
      /构图/,
      /美术设定/,
      /美术/,
      /concept\s*art/i,
      /character\s*design/i,
    ],
  },
  {
    tag: "编程",
    patterns: [
      /编程/,
      /程序设计/,
      /软件工程/,
      /算法/,
      /数据结构/,
      /代码/,
      /编程语言/,
      /软件开发/,
      /程序/,
    ],
  },
  {
    tag: "人工智能",
    patterns: [
      /人工智能/,
      /机器学习/,
      /深度学习/,
      /神经网络/,
      /大模型/,
      /大语言/,
      /\bAIGC\b/i,
      /ChatGPT/,
      /\bLLM\b/i,
      /生成式/,
    ],
  },
  {
    tag: "图形渲染",
    patterns: [
      /图形学/,
      /渲染/,
      /着色器/,
      /Shader/i,
      /实时渲染/,
      /计算机图形/,
      /OpenGL/i,
      /Vulkan/i,
      /光线追踪/,
      /游戏引擎/,
    ],
  },
];

function textBlob(title: string, description?: string | null): string {
  return `${title}\n${description ?? ""}`;
}

export function isGenreTag(tag: string): tag is GenreTag {
  return WHITELIST_SET.has(tag);
}

export function filterWhitelistTags(tags: string[] | null | undefined): GenreTag[] {
  const out: GenreTag[] = [];
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    const t = raw.trim();
    if (!isGenreTag(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** 标题/简介是否支持该题材 */
export function tagHasEvidence(
  tag: string,
  title: string,
  description?: string | null,
): boolean {
  if (!isGenreTag(tag)) return false;
  const blob = textBlob(title, description);
  const entry = TAG_EVIDENCE.find((e) => e.tag === tag);
  if (!entry) return false;
  return entry.patterns.some((re) => re.test(blob));
}

/** 仅根据正文打白名单标签 */
export function classifyGenreTags(
  title: string,
  description?: string | null,
): GenreTag[] {
  const blob = textBlob(title, description);
  const out: GenreTag[] = [];
  for (const { tag, patterns } of TAG_EVIDENCE) {
    if (patterns.some((re) => re.test(blob))) out.push(tag);
  }
  return out;
}

/**
 * 入库打标：
 * 1) 正文命中的白名单标签（evidence）
 * 2) seedTags 仅当正文也命中该 tag 的证据词时保留（相关性校验）
 * 3) 无 evidence 的 seed 只是检索候选，默认不入库（allowSeedFallback 已废弃，恒 false）
 * 绝不写入 Google 英文类目
 */
export function assignGenreTags(input: {
  title: string;
  description?: string | null;
  seedTags?: string[];
  /**
   * @deprecated 无 evidence 不得入库；忽略该参数，恒不兜底
   */
  allowSeedFallback?: boolean;
}): GenreTag[] {
  const fromText = classifyGenreTags(input.title, input.description);
  const seed = filterWhitelistTags(input.seedTags);
  const fromSeedWithEvidence = seed.filter((t) =>
    tagHasEvidence(t, input.title, input.description),
  );
  return filterWhitelistTags([...fromText, ...fromSeedWithEvidence]);
}

/** 内容风格：偏严，避免「小说」二字乱贴 inspiration */
export function classifyContentStyles(
  title: string,
  description: string | null | undefined,
  tags: string[],
  seedStyles?: string[],
  options?: { preferSeed?: boolean },
): Array<"method" | "case" | "theory" | "inspiration"> {
  const allowed = new Set(["method", "case", "theory", "inspiration"]);
  const fromSeed = (seedStyles ?? []).filter(
    (s): s is "method" | "case" | "theory" | "inspiration" => allowed.has(s),
  );
  // 默认：有 seed 时沿用（ingest）；enrichment 全量重算时传 preferSeed: false
  if (options?.preferSeed !== false && fromSeed.length > 0) {
    return [...new Set(fromSeed)];
  }

  const blob = `${tags.join(" ")} ${title} ${description ?? ""}`.toLowerCase();
  const styles = new Set<"method" | "case" | "theory" | "inspiration">();
  if (/案例|实践手册|实操|案例研究|case study/i.test(blob)) styles.add("case");
  if (/理论|原理|框架|方法论|fundamentals|theory/i.test(blob)) styles.add("theory");
  if (/方法|指南|教程|how to|technique/i.test(blob)) styles.add("method");
  if (
    /科幻|悬疑|神话|奇幻|灵感|创意写作|science fiction|mystery/i.test(blob)
  ) {
    styles.add("inspiration");
  }
  if (styles.size === 0 && fromSeed.length > 0) return [...new Set(fromSeed)];
  return [...styles];
}

/**
 * 主题材：topics 子集。规则兜底最多 2 个（LLM 路径会再精炼到 1–2）。
 * 有子类时丢掉宽泛父类（关卡设计 → 去掉游戏设计）。
 */
const PRIMARY_PARENT_DROP: Partial<Record<GenreTag, GenreTag>> = {
  关卡设计: "游戏设计",
};

export function pickPrimaryTopics(topics: string[]): GenreTag[] {
  const list = filterWhitelistTags(topics);
  if (list.length === 0) return [];

  const drop = new Set<GenreTag>();
  for (const t of list) {
    const parent = PRIMARY_PARENT_DROP[t];
    if (parent && list.includes(parent)) drop.add(parent);
  }

  const primary = list.filter((t) => !drop.has(t));
  return primary.slice(0, 2);
}
