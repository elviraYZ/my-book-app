/**
 * Context-first 推荐权重。
 * AI Search：用户可见匹配度 = contextMatchScore（不含 Profile）。
 * Profile 只进入 sortScore 微调。
 *
 * Match% 动态权重见 resolveContextMatchWeights（Explicit content > inferred > usage）。
 * 下方 CONTEXT_SCORE_WEIGHTS 仅作文档/旧路径名义比例，不再直接驱动 Match%。
 */

/** @deprecated Match% 请用 resolveContextMatchWeights；保留名义比例兼容 */
export const CONTEXT_SCORE_WEIGHTS = {
  canonicalTopic: 15,
  keyword: 5,
  semantic: 15,
  goal: 20,
  style: 10,
  difficulty: 10,
  time: 10,
} as const;

export const CONTEXT_SCORE_WEIGHT_SUM =
  CONTEXT_SCORE_WEIGHTS.canonicalTopic +
  CONTEXT_SCORE_WEIGHTS.keyword +
  CONTEXT_SCORE_WEIGHTS.semantic +
  CONTEXT_SCORE_WEIGHTS.goal +
  CONTEXT_SCORE_WEIGHTS.style +
  CONTEXT_SCORE_WEIGHTS.difficulty +
  CONTEXT_SCORE_WEIGHTS.time;

/**
 * 兼容旧引用：含 profile 的名义权重（仅用于文档/旧路径）。
 * 在线 AI Search 请用 resolveContextMatchWeights + PROFILE_SORT_BOOST。
 */
export const SCORE_WEIGHTS = {
  ...CONTEXT_SCORE_WEIGHTS,
  profile: 15,
} as const;

export const TOPIC_WEIGHT_TOTAL =
  CONTEXT_SCORE_WEIGHTS.canonicalTopic +
  CONTEXT_SCORE_WEIGHTS.keyword +
  CONTEXT_SCORE_WEIGHTS.semantic;

/**
 * Match% 相对权重：一条原则，不按 specificity 开多套表。
 *
 * - Explicit content（明确 topic / keyword / 有 semantic 证据）主导
 * - Inferred topic 次要
 * - Goal / style / difficulty / time 仅作轻量适配，且总量不超过内容权重的 25%
 */
export type MatchWeightInput = {
  hasExplicitTopic: boolean;
  hasInferredTopic: boolean;
  hasKeywords: boolean;
  hasSemantic: boolean;
  statedGoal: boolean;
  statedStyles: boolean;
  statedDifficulty: boolean;
  statedTime: boolean;
};

export type MatchWeightKey =
  | "topic"
  | "keyword"
  | "semantic"
  | "goal"
  | "style"
  | "difficulty"
  | "time";

export function resolveContextMatchWeights(
  input: MatchWeightInput,
): Partial<Record<MatchWeightKey, number>> {
  const w: Partial<Record<MatchWeightKey, number>> = {};

  if (input.hasKeywords) {
    // 具体需求：keyword + semantic 主导；topic 辅助（inferred 更弱）
    w.keyword = 1;
    if (input.hasSemantic) w.semantic = 0.9;
    if (input.hasExplicitTopic) w.topic = 0.35;
    else if (input.hasInferredTopic) w.topic = 0.15;
  } else if (input.hasExplicitTopic) {
    // 宽方向 / 只说了方向：Topic 主导；semantic 轻辅助
    w.topic = 1;
    if (input.hasSemantic) w.semantic = 0.35;
  } else if (input.hasInferredTopic) {
    w.topic = 0.25;
    if (input.hasSemantic) w.semantic = 0.85;
  } else if (input.hasSemantic) {
    w.semantic = 1;
  }

  if (input.statedGoal) w.goal = 0.18;
  if (input.statedStyles) w.style = 0.14;
  if (input.statedDifficulty) w.difficulty = 0.12;
  if (input.statedTime) w.time = 0.12;

  const contentSum =
    (w.topic ?? 0) + (w.keyword ?? 0) + (w.semantic ?? 0);
  const usageSum =
    (w.goal ?? 0) +
    (w.style ?? 0) +
    (w.difficulty ?? 0) +
    (w.time ?? 0);
  if (contentSum > 0 && usageSum > contentSum * 0.25) {
    const scale = (contentSum * 0.25) / usageSum;
    if (w.goal != null) w.goal *= scale;
    if (w.style != null) w.style *= scale;
    if (w.difficulty != null) w.difficulty *= scale;
    if (w.time != null) w.time *= scale;
  }

  return w;
}

/** Profile 对排序的微调幅度（不进入 UI 匹配度） */
export const PROFILE_SORT_BOOST = {
  /** profile soft 相对 0.5 的偏移 × 系数，封顶 ±maxDelta */
  scale: 8,
  maxDelta: 4,
} as const;

/**
 * Absolute relevance（前置 gate + semantic recall post-filter）。
 */
export const ABSOLUTE_RELEVANCE = {
  minRawSemanticForRecall: 0.38,
  coreWeights: {
    topic: 0.25,
    keyword: 0.35,
    semantic: 0.4,
  },
  explicitMix: 0.85,
  inferredMix: 0.15,
  admit: {
    explicitKeywordStrong: 0.5,
    explicitKeywordWeak: 0.35,
    explicitTopicStrong: 0.5,
    explicitTopicWeak: 0.35,
    rawSemanticStrong: 0.48,
    /** 无词汇证据时，仅极高语义可单独过线（防误召回） */
    rawSemanticSolo: 0.62,
    rawSemanticForTopic: 0.4,
    rawSemanticCombo: 0.42,
    minCoreRelevance: 0.28,
    minExplicitCoreToAdmit: 0.32,
  },
} as const;

export const CONTEXT_RELEVANCE_GATE = {
  filterBelow: 0.2,
  /** @deprecated Match% 不再 soft/hard cap；仅历史兼容 */
  softCapBelow: 0.4,
  softCap: 60,
  hardCapBelow: 0.7,
  hardCap: 80,
  keywordFloor: 0.3,
  semanticFloor: 0.4,
  weakCoreCeiling: 0.35,
} as const;

/**
 * 用户可见相关等级（只解释 contextMatchScore，不修改分数）。
 */
export const RELEVANCE_BAND = {
  strongMin: 75,
  mediumMin: 60,
} as const;

export type RelevanceBand = "strong" | "medium" | "weak";

export function relevanceBandFromContextMatch(score: number): RelevanceBand {
  if (score >= RELEVANCE_BAND.strongMin) return "strong";
  if (score >= RELEVANCE_BAND.mediumMin) return "medium";
  return "weak";
}

/**
 * Coverage Gap Logging（GOOD / THIN / GAP）— 仅后台。
 * 前台 tip：Coverage（Top 质量）与 Specificity（需求宽窄）分开。
 */
export const COVERAGE = {
  /** 后台：低于此视为「非高度匹配」 */
  lowMatchThreshold: 60,
  /**
   * 展示底线（具体需求）：挡掉极低分噪声。
   */
  minDisplayContextMatch: 45,
  minDisplayCoreRelevance: 0.28,
  /**
   * 宽 query（LOW）展示底线：gate 已放行后勿再用高 core 门槛清空结果。
   * tag 命中时 core 常在 0.15–0.25，旧 0.28 会把全部滤掉。
   */
  minDisplayContextMatchBroad: 40,
  minDisplayCoreRelevanceBroad: 0.1,
  /** GOOD：高度匹配结果至少这么多（仅 logging） */
  minGoodHighMatchCount: 5,
  minGoodTopScore: 60,
  minGoodTopCoreRelevance: 0.35,
} as const;

export type CoverageStatus = "GOOD" | "THIN" | "GAP";

/**
 * Coverage Gap 前台提示：看 Top 绝对质量，不看「高分本数够不够」。
 * 具体需求只有 3 本 94/89/85 → 不是 gap。
 */
export const COVERAGE_TIP = {
  topN: 3,
  /** Top1 contextMatch 低于此 → gap */
  top1Below: 60,
  /** Top N 平均低于此 → gap */
  topAvgBelow: 65,
  message:
    "当前书库中与你需求高度匹配的内容较少，以下为现有相关参考。该需求会用于后续内容扩充。",
} as const;

/**
 * Intent Specificity：只决定是否提示「可进一步细化」，不进匹配分。
 */
export const CONTEXT_SPECIFICITY = {
  /** 视为偏宽的题材（单独出现且缺关键词时倾向 LOW） */
  broadTopics: [
    "游戏设计",
    "游戏美术",
    "美术",
    "编程",
    "叙事",
    "玩家体验",
    "系统设计",
    "音效",
    "策划",
  ] as const,
  /** 关键词达到此数倾向更具体 */
  keywordMediumMin: 2,
  keywordHighMin: 4,
} as const;

export type ContextSpecificity = "LOW" | "MEDIUM" | "HIGH";

/** Broad but well-covered → 引导细化 */
export const REFINEMENT_TIP = {
  /** 出 refinement 时 Top1 参考线（LOW 时有足够结果也可出 tip） */
  minTop1: 60,
  /** LOW + 结果数 ≥ 此值 → 优先 refinement，不报 gap */
  minResultCount: 3,
  message:
    "这个方向范围较广，可以补充具体关注点以获得更精准推荐。",
} as const;

export type UiTipKind = "none" | "refinement" | "coverage_gap";

/** Top-K LLM 推荐理由（不改分、不改排序） */
export const EXPLAIN_LLM = {
  topK: 3,
  cacheMaxEntries: 64,
} as const;

/** 本地足够性（旧路径；在线 MVP 以 COVERAGE 为准，不再触发 Google） */
export const SUFFICIENCY = {
  minAbsoluteHits: 3,
  minCoreContextHits: 3,
  keywordStrongFloor: 0.6,
  semanticStrongFloor: 0.65,
  keywordWeakFloor: 0.35,
  semanticComboFloor: 0.5,
  keywordEvidenceFloor: 0.5,
  minTopScore: 70,
  minQualifiedScore: 60,
  minQualifiedCount: 5,
} as const;

export const RECALL_LIMIT = 80;
/**
 * 每路召回的初始 Top-K（lexical / semantic）；不是全局候选硬上限。
 * Primary 强命中单独保障，不受该 K 截断；主题过大时 Primary 路内部再截 PRIMARY_RECALL_CAP。
 */
export const RECALL_K_MAX = 320;
/** Primary 路单次最多带入 union 的本数（内部已按强度排序） */
export const PRIMARY_RECALL_CAP = 160;

/** 扩召回停止：数量 + Top core 质量 */
export const RECALL_EXPAND_STOP = {
  minDisplayable: 10,
  /** Top3 coreRelevance 均值下限 */
  top3CoreAvgMin: 0.42,
  /** Top5 coreRelevance 均值下限 */
  top5CoreAvgMin: 0.38,
} as const;

/** 最多返回条数；实际可更少（不强凑） */
export const TOP_N = 20;

/** 外部补库：每个 topic 本次最多新入库数（仅手动 seed / 显式 enableIngest） */
export const INGEST_PER_TAG = 5;

/** MVP：在线推荐默认关闭同步 Google Books */
export const ONLINE_GOOGLE_INGEST_ENABLED = false;
