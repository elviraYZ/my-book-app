/**
 * 客户端可安全引用的推荐入口（不拉取 pipeline / Gemini / undici / async_hooks）。
 * 一律请求 /api/recommend，由服务端跑 Context-first 流水线。
 */

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
  return mockStore.getLastRecommend();
}
