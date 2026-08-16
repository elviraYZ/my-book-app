/**
 * 客户端可安全引用的推荐入口（不拉取 pipeline / Gemini / undici / async_hooks）。
 * 一律请求 /api/recommend，由服务端跑 Context-first 流水线。
 */

import { listDislikedBookIds } from "@/lib/data/book-actions";
import { mockStore } from "@/lib/data/mock-store";
import { getProfile } from "@/lib/data/profile";
import type {
  ContextTurn,
  RecommendContext,
  RecommendRequest,
  RecommendResponse,
} from "@/lib/types";

export function ensureContextTurns(context: RecommendContext): ContextTurn[] {
  if (context.turns && context.turns.length > 0) return context.turns;
  const text = context.raw_prompt?.trim();
  if (!text) return [];
  return [
    {
      id: "turn-legacy",
      text,
      created_at: new Date().toISOString(),
      source: "initial",
    },
  ];
}

function stripDislikedFromResult(
  result: RecommendResponse,
  dislikedIds: string[],
): RecommendResponse {
  if (dislikedIds.length === 0) return result;
  const ban = new Set(dislikedIds);
  const books = result.books.filter(
    (b) => !ban.has(b.book_id) && !(b.book?.id && ban.has(b.book.id)),
  );
  if (books.length === result.books.length) return result;
  return {
    ...result,
    books: books.map((b, i) => ({ ...b, rank: i + 1 })),
    total_count: books.length,
  };
}

export async function recommend(
  input: RecommendRequest,
  options?: { signal?: AbortSignal },
): Promise<RecommendResponse> {
  let profile = input.profile;
  if (!profile) {
    try {
      const p = await getProfile();
      profile = {
        roles: p.roles,
        interests: p.interests,
        reading_purposes: p.reading_purposes,
        reading_depth: p.reading_depth,
      };
    } catch {
      // 未登录等
    }
  }

  const payload: RecommendRequest = { ...input, profile };

  const res = await fetch("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });
  if (!res.ok) {
    throw new Error(`recommend failed: ${res.status}`);
  }
  const result = (await res.json()) as RecommendResponse;

  if (typeof window !== "undefined") {
    mockStore.saveLastRecommend(result);
  }
  return result;
}

export async function getLastRecommend(): Promise<RecommendResponse | null> {
  const cached = mockStore.getLastRecommend();
  if (!cached) return null;
  try {
    const disliked = await listDislikedBookIds();
    const next = stripDislikedFromResult(cached, disliked);
    if (next !== cached && typeof window !== "undefined") {
      mockStore.saveLastRecommend(next);
    }
    return next;
  } catch {
    return cached;
  }
}

/** 从本地缓存结果中立刻隐藏一本书（不感兴趣后返回列表用） */
export function hideBookFromLastRecommend(bookId: string): void {
  const cached = mockStore.getLastRecommend();
  if (!cached) return;
  const next = stripDislikedFromResult(cached, [bookId]);
  if (next !== cached) mockStore.saveLastRecommend(next);
}
