/**
 * Hybrid 召回：Primary ∪ Lexical ∪ Semantic。
 * 各路独立在完整 DB 上召回；80 是每路初始 Top-K，不是全局硬上限。
 * Primary 强命中不受 lexical/semantic 的 K 截断。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { embedText } from "@/lib/ai/embedding";
import { listCatalogBooks } from "@/lib/data/catalog";
import { isMockMode } from "@/lib/data/config";
import {
  bumpQueryEmbeddingCall,
  isRecommendTimingEnabled,
} from "@/lib/data/recommend/dev-timing";
import {
  buildQueryEmbeddingText,
  normalizeSemanticSimilarity,
} from "@/lib/data/recommend/embedding-text";
import { recallByPrimaryTopics } from "@/lib/data/recommend/primary-recall";
import { recallLexicalCandidates } from "@/lib/data/recommend/recall";
import {
  recallSemanticCandidates,
  type SemanticRecallTimings,
} from "@/lib/data/recommend/semantic-recall";
import {
  PRIMARY_RECALL_CAP,
  RECALL_LIMIT,
} from "@/lib/data/recommend/weights";
import type { Book, StructuredDemandContext } from "@/lib/types";

export type HybridRecallTimings = {
  lexicalRecallMs: number;
  primaryRecallMs: number;
  queryEmbeddingMs: number;
  semanticBuildQueryMs: number;
  semanticEmbeddingMs: number;
  semanticRecallMs: number;
  queryEmbeddingApiCalls: number;
} & Partial<SemanticRecallTimings>;

export type RecallChannelFlags = {
  primary: boolean;
  lexical: boolean;
  semantic: boolean;
};

export type HybridRecallResult = {
  books: Book[];
  primaryCandidateCount: number;
  lexicalCandidateCount: number;
  semanticCandidateCount: number;
  unionCandidateCount: number;
  recallLimitK: number;
  queryEmbeddingUsed: boolean;
  queryEmbedding: number[] | null;
  semanticScoreByBookId: Map<string, number>;
  semanticSimilarityByBookId: Map<string, number>;
  /** bookId → 哪几路召回命中 */
  channelByBookId: Map<string, RecallChannelFlags>;
  timings?: HybridRecallTimings;
};

/**
 * @param limit 每路 Top-K（lexical/semantic）；primary cap = max(PRIMARY_RECALL_CAP, limit)
 */
export async function hybridRecallCandidates(
  demand: StructuredDemandContext,
  options: {
    supabase?: SupabaseClient;
    /** mock 或调试用全量书目；api 模式优先直查 DB */
    catalog?: Book[];
    limit?: number;
    queryEmbedding?: number[] | null;
  } = {},
): Promise<HybridRecallResult> {
  const limit = options.limit ?? RECALL_LIMIT;
  const primaryCap = Math.max(PRIMARY_RECALL_CAP, limit);
  const timingOn = isRecommendTimingEnabled();
  const useMockCatalog = isMockMode() || !options.supabase;
  const catalog =
    options.catalog ??
    (useMockCatalog ? await listCatalogBooks() : undefined);

  const tPrimary0 = timingOn ? performance.now() : 0;
  const primaryBooks = await recallByPrimaryTopics(demand, {
    supabase: options.supabase,
    catalog,
    cap: primaryCap,
  });
  const primaryRecallMs = timingOn ? performance.now() - tPrimary0 : 0;
  const primaryIds = new Set(primaryBooks.map((b) => b.id));

  const tLexical0 = timingOn ? performance.now() : 0;
  const lexical = await recallLexicalCandidates(demand, {
    supabase: options.supabase,
    catalog,
    limit,
  });
  const lexicalRecallMs = timingOn ? performance.now() - tLexical0 : 0;
  const lexicalIds = new Set(lexical.map((b) => b.id));

  let queryEmbedding: number[] | null;
  let queryEmbeddingMs = 0;
  let semanticBuildQueryMs = 0;
  let semanticEmbeddingMs = 0;
  let queryEmbeddingApiCalls = 0;
  if ("queryEmbedding" in options) {
    queryEmbedding = options.queryEmbedding ?? null;
  } else {
    const tEmb0 = timingOn ? performance.now() : 0;
    try {
      const tBuild0 = timingOn ? performance.now() : 0;
      const qText = buildQueryEmbeddingText(demand);
      semanticBuildQueryMs = timingOn ? performance.now() - tBuild0 : 0;

      queryEmbeddingApiCalls = 1;
      bumpQueryEmbeddingCall();
      const tApi0 = timingOn ? performance.now() : 0;
      queryEmbedding = await embedText(qText);
      semanticEmbeddingMs = timingOn ? performance.now() - tApi0 : 0;
    } catch {
      queryEmbedding = null;
    }
    queryEmbeddingMs = timingOn ? performance.now() - tEmb0 : 0;
  }
  const queryEmbeddingUsed = Boolean(queryEmbedding);

  const tSem0 = timingOn ? performance.now() : 0;
  const { hits: semanticHits, timings: semTimings } =
    await recallSemanticCandidates(options.supabase, queryEmbedding, {
      limit,
      catalog,
    });
  const semanticRecallMs = timingOn ? performance.now() - tSem0 : 0;

  const semanticScoreByBookId = new Map<string, number>();
  const semanticSimilarityByBookId = new Map<string, number>();
  const semanticIds = new Set<string>();
  for (const hit of semanticHits) {
    semanticIds.add(hit.book.id);
    semanticSimilarityByBookId.set(hit.book.id, hit.similarity);
    semanticScoreByBookId.set(
      hit.book.id,
      normalizeSemanticSimilarity(hit.similarity),
    );
  }

  const channelByBookId = new Map<string, RecallChannelFlags>();
  const merged: Book[] = [];
  const seen = new Set<string>();

  const touch = (b: Book, ch: Partial<RecallChannelFlags>) => {
    const prev = channelByBookId.get(b.id) ?? {
      primary: false,
      lexical: false,
      semantic: false,
    };
    channelByBookId.set(b.id, {
      primary: prev.primary || Boolean(ch.primary),
      lexical: prev.lexical || Boolean(ch.lexical),
      semantic: prev.semantic || Boolean(ch.semantic),
    });
    if (!seen.has(b.id)) {
      seen.add(b.id);
      merged.push(b);
    }
  };

  // Primary 先入：不受 lexical/semantic K 截断
  for (const b of primaryBooks) touch(b, { primary: true });
  for (const b of lexical) touch(b, { lexical: true });
  const semanticSorted = [...semanticHits].sort(
    (a, b) => b.similarity - a.similarity,
  );
  for (const hit of semanticSorted) {
    touch(hit.book, { semantic: true });
  }

  // 回填 channel（仅出现在一路的）
  for (const id of primaryIds) {
    const c = channelByBookId.get(id);
    if (c) c.primary = true;
  }
  for (const id of lexicalIds) {
    const c = channelByBookId.get(id);
    if (c) c.lexical = true;
  }
  for (const id of semanticIds) {
    const c = channelByBookId.get(id);
    if (c) c.semantic = true;
  }

  return {
    books: merged,
    primaryCandidateCount: primaryBooks.length,
    lexicalCandidateCount: lexical.length,
    semanticCandidateCount: semanticHits.length,
    unionCandidateCount: merged.length,
    recallLimitK: limit,
    queryEmbeddingUsed,
    queryEmbedding,
    semanticScoreByBookId,
    semanticSimilarityByBookId,
    channelByBookId,
    timings: timingOn
      ? {
          lexicalRecallMs,
          primaryRecallMs,
          queryEmbeddingMs,
          semanticBuildQueryMs,
          semanticEmbeddingMs,
          semanticRecallMs,
          queryEmbeddingApiCalls,
          ...semTimings,
        }
      : undefined,
  };
}
