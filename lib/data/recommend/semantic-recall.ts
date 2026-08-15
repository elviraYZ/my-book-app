import type { SupabaseClient } from "@supabase/supabase-js";

import { toPgVectorLiteral } from "@/lib/ai/embedding";
import {
  type DbWorkRow,
  fetchWorksByIds,
  mapWorkToBook,
} from "@/lib/data/books-ensure";
import {
  bumpSemanticRpcCall,
  bumpSemanticWorkFetchCall,
  isRecommendTimingEnabled,
} from "@/lib/data/recommend/dev-timing";
import { ABSOLUTE_RELEVANCE, RECALL_LIMIT } from "@/lib/data/recommend/weights";
import type { Book } from "@/lib/types";

export type SemanticHit = {
  book: Book;
  /** 原始 cosine similarity（约 0..1） */
  similarity: number;
};

export type SemanticRecallTimings = {
  semanticRpcMs: number;
  semanticFetchWorksMs: number;
  semanticMergeMs: number;
  semanticRpcCalls: number;
  semanticWorkFetchCalls: number;
};

/**
 * pgvector 语义召回：一次 RPC +（必要时）一次批量读 works。
 * 优先用已加载 catalog 做 join，禁止逐本 getCatalogBook。
 * 失败返回空数组（调用方 fallback lexical）。
 */
export async function recallSemanticCandidates(
  supabase: SupabaseClient | undefined,
  queryEmbedding: number[] | null,
  options: {
    limit?: number;
    /** 已加载的 catalog；命中优先从此 Map join */
    catalog?: Book[];
  } = {},
): Promise<{ hits: SemanticHit[]; timings?: SemanticRecallTimings }> {
  const limit = options.limit ?? RECALL_LIMIT;
  const timingOn = isRecommendTimingEnabled();
  const emptyTimings = (): SemanticRecallTimings => ({
    semanticRpcMs: 0,
    semanticFetchWorksMs: 0,
    semanticMergeMs: 0,
    semanticRpcCalls: 0,
    semanticWorkFetchCalls: 0,
  });

  if (!supabase || !queryEmbedding || queryEmbedding.length === 0) {
    return { hits: [], timings: timingOn ? emptyTimings() : undefined };
  }

  const catalogById = new Map(
    (options.catalog ?? []).map((b) => [b.id, b] as const),
  );

  try {
    let semanticRpcCalls = 0;
    let semanticWorkFetchCalls = 0;

    const tRpc0 = timingOn ? performance.now() : 0;
    bumpSemanticRpcCall();
    semanticRpcCalls = 1;
    const { data, error } = await supabase.rpc("match_works_by_embedding", {
      query_embedding: toPgVectorLiteral(queryEmbedding),
      match_count: limit,
    });
    const semanticRpcMs = timingOn ? performance.now() - tRpc0 : 0;

    if (error || !data) {
      console.warn("[semantic-recall] rpc failed:", error?.message);
      return {
        hits: [],
        timings: timingOn
          ? {
              semanticRpcMs,
              semanticFetchWorksMs: 0,
              semanticMergeMs: 0,
              semanticRpcCalls,
              semanticWorkFetchCalls: 0,
            }
          : undefined,
      };
    }

    const rows = data as { id: string; similarity: number }[];
    const missingIds: string[] = [];
    for (const row of rows) {
      if (!catalogById.has(row.id)) missingIds.push(row.id);
    }

    let semanticFetchWorksMs = 0;
    if (missingIds.length > 0) {
      const tFetch0 = timingOn ? performance.now() : 0;
      bumpSemanticWorkFetchCall();
      semanticWorkFetchCalls = 1;
      try {
        const works = await fetchWorksByIds(supabase, missingIds);
        for (const work of works as DbWorkRow[]) {
          const book = mapWorkToBook(work);
          if (book) catalogById.set(book.id, book);
        }
      } catch (err) {
        console.warn("[semantic-recall] batch fetch failed:", err);
      }
      semanticFetchWorksMs = timingOn ? performance.now() - tFetch0 : 0;
    }

    const tMerge0 = timingOn ? performance.now() : 0;
    const minSim = ABSOLUTE_RELEVANCE.minRawSemanticForRecall;
    const hits: SemanticHit[] = [];
    for (const row of rows) {
      const book = catalogById.get(row.id);
      if (!book) continue;
      const similarity = Number(row.similarity) || 0;
      // Top-K ≠ 真相关：绝对相似度过低则丢弃
      if (similarity < minSim) continue;
      hits.push({ book, similarity });
    }
    const semanticMergeMs = timingOn ? performance.now() - tMerge0 : 0;

    return {
      hits,
      timings: timingOn
        ? {
            semanticRpcMs,
            semanticFetchWorksMs,
            semanticMergeMs,
            semanticRpcCalls,
            semanticWorkFetchCalls,
          }
        : undefined,
    };
  } catch (err) {
    console.warn("[semantic-recall] failed:", err);
    return { hits: [], timings: timingOn ? emptyTimings() : undefined };
  }
}
