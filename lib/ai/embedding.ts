/**
 * Embedding provider abstraction。
 * 默认 Gemini gemini-embedding-001 @ 768 维（outputDimensionality）。
 * 维度必须与 supabase works.embedding vector(N) / match_works_by_embedding 一致。
 * 缺 key / 失败时返回 null，调用方必须 fallback，不得让推荐整体失败。
 */

import {
  getAiApiKey,
  getAiProvider,
  getEmbeddingDimensions,
  getEmbeddingModel,
  getLlmTimeoutMs,
  hasEmbeddingProvider,
  type AiProvider,
} from "@/lib/ai/config";
import {
  isAiNetworkFailed,
  isNetworkishError,
  markAiNetworkFailed,
} from "@/lib/ai/request-state";
import { proxyFetch } from "@/lib/server/proxy-fetch";

export {
  getEmbeddingDimensions,
  getEmbeddingModel,
  hasEmbeddingProvider,
} from "@/lib/ai/config";

/** @deprecated 用 getEmbeddingModel()；保留兼容旧脚本引用 */
export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
/** @deprecated 用 getEmbeddingDimensions() */
export const DEFAULT_EMBEDDING_DIMENSIONS = 768;

function l2Normalize(values: number[]): number[] {
  let sum = 0;
  for (const v of values) sum += v * v;
  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm === 0) return values;
  return values.map((v) => v / norm);
}

/**
 * 将文本转为向量。失败返回 null（不抛给推荐主路径）。
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (isAiNetworkFailed()) return null;

  const provider = getAiProvider();
  const apiKey = getAiApiKey(provider);
  if (!apiKey) return null;

  const input = text.replace(/\s+/g, " ").trim().slice(0, 8000);
  if (!input) return null;

  const model = getEmbeddingModel(provider);
  const dimensions = getEmbeddingDimensions(provider);
  // 与 LLM 同量级超时，避免 embedding 单独拖到 20s
  const timeoutMs = Math.min(getLlmTimeoutMs(), 12_000);

  try {
    if (provider === "gemini") {
      return await embedTextGemini(apiKey, model, input, dimensions, timeoutMs);
    }
    return await embedTextOpenAi(apiKey, model, input, dimensions, timeoutMs);
  } catch (err) {
    if (isNetworkishError(err)) markAiNetworkFailed();
    console.warn("[embedding] failed:", err);
    return null;
  }
}

async function embedTextGemini(
  apiKey: string,
  model: string,
  input: string,
  dimensions: number,
  timeoutMs: number,
): Promise<number[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await proxyFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${model}`,
        content: { parts: [{ text: input }] },
        outputDimensionality: dimensions,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[embedding] Gemini ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const data = (await res.json()) as {
      embedding?: { values?: number[] };
    };
    let vec = data.embedding?.values;
    if (!Array.isArray(vec) || vec.length === 0) return null;

    // gemini-embedding-001：非 3072 维需自行 L2 normalize 后再做 cosine
    if (dimensions !== 3072) {
      vec = l2Normalize(vec);
    }

    if (vec.length !== dimensions) {
      console.warn(
        `[embedding] dim mismatch: got ${vec.length}, expected ${dimensions}`,
      );
    }
    return vec;
  } finally {
    clearTimeout(timer);
  }
}

async function embedTextOpenAi(
  apiKey: string,
  model: string,
  input: string,
  dimensions: number,
  timeoutMs: number,
): Promise<number[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await proxyFetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input,
        dimensions,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[embedding] OpenAI ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const data = (await res.json()) as {
      data?: { embedding?: number[] }[];
    };
    const vec = data.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) return null;
    if (vec.length !== dimensions) {
      console.warn(
        `[embedding] dim mismatch: got ${vec.length}, expected ${dimensions}`,
      );
    }
    return vec;
  } finally {
    clearTimeout(timer);
  }
}

/** pgvector / PostgREST 接受的字面量，例如 [0.1,0.2,...] */
export function toPgVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export function describeEmbeddingProvider(): {
  provider: AiProvider;
  model: string;
  dimensions: number;
  configured: boolean;
} {
  const provider = getAiProvider();
  return {
    provider,
    model: getEmbeddingModel(provider),
    dimensions: getEmbeddingDimensions(provider),
    configured: hasEmbeddingProvider(),
  };
}
