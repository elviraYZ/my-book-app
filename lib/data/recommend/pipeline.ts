import type { SupabaseClient } from "@supabase/supabase-js";

import { getAiProvider } from "@/lib/ai/config";
import { runWithAiRequestState } from "@/lib/ai/request-state";
import { listDislikedBookIds } from "@/lib/data/book-actions";
import { listCatalogBooks } from "@/lib/data/catalog";
import { isMockMode } from "@/lib/data/config";
import { ingestBooks } from "@/lib/data/ingest";
import type { IngestQuery } from "@/lib/data/ingest/types";
import { mockStore } from "@/lib/data/mock-store";
import { getProfile } from "@/lib/data/profile";
import {
  addTiming,
  createRecommendRequestId,
  isRecommendTimingEnabled,
  runWithRecommendTiming,
  snapshotRecommendTiming,
  timeAsync,
  timeSync,
} from "@/lib/data/recommend/dev-timing";
import {
  buildCoverageLogPayload,
  displayRejectReason,
  evaluateCoverage,
  isDisplayableRow,
  resolveUiTip,
} from "@/lib/data/recommend/coverage";
import { classifyTopicHit } from "@/lib/data/recommend/taxonomy-expand";
import { persistCoverageLog } from "@/lib/data/recommend/coverage-log";
import { enrichBooksForScoring } from "@/lib/data/recommend/enrich";
import {
  buildExplain,
  buildMatchReason,
  passesExclusions,
} from "@/lib/data/recommend/explain";
import { enrichTopMatchReasonsWithLlm } from "@/lib/data/recommend/explain-llm";
import { evaluateAbsoluteRelevance } from "@/lib/data/recommend/absolute-gate";
import { hybridRecallCandidates } from "@/lib/data/recommend/hybrid-recall";
import type { HybridRecallResult } from "@/lib/data/recommend/hybrid-recall";
import { parseDemandContextWithLLM } from "@/lib/data/recommend/parse-context-llm";
import { evaluateContextSpecificity } from "@/lib/data/recommend/specificity";
import { clampThemes } from "@/lib/data/recommend-tags";
import {
  resolveProfileTags,
  scoreCandidate,
} from "@/lib/data/recommend/score";
import { type ScoredRow } from "@/lib/data/recommend/sufficiency";
import {
  INGEST_PER_TAG,
  ONLINE_GOOGLE_INGEST_ENABLED,
  RECALL_EXPAND_STOP,
  RECALL_K_MAX,
  RECALL_LIMIT,
  TOP_N,
} from "@/lib/data/recommend/weights";
import type { ContextSpecificity } from "@/lib/data/recommend/weights";
import type {
  Book,
  ContextTurn,
  RecommendContext,
  RecommendRequest,
  RecommendResponse,
  StructuredDemandContext,
  TopicBook,
} from "@/lib/types";

export type RecommendPipelineOptions = {
  /** 服务端 supabase（coverage log / 可选 ingest） */
  supabase?: SupabaseClient;
  googleApiKey?: string;
  /**
   * 同步 Google 补库。MVP 默认 false（ONLINE_GOOGLE_INGEST_ENABLED）。
   * 仅显式传 true 时启用（保留代码路径供后续异步补库）。
   */
  enableIngest?: boolean;
};

function sortKey(scores: {
  sortScore?: number;
  contextMatchScore?: number;
  matchScore?: number;
}): number {
  return scores.sortScore ?? scores.contextMatchScore ?? scores.matchScore ?? 0;
}

function avgCore(rows: ScoredRow[], n: number): number {
  const slice = rows.slice(0, n);
  if (slice.length === 0) return 0;
  const sum = slice.reduce((acc, r) => acc + (r.scores.coreRelevance ?? 0), 0);
  return sum / slice.length;
}

/** 扩召回停止：展示数量 + Top3/Top5 core 质量 */
function recallExpandSatisfied(
  displayable: ScoredRow[],
  admittedSorted: ScoredRow[],
): boolean {
  const s = RECALL_EXPAND_STOP;
  if (displayable.length < s.minDisplayable) return false;
  // 质量看 admitted 排序后的 Top（含尚未过展示线的，更稳）
  if (avgCore(admittedSorted, 3) < s.top3CoreAvgMin) return false;
  if (avgCore(admittedSorted, 5) < s.top5CoreAvgMin) return false;
  return true;
}

function debugTitleNeedles(): string[] {
  const raw = process.env.RECOMMEND_DEBUG_TITLES?.trim();
  if (!raw) {
    return [
      "The Art of Game Design",
      "游戏设计工作坊",
      "Introduction to Game Design",
      "Advanced Game Design",
      "Game Design Prototyping",
    ];
  }
  return raw
    .split(/[,，|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function titleMatchesNeedle(title: string, needle: string): boolean {
  const t = title.toLowerCase();
  const n = needle.toLowerCase();
  return t.includes(n) || n.includes(t);
}

function logRecallDebugBooks(
  requestId: string,
  hybrid: HybridRecallResult,
  admitted: ScoredRow[],
  rejects: RejectSample[],
): void {
  const needles = debugTitleNeedles();
  if (needles.length === 0) return;

  const admittedById = new Map(admitted.map((r) => [r.book.id, r]));
  const rejectById = new Map(rejects.map((r) => [r.bookId, r]));

  for (const needle of needles) {
    const hits = hybrid.books.filter((b) => titleMatchesNeedle(b.title, needle));
    if (hits.length === 0) {
      // 也扫 reject 里没有的：说明根本未召回
      console.log(`[recommend:book-debug] rid=${requestId}`, {
        needle,
        inUnion: false,
        recalledByPrimaryTopic: false,
        recalledByLexical: false,
        recalledBySemantic: false,
        admitted: false,
        rejectReason: "not_in_recall_union",
      });
      continue;
    }
    for (const book of hits) {
      const ch = hybrid.channelByBookId.get(book.id) ?? {
        primary: false,
        lexical: false,
        semantic: false,
      };
      const row = admittedById.get(book.id);
      const rej = rejectById.get(book.id);
      console.log(`[recommend:book-debug] rid=${requestId}`, {
        needle,
        title: book.title,
        tags: (book.tags ?? []).slice(0, 8),
        primary_topics: (book.primary_topics ?? []).slice(0, 4),
        recalledByPrimaryTopic: ch.primary,
        recalledByLexical: ch.lexical,
        recalledBySemantic: ch.semantic,
        admitted: Boolean(row),
        rejectReason: row ? null : (rej?.rejectReason ?? "unknown"),
        rawSemantic:
          row?.scores.rawSemanticSimilarity ??
          hybrid.semanticSimilarityByBookId.get(book.id) ??
          rej?.rawSemanticSimilarity ??
          null,
        coreRelevance:
          row?.scores.coreRelevance ?? rej?.coreRelevance ?? null,
        contextMatch:
          row?.scores.contextMatchScore ?? row?.scores.matchScore ?? null,
      });
    }
  }
}

type RejectSample = {
  bookId: string;
  title: string;
  tags?: string[];
  rejectReason: string | null;
  explicitCoreScore: number;
  inferredCoreScore: number;
  coreRelevance: number;
  rawSemanticSimilarity: number;
  topicScore?: number;
  keywordScore?: number;
};

function scorePool(
  books: Book[],
  demand: StructuredDemandContext,
  profileInterestTags: string[],
  semanticScoreByBookId?: Map<string, number>,
  semanticSimilarityByBookId?: Map<string, number>,
  specificity: ContextSpecificity = "MEDIUM",
): { admitted: ScoredRow[]; rejects: RejectSample[] } {
  const enriched = enrichBooksForScoring(books).filter((b) =>
    passesExclusions(b, demand),
  );
  const admitted: ScoredRow[] = [];
  const rejects: RejectSample[] = [];

  for (const book of enriched) {
    const hasSemHit = semanticSimilarityByBookId?.has(book.id) === true;
    const rawSim = hasSemHit
      ? (semanticSimilarityByBookId!.get(book.id) as number)
      : null;
    const abs = evaluateAbsoluteRelevance(book, demand, rawSim, specificity);
    if (!abs.admit) {
      if (rejects.length < 24) {
        rejects.push({
          bookId: book.id,
          title: book.title,
          tags: (book.tags ?? []).slice(0, 8),
          rejectReason: abs.rejectReason,
          explicitCoreScore: abs.explicitCoreScore,
          inferredCoreScore: abs.inferredCoreScore,
          coreRelevance: abs.coreRelevance,
          rawSemanticSimilarity: abs.rawSemanticSimilarity,
          topicScore: abs.explicitTopicScore,
          keywordScore: abs.explicitKeywordScore,
        });
      }
      continue;
    }

    const scores = scoreCandidate({
      book,
      demand,
      profileInterestTags,
      semanticScore: hasSemHit
        ? semanticScoreByBookId?.get(book.id)
        : undefined,
      semanticSimilarity: hasSemHit ? (rawSim as number) : undefined,
      absoluteGatePassed: true,
      absoluteMeta: {
        explicitCoreScore: abs.explicitCoreScore,
        inferredCoreScore: abs.inferredCoreScore,
        coreRelevance: abs.coreRelevance,
        rawSemanticSimilarity: abs.rawSemanticSimilarity,
      },
      specificity,
    });
    scores.admittedByCoreGate = true;
    scores.rejectReason = null;
    admitted.push({ book, scores });
  }

  return { admitted, rejects };
}

function buildIngestQueries(
  demand: StructuredDemandContext,
): IngestQuery[] {
  // 正式 taxonomy 才进 tags；keywords 只进 q
  const taxonomy = clampThemes(demand.topics);
  const queries: IngestQuery[] = [];

  for (const q of demand.searchQueries) {
    queries.push({
      q,
      tags: taxonomy.slice(0, 3),
    });
  }
  for (const t of taxonomy) {
    if (!queries.some((x) => x.q === t || x.tags.includes(t))) {
      queries.push({ q: t, tags: [t] });
    }
  }
  for (const k of (demand.explicitKeywords ?? demand.keywords).slice(0, 4)) {
    if (!queries.some((x) => x.q === k)) {
      queries.push({
        q: taxonomy[0] ? `${taxonomy[0]} ${k}` : k,
        tags: taxonomy.slice(0, 2),
      });
    }
  }
  return queries.slice(0, 8);
}

function bucketToSession(bucket: string | null | undefined): {
  session_minutes?: number;
  session_minutes_min?: number;
  session_minutes_max?: number;
} {
  if (bucket === "15") {
    return { session_minutes: 15, session_minutes_min: 1, session_minutes_max: 15 };
  }
  if (bucket === "30") {
    return {
      session_minutes: 25,
      session_minutes_min: 15,
      session_minutes_max: 30,
    };
  }
  if (bucket === "60") {
    return {
      session_minutes: 45,
      session_minutes_min: 30,
      session_minutes_max: 60,
    };
  }
  if (bucket === "90") {
    return {
      session_minutes: 90,
      session_minutes_min: 60,
      session_minutes_max: 180,
    };
  }
  return {};
}

async function resolveProfileSlice(
  input: RecommendRequest,
): Promise<RecommendRequest["profile"] | undefined> {
  if (input.profile) return input.profile;
  try {
    const p = await getProfile();
    return {
      roles: p.roles,
      interests: p.interests,
      reading_purposes: p.reading_purposes,
      reading_depth: p.reading_depth,
    };
  } catch {
    return undefined;
  }
}

function toTopicBooks(
  rows: ScoredRow[],
  demand: StructuredDemandContext,
  topicId: string | null,
  sessionId: string,
  now: string,
): TopicBook[] {
  // 不强凑 Top N：有多少 admitted 相关结果就展示多少（上限 TOP_N）
  const sliced = rows.slice(0, TOP_N);

  return sliced.map((row, index) => {
    const { book, scores } = row;
    const themeHits = demand.topics.filter((t) =>
      book.tags.some((x) => x.includes(t) || t.includes(x)),
    );
    const contextMatch = scores.contextMatchScore ?? scores.matchScore;
    return {
      id: `rec-${book.id}-${sessionId}`,
      topic_id: topicId,
      session_id: sessionId,
      book_id: book.id,
      // UI % = 真实 contextMatchScore，无 display calibration
      match_score: contextMatch,
      relevance_band: scores.relevanceBand ?? null,
      match_reason: buildMatchReason(book, demand, scores),
      matched_tags: [...new Set([...themeHits, ...book.tags])].slice(0, 4),
      rank: index + 1,
      explain: buildExplain(book, demand, scores),
      scores,
      created_at: now,
      book,
      user_status: null,
    };
  });
}

/**
 * Context-first 推荐流水线（AI Search）：
 * Context → hybrid → absolute gate → contextMatch + profile 微调排序
 * → coverage log（GOOD/THIN/GAP）
 * MVP 不在线同步 Google；ingest 代码保留，仅 enableIngest===true 时启用。
 */
export async function runRecommendPipeline(
  input: RecommendRequest,
  options: RecommendPipelineOptions = {},
): Promise<RecommendResponse> {
  const requestId = createRecommendRequestId();
  return runWithRecommendTiming(requestId, () =>
    runWithAiRequestState(() =>
      runRecommendPipelineInner(input, options, requestId),
    ),
  );
}

async function runRecommendPipelineInner(
  input: RecommendRequest,
  options: RecommendPipelineOptions,
  requestId: string,
): Promise<RecommendResponse> {
  const timingOn = isRecommendTimingEnabled();

  const topicId = input.topic_id ?? null;
  const now = new Date().toISOString();
  const addition = (input.prompt || input.special_notes || "").trim();
  const fallbackText = (input.previous_turns ?? [])
    .map((t) => t.text.trim())
    .filter(Boolean)
    .join("\n");
  const demandText = addition || fallbackText;

  const turns: ContextTurn[] = demandText
    ? [
        {
          id: `turn-${Date.now()}`,
          text: demandText,
          created_at: now,
          source: "initial",
        },
      ]
    : [];

  const profile = await resolveProfileSlice(input);
  const requestWithProfile: RecommendRequest = { ...input, profile };
  const { demand, source: demandSource } = await timeAsync(
    "contextLlmMs",
    () => parseDemandContextWithLLM(demandText, requestWithProfile),
  );
  const profileInterestTags = resolveProfileTags(profile?.interests);
  const contextSpecificity = evaluateContextSpecificity(demand, demandText);
  const sessionFields = bucketToSession(demand.time);

  const context: RecommendContext = {
    raw_prompt: demandText || demand.topics.join("、"),
    turns,
    goal: demand.goal,
    goals: demand.goals ?? (demand.goal ? [demand.goal] : []),
    themes: demand.topics,
    keywords: demand.keywords,
    excludedTopics: demand.excludedTopics,
    excludedKeywords: demand.excludedKeywords,
    excludedConcepts: demand.excludedConcepts,
    preferences: demand.styles,
    depth: demand.difficulty ?? undefined,
    session_bucket: demand.time,
    ...sessionFields,
    special_notes: input.special_notes,
    source: topicId ? "topic" : "ai_input",
    topic_id: topicId,
  };

  const sessionId = `session-${Date.now()}`;
  // mock：用本地 catalog；api：三路直查 DB，不把 listCatalogBooks(300) 当全集
  const mockCatalog = isMockMode() ? await listCatalogBooks() : undefined;

  let recallK = RECALL_LIMIT;
  let hybrid: HybridRecallResult = await hybridRecallCandidates(demand, {
    supabase: options.supabase,
    catalog: mockCatalog,
    limit: recallK,
  });
  const recordHybridTimings = (h: HybridRecallResult) => {
    if (!h.timings) return;
    addTiming("lexicalRecallMs", h.timings.lexicalRecallMs);
    addTiming("primaryRecallMs", h.timings.primaryRecallMs);
    addTiming("queryEmbeddingMs", h.timings.queryEmbeddingMs);
    addTiming("semanticBuildQueryMs", h.timings.semanticBuildQueryMs);
    addTiming("semanticEmbeddingMs", h.timings.semanticEmbeddingMs);
    addTiming("semanticRecallMs", h.timings.semanticRecallMs);
    if (h.timings.semanticRpcMs != null) {
      addTiming("semanticRpcMs", h.timings.semanticRpcMs);
    }
    if (h.timings.semanticFetchWorksMs != null) {
      addTiming("semanticFetchWorksMs", h.timings.semanticFetchWorksMs);
    }
    if (h.timings.semanticMergeMs != null) {
      addTiming("semanticMergeMs", h.timings.semanticMergeMs);
    }
  };
  if (timingOn) recordHybridTimings(hybrid);

  const dislikedIds = await listDislikedBookIds(options.supabase).catch(
    () => [] as string[],
  );
  const dislikedSet = new Set(dislikedIds);
  const withoutDisliked = (books: Book[]) =>
    dislikedSet.size === 0
      ? books
      : books.filter((b) => !dislikedSet.has(b.id));

  hybrid = {
    ...hybrid,
    books: withoutDisliked(hybrid.books),
  };

  let cachedQueryEmbedding = hybrid.queryEmbedding;
  let rejectSamples: RejectSample[] = [];
  let scored = timeSync("scoreMs", () => {
    const pool = scorePool(
      hybrid.books,
      demand,
      profileInterestTags,
      hybrid.semanticScoreByBookId,
      hybrid.semanticSimilarityByBookId,
      contextSpecificity,
    );
    rejectSamples = pool.rejects;
    return pool.admitted.sort(
      (a, b) => sortKey(b.scores) - sortKey(a.scores),
    );
  });

  // 扩 K：数量不足或 Top core 质量不够时，放大每路 Top-K 再召回
  while (!recallExpandSatisfied(
    scored.filter((r) => isDisplayableRow(r, contextSpecificity)),
    scored,
  )) {
    if (recallK >= RECALL_K_MAX) break;
    const nextK = Math.min(recallK * 2, RECALL_K_MAX);
    if (nextK <= recallK) break;
    recallK = nextK;
    if (timingOn) {
      console.log(
        `[recommend:expand-k] rid=${requestId} → K=${recallK}`,
      );
    }
    hybrid = await hybridRecallCandidates(demand, {
      supabase: options.supabase,
      catalog: mockCatalog,
      limit: recallK,
      queryEmbedding: cachedQueryEmbedding,
    });
    if (timingOn) recordHybridTimings(hybrid);
    hybrid = {
      ...hybrid,
      books: withoutDisliked(hybrid.books),
    };
    cachedQueryEmbedding = hybrid.queryEmbedding ?? cachedQueryEmbedding;
    const pool = scorePool(
      hybrid.books,
      demand,
      profileInterestTags,
      hybrid.semanticScoreByBookId,
      hybrid.semanticSimilarityByBookId,
      contextSpecificity,
    );
    rejectSamples = pool.rejects;
    scored = pool.admitted.sort(
      (a, b) => sortKey(b.scores) - sortKey(a.scores),
    );
  }

  if (
    isRecommendTimingEnabled() ||
    Boolean(process.env.RECOMMEND_DEBUG_TITLES?.trim())
  ) {
    logRecallDebugBooks(requestId, hybrid, scored, rejectSamples);
  }

  let ingested = false;
  let ingestedCount = 0;

  // MVP：默认关闭同步 Google；仅显式 enableIngest 且开关打开时走旧路径
  const googleTriggered =
    ONLINE_GOOGLE_INGEST_ENABLED &&
    options.enableIngest === true &&
    !isMockMode() &&
    Boolean(options.supabase) &&
    Boolean(options.googleApiKey?.trim());

  if (googleTriggered && options.supabase && options.googleApiKey) {
    try {
      const taxonomyTags = clampThemes(demand.topics);
      const result = await timeAsync("googleIngestMs", () =>
        ingestBooks({
          queries: buildIngestQueries(demand),
          tags: taxonomyTags,
          demand,
          perTag: INGEST_PER_TAG,
          googleApiKey: options.googleApiKey!,
          supabase: options.supabase!,
          maxPagesPerQuery: 3,
          pageSize: 20,
        }),
      );
      ingestedCount = result.newWorksTotal;
      ingested = ingestedCount > 0;

      const tRerank0 = timingOn ? performance.now() : 0;
      hybrid = await hybridRecallCandidates(demand, {
        supabase: options.supabase,
        catalog: mockCatalog,
        limit: recallK,
        queryEmbedding: cachedQueryEmbedding,
      });
      hybrid = {
        ...hybrid,
        books: withoutDisliked(hybrid.books),
      };
      const pool = scorePool(
        hybrid.books,
        demand,
        profileInterestTags,
        hybrid.semanticScoreByBookId,
        hybrid.semanticSimilarityByBookId,
        contextSpecificity,
      );
      rejectSamples = pool.rejects;
      scored = pool.admitted.sort(
        (a, b) => sortKey(b.scores) - sortKey(a.scores),
      );
      if (timingOn) {
        addTiming("rerankMs", performance.now() - tRerank0);
      }
    } catch (err) {
      console.error("[recommend] ingest failed:", err);
    }
  }

  // 展示：绝对 gate 已过 + 按 specificity 的展示底线
  const displayable = scored.filter((r) =>
    isDisplayableRow(r, contextSpecificity),
  );
  const displayRejected = scored
    .map((r) => ({
      row: r,
      reason: displayRejectReason(r, contextSpecificity),
    }))
    .filter(
      (x): x is { row: (typeof scored)[number]; reason: "match_below" | "core_below" } =>
        x.reason != null,
    );
  const displayRejectCounts = {
    match_below: displayRejected.filter((x) => x.reason === "match_below").length,
    core_below: displayRejected.filter((x) => x.reason === "core_below").length,
  };
  const coverage = timeSync("sufficiencyMs", () =>
    evaluateCoverage(scored, contextSpecificity),
  );

  const booksBase = toTopicBooks(
    displayable,
    demand,
    topicId,
    sessionId,
    now,
  );

  const explainResult = await timeAsync("explainLlmMs", () =>
    enrichTopMatchReasonsWithLlm(booksBase, demandText, demand),
  );
  const books = explainResult.books;

  const matchScores = books.map((b) => b.match_score ?? 0);
  const uiTip = resolveUiTip(matchScores, contextSpecificity);

  if (timingOn) {
    const topicRoots =
      (demand.explicitTopics?.length ?? 0) > 0
        ? (demand.explicitTopics ?? [])
        : (demand.topics ?? []);
    console.log(`[recommend:funnel] rid=${requestId}`, {
      query: demandText.slice(0, 120),
      specificity: contextSpecificity,
      explicitTopics: demand.explicitTopics ?? [],
      explicitKeywords: demand.explicitKeywords ?? [],
      topics: demand.topics,
      keywords: demand.keywords,
      lexicalCandidateCount: hybrid.lexicalCandidateCount,
      semanticCandidateCount: hybrid.semanticCandidateCount,
      primaryCandidateCount: hybrid.primaryCandidateCount,
      unionCandidateCount: hybrid.unionCandidateCount,
      recallLimitK: hybrid.recallLimitK,
      admittedCount: scored.length,
      displayableCount: displayable.length,
      displayRejectCounts,
      topMatch: matchScores[0] ?? 0,
      uiTip,
      rejectSample: rejectSamples.slice(0, 12).map((r) => ({
        title: r.title,
        tags: r.tags,
        reason: r.rejectReason,
        rawSem: Number(r.rawSemanticSimilarity.toFixed(3)),
        topic: r.topicScore,
        keyword: r.keywordScore,
        core: Number(r.coreRelevance.toFixed(3)),
      })),
      displayRejectSample: displayRejected.slice(0, 12).map(({ row, reason }) => ({
        title: row.book.title,
        tags: (row.book.tags ?? []).slice(0, 6),
        displayRejectReason: reason,
        match: row.scores.contextMatchScore ?? row.scores.matchScore,
        core: Number((row.scores.coreRelevance ?? 0).toFixed(3)),
        topic: row.scores.canonicalTopicScore,
        topicTier: classifyTopicHit(row.book.tags ?? [], topicRoots),
      })),
      admitSample: scored.slice(0, 8).map((r) => ({
        title: r.book.title,
        tags: (r.book.tags ?? []).slice(0, 6),
        match: r.scores.contextMatchScore ?? r.scores.matchScore,
        topic: r.scores.canonicalTopicScore,
        topicTier: classifyTopicHit(r.book.tags ?? [], topicRoots),
        sem: r.scores.semanticScore,
        rawSem: r.scores.rawSemanticSimilarity,
      })),
    });
  }

  const coveragePayload = buildCoverageLogPayload(
    requestId,
    demandText,
    demand,
    coverage,
    { contextSpecificity, uiTip },
  );
  // 后台记录缺口；不阻断响应
  void persistCoverageLog(options.supabase, coveragePayload);

  const messageParts = [
    isMockMode() ? "mock" : "catalog",
    "context-match",
    demandSource === "llm" ? `context:${getAiProvider()}` : "context:rules",
    hybrid.queryEmbeddingUsed ? "recall:hybrid" : "recall:lexical",
    `coverage:${coverage.status}`,
    `specificity:${contextSpecificity}`,
    `tip:${uiTip}`,
    `explain:${explainResult.source}`,
  ];
  if (ingested) messageParts.push(`ingested:${ingestedCount}`);
  if (coverage.status === "GAP" || books.length === 0) {
    messageParts.push("no-confident-results");
  }
  if (profileInterestTags.length > 0) {
    messageParts.push(`profile-sort-boost`);
  }
  if (timingOn) messageParts.push(`rid:${requestId}`);

  const response: RecommendResponse = {
    ok: true,
    session_id: sessionId,
    context,
    demand,
    books,
    total_count: displayable.length,
    message: messageParts.join(" · "),
    ingested,
    ingested_count: ingestedCount,
    coverage_status: coverage.status,
    top_context_match: coverage.topContextMatch,
    context_specificity: contextSpecificity,
    ui_tip: uiTip,
    show_coverage_tip: uiTip === "coverage_gap",
  };

  if (timingOn) {
    const semanticSimilarity: Record<string, number> = {};
    for (const [id, sim] of hybrid.semanticSimilarityByBookId) {
      semanticSimilarity[id] = sim;
    }
    response.debug = {
      requestId,
      lexicalCandidateCount: hybrid.lexicalCandidateCount,
      semanticCandidateCount: hybrid.semanticCandidateCount,
      primaryCandidateCount: hybrid.primaryCandidateCount,
      unionCandidateCount: hybrid.unionCandidateCount,
      recallLimitK: hybrid.recallLimitK,
      queryEmbeddingUsed: hybrid.queryEmbeddingUsed,
      semanticSimilarity,
      sufficiency: {
        rawTopScore: coverage.topContextMatch,
        displayTopScore: books[0]?.match_score ?? 0,
        qualifiedCountRaw60: coverage.highMatchCount,
        topicCoverage: 0,
        keywordCoverage: 0,
        localAbsoluteHits: coverage.admittedCount,
        googleTriggered,
        ingestedWorks: ingestedCount,
        enough: coverage.status === "GOOD",
        reasons: coverage.reasons,
      },
      rejects: rejectSamples,
      scores: books.map((b) => ({
        bookId: b.book_id,
        matchScore: b.scores?.contextMatchScore ?? b.scores?.matchScore ?? 0,
        displayMatchScore: b.match_score ?? undefined,
        topicScore: b.scores?.topicScore ?? 0,
        canonicalTopicScore: b.scores?.canonicalTopicScore,
        keywordScore: b.scores?.keywordScore,
        semanticScore: b.scores?.semanticScore,
        coreRelevance: b.scores?.coreRelevance,
        explicitCoreScore: b.scores?.explicitCoreScore,
        inferredCoreScore: b.scores?.inferredCoreScore,
        rawSemanticSimilarity:
          b.scores?.rawSemanticSimilarity ?? b.scores?.semanticSimilarity,
        admittedByCoreGate: b.scores?.admittedByCoreGate,
        rejectReason: b.scores?.rejectReason ?? null,
        matchScoreCap: b.scores?.matchScoreCap,
        goalScore: b.scores?.goalScore ?? 0,
        profileScore: b.scores?.profileScore ?? 0,
        styleScore: b.scores?.styleScore ?? 0,
        difficultyScore: b.scores?.difficultyScore ?? 0,
        timeScore: b.scores?.timeScore ?? 0,
      })),
      timing: snapshotRecommendTiming() ?? undefined,
    };

    console.log(`[recommend:coverage] rid=${requestId}`, {
      status: coverage.status,
      specificity: contextSpecificity,
      uiTip,
      admittedCount: coverage.admittedCount,
      highMatchCount: coverage.highMatchCount,
      topContextMatch: coverage.topContextMatch,
      topCoreRelevance: coverage.topCoreRelevance,
      googleTriggered,
      reasons: coverage.reasons,
    });
  }

  mockStore.saveLastRecommend(response);
  return response;
}
