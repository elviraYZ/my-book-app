import { mapInterestsToBookTags } from "@/lib/data/interest-map";
import {
  CONTEXT_RELEVANCE_GATE,
  CONTEXT_SCORE_WEIGHTS,
  PROFILE_SORT_BOOST,
  resolveContextMatchWeights,
  relevanceBandFromContextMatch,
  type ContextSpecificity,
  type RelevanceBand,
} from "@/lib/data/recommend/weights";
import {
  TOPIC_TIER_SCORE,
  classifyTopicHit,
  tagsMatchExact,
} from "@/lib/data/recommend/taxonomy-expand";
import type {
  Book,
  ContentStyle,
  DimensionScores,
  ReadingDepth,
  StructuredDemandContext,
} from "@/lib/types";

const STYLE_PREF_TO_CONTENT: Record<string, ContentStyle[]> = {
  案例优先: ["case"],
  理论优先: ["theory"],
  实操: ["method", "case"],
  跨领域: ["inspiration", "theory"],
  方法论: ["method"],
  理论: ["theory"],
  案例: ["case"],
  叙事: ["inspiration"],
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.05;
  return Math.min(1, Math.max(0.05, n));
}

function softLevels(level: 1 | 0.8 | 0.5 | 0.2 | 0.05): number {
  return level;
}

/** 未提供的 Context 维占位分（combine 时跳过，勿当 0.5 中性分） */
export const UNSPECIFIED_DIM_SCORE = softLevels(0.05);

function textBlob(book: Book): string {
  return [
    book.title,
    book.display_summary ?? "",
    book.description ?? "",
    book.tags.join(" "),
    (book.primary_topics ?? []).join(" "),
    (book.concepts ?? []).join(" "),
    (book.use_cases ?? []).join(" "),
  ]
    .join("\n")
    .toLowerCase();
}

function overlapRatio(needles: string[], haystack: string[]): number {
  if (needles.length === 0) return softLevels(0.5);
  let hits = 0;
  for (const n of needles) {
    const nl = n.toLowerCase();
    if (
      haystack.some(
        (h) => h.toLowerCase().includes(nl) || nl.includes(h.toLowerCase()),
      )
    ) {
      hits += 1;
    }
  }
  const r = hits / needles.length;
  if (r >= 0.67) return softLevels(1);
  if (r >= 0.34) return softLevels(0.8);
  if (hits >= 1) return softLevels(0.5);
  return softLevels(0.05);
}

/** canonical topic ↔ book.tags（评分用并集；gate 已用 explicit） */
export function scoreCanonicalTopic(
  book: Book,
  demand: StructuredDemandContext,
  specificity: ContextSpecificity = "MEDIUM",
): number {
  const explicit = demand.explicitTopics ?? [];
  const inferred = demand.inferredTopics ?? [];
  const topics =
    explicit.length > 0 || inferred.length > 0
      ? [
          ...explicit,
          ...(explicit.length > 0 ? [] : inferred),
        ]
      : (demand.topics ?? []);

  if (topics.length === 0) {
    // topic 未指定：不给中性 0.5（combine 仍会带 canonical 维；无 topic 时宜弱）
    return UNSPECIFIED_DIM_SCORE;
  }

  // LOW + 宽题材：exact / child / related 分档（完全同名才接近 1）
  if (specificity === "LOW") {
    const roots = explicit.length > 0 ? explicit : topics;
    const tier = classifyTopicHit(book.tags, roots);
    if (tier === "none") return softLevels(0.05);
    return TOPIC_TIER_SCORE[tier];
  }

  if (explicit.length > 0) {
    // 窄/中具体：优先完全同名；否则用 overlap（兼容旧行为）
    if (tagsMatchExact(book.tags, explicit)) return softLevels(1);
    const explicitScore = clamp01(overlapRatio(explicit, book.tags));
    if (explicitScore > softLevels(0.05)) return explicitScore;
    if (inferred.length > 0) {
      const inf = overlapRatio(inferred, book.tags);
      if (inf > 0) return softLevels(0.2);
    }
    return softLevels(0.05);
  }
  return clamp01(overlapRatio(topics, book.tags));
}

/** keywords ↔ title/summary/description（优先 explicit） */
export function scoreKeywordLexical(
  book: Book,
  demand: StructuredDemandContext,
): number {
  const explicit = demand.explicitKeywords ?? [];
  const inferred = demand.inferredKeywords ?? [];
  const keywords =
    explicit.length > 0 || inferred.length > 0
      ? [...explicit, ...inferred]
      : (demand.keywords ?? []);
  if (keywords.length === 0) return UNSPECIFIED_DIM_SCORE;
  const blob = textBlob(book);

  if (explicit.length > 0) {
    let hits = 0;
    for (const k of explicit) {
      if (blob.includes(k.toLowerCase())) hits += 1;
    }
    if (hits > 0) {
      const r = hits / explicit.length;
      if (r >= 0.67) return softLevels(1);
      if (r >= 0.34) return softLevels(0.8);
      return softLevels(0.5);
    }
    // 仅 inferred 命中：弱分，不能抬成强相关
    let infHits = 0;
    for (const k of inferred) {
      if (blob.includes(k.toLowerCase())) infHits += 1;
    }
    return infHits > 0 ? softLevels(0.2) : softLevels(0.05);
  }

  let hits = 0;
  for (const k of keywords) {
    if (blob.includes(k.toLowerCase())) hits += 1;
  }
  const r = hits / keywords.length;
  if (r >= 0.67) return softLevels(1);
  if (r >= 0.34) return softLevels(0.8);
  if (hits >= 1) return softLevels(0.5);
  return softLevels(0.05);
}

/**
 * 合成 topicScore（仍对应总权重 35%）：
 * canonical 15 + keyword 5 + semantic 15。
 * semantic 缺失时不参与，按剩余维归一化（勿用 0.05 冒充）。
 */
export function combineTopicScore(parts: {
  canonicalTopicScore: number;
  keywordScore: number;
  semanticScore?: number | null;
  hasSemanticEvidence?: boolean;
}): number {
  const w = CONTEXT_SCORE_WEIGHTS;
  const hasSem =
    parts.hasSemanticEvidence === true &&
    parts.semanticScore != null &&
    Number.isFinite(parts.semanticScore);
  let num =
    parts.canonicalTopicScore * w.canonicalTopic +
    parts.keywordScore * w.keyword;
  let den = w.canonicalTopic + w.keyword;
  if (hasSem) {
    num += (parts.semanticScore as number) * w.semantic;
    den += w.semantic;
  }
  return clamp01(num / den);
}

/** @deprecated 用 combineTopicScore；保留兼容 */
export function scoreTopic(
  book: Book,
  demand: StructuredDemandContext,
  semanticScore?: number,
): number {
  const hasSem = semanticScore != null && Number.isFinite(semanticScore);
  return combineTopicScore({
    canonicalTopicScore: scoreCanonicalTopic(book, demand),
    keywordScore: scoreKeywordLexical(book, demand),
    semanticScore: hasSem ? semanticScore : undefined,
    hasSemanticEvidence: hasSem,
  });
}

/**
 * 当前需求核心相关性（不含 profile/goal/style）。
 * 有 keywords 时更看 keyword + semantic；否则看 canonical + semantic。
 * semantic 缺失时不按 0.05 填充，按剩余维归一化。
 */
export function computeCoreRelevance(parts: {
  canonicalTopicScore: number;
  keywordScore: number;
  semanticScore?: number | null;
  hasKeywords: boolean;
  hasSemanticEvidence?: boolean;
}): number {
  const {
    canonicalTopicScore,
    keywordScore,
    hasKeywords,
  } = parts;
  const hasSem =
    parts.hasSemanticEvidence === true &&
    parts.semanticScore != null &&
    Number.isFinite(parts.semanticScore);
  const semanticScore = hasSem ? (parts.semanticScore as number) : null;

  let core: number;
  if (hasKeywords) {
    if (hasSem) {
      core =
        keywordScore * 0.4 +
        (semanticScore as number) * 0.4 +
        canonicalTopicScore * 0.2;
      const g = CONTEXT_RELEVANCE_GATE;
      if (
        keywordScore < g.keywordFloor &&
        (semanticScore as number) < g.semanticFloor
      ) {
        core = Math.min(core, g.weakCoreCeiling);
      }
    } else {
      core = keywordScore * (0.4 / 0.6) + canonicalTopicScore * (0.2 / 0.6);
    }
  } else if (hasSem) {
    core = canonicalTopicScore * 0.5 + (semanticScore as number) * 0.5;
  } else {
    core = canonicalTopicScore;
  }
  return Math.min(1, Math.max(0, core));
}

export type ContextRelevanceGateResult = {
  admit: boolean;
  cap: number;
  coreRelevance: number;
};

/** Profile/Goal/Style 只能在相关候选间排序，不能制造虚假高匹配。
 *  不再对 Match% 做 soft/hard cap（避免展示向调分）。
 */
export function applyContextRelevanceGate(
  coreRelevance: number,
): ContextRelevanceGateResult {
  const g = CONTEXT_RELEVANCE_GATE;
  if (coreRelevance < g.filterBelow) {
    return { admit: false, cap: 0, coreRelevance };
  }
  return { admit: true, cap: 100, coreRelevance };
}

function scoreOneGoal(book: Book, goal: string): number {
  const useCases = book.use_cases ?? [];
  if (useCases.some((u) => u === goal || u.includes(goal) || goal.includes(u))) {
    return softLevels(1);
  }

  const styles = book.content_style;
  if (goal === "工作调研") {
    if (styles.includes("case") || styles.includes("method")) return softLevels(0.8);
    if (styles.includes("theory")) return softLevels(0.5);
    return softLevels(0.2);
  }
  if (goal === "系统学习") {
    if (styles.includes("theory") || styles.includes("method")) return softLevels(0.8);
    if (styles.includes("case")) return softLevels(0.5);
    return softLevels(0.2);
  }
  if (goal === "快速入门") {
    if (book.difficulty === "light") return softLevels(1);
    if (styles.includes("method") || styles.includes("case")) return softLevels(0.8);
    if (book.difficulty === "deep" || styles.includes("theory")) return softLevels(0.2);
    return softLevels(0.5);
  }
  if (goal === "找灵感") {
    if (styles.includes("inspiration") || styles.includes("case")) return softLevels(0.8);
    return softLevels(0.5);
  }
  if (goal === "休闲阅读") {
    if (styles.includes("inspiration") || book.difficulty === "light") {
      return softLevels(0.8);
    }
    if (book.difficulty === "deep") return softLevels(0.2);
    return softLevels(0.5);
  }
  return softLevels(0.5);
}

export function scoreGoal(book: Book, demand: StructuredDemandContext): number {
  const goals =
    demand.goals && demand.goals.length > 0
      ? demand.goals
      : demand.goal?.trim()
        ? [demand.goal.trim()]
        : [];
  if (goals.length === 0) return UNSPECIFIED_DIM_SCORE;
  let best = 0.05;
  for (const g of goals) {
    best = Math.max(best, scoreOneGoal(book, g));
  }
  return best;
}

export function scoreProfile(
  book: Book,
  profileTags: string[],
  demand: StructuredDemandContext,
): number {
  if (profileTags.length === 0) return softLevels(0.5);

  const hits = overlapRatio(profileTags, book.tags);
  const topicHits =
    demand.topics.length === 0
      ? softLevels(0.5)
      : overlapRatio(demand.topics, book.tags);

  if (topicHits >= 0.8) return clamp01(Math.max(hits, 0.5));
  if (topicHits <= 0.2 && hits >= 0.8) return softLevels(0.5);
  return clamp01(hits);
}

export function scoreStyle(book: Book, demand: StructuredDemandContext): number {
  if (demand.styles.length === 0) return UNSPECIFIED_DIM_SCORE;

  if (demand.styles.includes("少理论")) {
    if (
      book.content_style.length === 1 &&
      book.content_style[0] === "theory"
    ) {
      return softLevels(0.2);
    }
    if (book.content_style.includes("case") || book.content_style.includes("method")) {
      return softLevels(0.8);
    }
    if (book.content_style.includes("theory")) return softLevels(0.5);
  }

  const wanted = new Set<ContentStyle>();
  for (const s of demand.styles) {
    if (s === "少理论") continue;
    for (const c of STYLE_PREF_TO_CONTENT[s] ?? []) wanted.add(c);
  }
  if (wanted.size === 0) {
    return demand.styles.includes("少理论") ? softLevels(0.8) : softLevels(0.5);
  }

  const bookStyles = book.content_style;
  if (bookStyles.length === 0) return softLevels(0.2);

  let hits = 0;
  for (const w of wanted) {
    if (bookStyles.includes(w)) hits += 1;
  }
  const r = hits / wanted.size;
  if (r >= 1) return softLevels(1);
  if (r >= 0.5) return softLevels(0.8);
  if (hits >= 1) return softLevels(0.5);
  return softLevels(0.2);
}

export function scoreDifficulty(
  book: Book,
  demand: StructuredDemandContext,
): number {
  const want = demand.difficulty;
  if (!want) return UNSPECIFIED_DIM_SCORE;
  const got = book.difficulty;
  if (!got) return softLevels(0.5);
  if (got === want) return softLevels(1);
  const order: ReadingDepth[] = ["light", "medium", "deep"];
  const d = Math.abs(order.indexOf(got) - order.indexOf(want));
  if (d === 1) return softLevels(0.5);
  return softLevels(0.2);
}

export function scoreTime(
  book: Book,
  demand: StructuredDemandContext,
): number {
  const bucket = demand.time;
  if (!bucket) return UNSPECIFIED_DIM_SCORE;

  const minutes = book.reading_minutes;
  const styles = book.content_style;
  const chapterFriendly =
    styles.includes("case") ||
    styles.includes("method") ||
    /手册|指南|案例|essay|chapter/i.test(textBlob(book));

  if (bucket === "15" || bucket === "30") {
    if (minutes != null && minutes <= 25) return softLevels(1);
    if (chapterFriendly && (book.difficulty === "light" || minutes == null)) {
      return softLevels(0.8);
    }
    if (book.difficulty === "deep" && (minutes == null || minutes > 60)) {
      return softLevels(0.2);
    }
    return softLevels(0.5);
  }

  if (bucket === "60") {
    if (minutes != null && minutes >= 20 && minutes <= 60) return softLevels(1);
    if (chapterFriendly) return softLevels(0.8);
    return softLevels(0.5);
  }

  if (bucket === "90") {
    if (book.difficulty === "deep" || (minutes != null && minutes >= 45)) {
      return softLevels(0.8);
    }
    return softLevels(0.5);
  }

  return softLevels(0.5);
}

export function combineScores(
  parts: Omit<
    DimensionScores,
    | "matchScore"
    | "topicScore"
    | "contextMatchScore"
    | "sortScore"
    | "relevanceBand"
  > & {
    topicScore?: number;
    canonicalTopicScore: number;
    keywordScore: number;
    semanticScore: number;
    hasKeywords?: boolean;
    absoluteGatePassed?: boolean;
    absoluteMeta?: {
      explicitCoreScore: number;
      inferredCoreScore: number;
      coreRelevance: number;
      rawSemanticSimilarity: number;
    };
    specificity?: ContextSpecificity;
    hasExplicitTopic?: boolean;
    hasInferredTopic?: boolean;
    /** @deprecated 用 hasExplicitTopic / hasInferredTopic */
    statedTopics?: boolean;
    /** 有语义召回证据（missing ≠ 低分） */
    hasSemanticEvidence?: boolean;
    statedGoal?: boolean;
    statedStyles?: boolean;
    statedDifficulty?: boolean;
    statedTime?: boolean;
  },
): DimensionScores {
  const hasKeywords = parts.hasKeywords ?? false;
  const hasSemanticEvidence = parts.hasSemanticEvidence === true;
  const hasExplicitTopic = parts.hasExplicitTopic === true;
  const hasInferredTopic = parts.hasInferredTopic === true;

  const topicScore =
    parts.topicScore ??
    combineTopicScore({
      canonicalTopicScore: parts.canonicalTopicScore,
      keywordScore: parts.keywordScore,
      semanticScore: hasSemanticEvidence ? parts.semanticScore : undefined,
      hasSemanticEvidence,
    });

  const legacyCore = computeCoreRelevance({
    canonicalTopicScore: parts.canonicalTopicScore,
    keywordScore: parts.keywordScore,
    semanticScore: hasSemanticEvidence ? parts.semanticScore : undefined,
    hasKeywords,
    hasSemanticEvidence,
  });
  const coreRelevance = parts.absoluteMeta?.coreRelevance ?? legacyCore;

  const w = resolveContextMatchWeights({
    hasExplicitTopic,
    hasInferredTopic,
    hasKeywords,
    hasSemantic: hasSemanticEvidence,
    statedGoal: parts.statedGoal === true,
    statedStyles: parts.statedStyles === true,
    statedDifficulty: parts.statedDifficulty === true,
    statedTime: parts.statedTime === true,
  });

  let num = 0;
  let den = 0;
  if (w.topic != null) {
    num += parts.canonicalTopicScore * w.topic;
    den += w.topic;
  }
  if (w.keyword != null) {
    num += parts.keywordScore * w.keyword;
    den += w.keyword;
  }
  if (w.semantic != null) {
    num += parts.semanticScore * w.semantic;
    den += w.semantic;
  }
  if (w.goal != null) {
    num += parts.goalScore * w.goal;
    den += w.goal;
  }
  if (w.style != null) {
    num += parts.styleScore * w.style;
    den += w.style;
  }
  if (w.difficulty != null) {
    num += parts.difficultyScore * w.difficulty;
    den += w.difficulty;
  }
  if (w.time != null) {
    num += parts.timeScore * w.time;
    den += w.time;
  }
  let contextMatchScore =
    den > 0 ? Math.round((num / den) * 100) : 0;

  let matchScoreCap = 100;
  let admittedByCoreGate = true;

  if (parts.absoluteGatePassed) {
    matchScoreCap = 100;
    admittedByCoreGate = true;
  } else {
    const gate = applyContextRelevanceGate(legacyCore);
    admittedByCoreGate = gate.admit;
    matchScoreCap = gate.cap;
    if (!gate.admit) {
      contextMatchScore = 0;
    }
  }

  contextMatchScore = Math.min(100, Math.max(0, contextMatchScore));

  const profileDelta = Math.max(
    -PROFILE_SORT_BOOST.maxDelta,
    Math.min(
      PROFILE_SORT_BOOST.maxDelta,
      Math.round((parts.profileScore - 0.5) * PROFILE_SORT_BOOST.scale),
    ),
  );
  const sortScore = contextMatchScore + profileDelta;
  const relevanceBand: RelevanceBand =
    relevanceBandFromContextMatch(contextMatchScore);

  return {
    topicScore,
    canonicalTopicScore: parts.canonicalTopicScore,
    keywordScore: parts.keywordScore,
    semanticScore: parts.semanticScore,
    semanticSimilarity: parts.semanticSimilarity,
    coreRelevance,
    matchScoreCap,
    explicitCoreScore: parts.absoluteMeta?.explicitCoreScore,
    inferredCoreScore: parts.absoluteMeta?.inferredCoreScore,
    admittedByCoreGate,
    rawSemanticSimilarity: parts.absoluteMeta?.rawSemanticSimilarity,
    rejectReason: null,
    goalScore: parts.goalScore,
    profileScore: parts.profileScore,
    styleScore: parts.styleScore,
    difficultyScore: parts.difficultyScore,
    timeScore: parts.timeScore,
    contextMatchScore,
    sortScore,
    relevanceBand,
    matchScore: contextMatchScore,
  };
}

export type ScoreInput = {
  book: Book;
  demand: StructuredDemandContext;
  profileInterestTags: string[];
  /** 归一化 semantic soft score；缺省 = missing（不进 Match%） */
  semanticScore?: number;
  /** 原始 similarity（debug）；缺省 = missing */
  semanticSimilarity?: number;
  /**
   * 已通过 absolute gate 时跳过旧版 post-hoc filter/cap，
   * 六维分只做个性化排序。
   */
  absoluteGatePassed?: boolean;
  absoluteMeta?: {
    explicitCoreScore: number;
    inferredCoreScore: number;
    coreRelevance: number;
    rawSemanticSimilarity: number;
  };
  specificity?: ContextSpecificity;
};

/** 统一评分入口：旧书 + 新书共用。
 *  semanticScore / semanticSimilarity 缺省 = missing evidence（不进 Match%）。
 */
export function scoreCandidate(input: ScoreInput): DimensionScores {
  const { book, demand, profileInterestTags } = input;
  const specificity = input.specificity ?? "MEDIUM";
  const hasSemanticEvidence =
    input.semanticScore != null && Number.isFinite(input.semanticScore);
  // 缺失时不要填 0.05；combineScores 靠 hasSemanticEvidence 跳过该维
  const semanticScore = hasSemanticEvidence
    ? (input.semanticScore as number)
    : 0;
  const canonicalTopicScore = scoreCanonicalTopic(book, demand, specificity);
  const keywordScore = scoreKeywordLexical(book, demand);
  const hasKeywords =
    demand.explicitKeywords != null
      ? demand.explicitKeywords.length > 0
      : (demand.keywords?.length ?? 0) > 0;
  const hasExplicitTopic = (demand.explicitTopics?.length ?? 0) > 0;
  const hasInferredTopic =
    (demand.inferredTopics?.length ?? 0) > 0 ||
    (!hasExplicitTopic && (demand.topics?.length ?? 0) > 0);

  return combineScores({
    canonicalTopicScore,
    keywordScore,
    semanticScore,
    semanticSimilarity: input.semanticSimilarity,
    hasKeywords,
    hasSemanticEvidence,
    hasExplicitTopic,
    hasInferredTopic,
    absoluteGatePassed: input.absoluteGatePassed,
    absoluteMeta: input.absoluteMeta,
    specificity,
    statedGoal:
      (demand.goals?.length ?? 0) > 0 || Boolean(demand.goal?.trim()),
    statedStyles: (demand.styles?.length ?? 0) > 0,
    statedDifficulty: demand.difficulty != null,
    statedTime: demand.time != null,
    goalScore: scoreGoal(book, demand),
    profileScore: scoreProfile(book, profileInterestTags, demand),
    styleScore: scoreStyle(book, demand),
    difficultyScore: scoreDifficulty(book, demand),
    timeScore: scoreTime(book, demand),
  });
}

export function resolveProfileTags(
  interests: string[] | undefined,
): string[] {
  return mapInterestsToBookTags(interests ?? []);
}

/** 是否通过 contextRelevanceGate 进入结果池 */
export function passesContextRelevanceGate(scores: DimensionScores): boolean {
  const core = scores.coreRelevance;
  if (core == null) return scores.matchScore > 0;
  return core >= CONTEXT_RELEVANCE_GATE.filterBelow && scores.matchScore > 0;
}
