/**
 * AI provider 配置（LLM + Embedding）。
 * 默认 Gemini；可用 AI_PROVIDER=openai 切换。
 * 密钥与模型调用集中在 lib/ai/*，勿散落到 recommend pipeline。
 */

export type AiProvider = "gemini" | "openai";

export const DEFAULT_AI_PROVIDER: AiProvider = "gemini";

/** Gemini embedding 默认模型；默认输出可到 3072，我们用 outputDimensionality 截断 */
export const DEFAULT_GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
/**
 * 必须与 supabase patch_works_embedding.sql 中 vector(N) 一致。
 * Gemini 推荐 768 / 1536 / 3072；MVP 选用 768（质量足够、存储更省）。
 */
export const DEFAULT_GEMINI_EMBEDDING_DIMENSIONS = 768;

export const DEFAULT_GEMINI_LLM_MODEL = "gemini-3.5-flash-lite";

export const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_OPENAI_EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_OPENAI_LLM_MODEL = "gpt-4o-mini";

export function getAiProvider(): AiProvider {
  const raw = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (raw === "openai") return "openai";
  if (raw === "gemini") return "gemini";
  // 有 Gemini key 优先；否则若仅有 OpenAI key 则回退 openai
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  if (process.env.OPENAI_API_KEY?.trim()) return "openai";
  return DEFAULT_AI_PROVIDER;
}

export function getGeminiApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim() ||
    null
  );
}

export function getOpenAiApiKey(): string | null {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.EMBEDDING_API_KEY?.trim() ||
    null
  );
}

/** 当前 provider 的 API key（LLM / embedding 共用） */
export function getAiApiKey(provider = getAiProvider()): string | null {
  if (provider === "gemini") return getGeminiApiKey();
  return getOpenAiApiKey();
}

export function getLlmModel(provider = getAiProvider()): string {
  if (provider === "gemini") {
    return (
      process.env.GEMINI_MODEL?.trim() ||
      process.env.LLM_MODEL?.trim() ||
      DEFAULT_GEMINI_LLM_MODEL
    );
  }
  return (
    process.env.OPENAI_MODEL?.trim() ||
    process.env.LLM_MODEL?.trim() ||
    DEFAULT_OPENAI_LLM_MODEL
  );
}

export function getEmbeddingModel(provider = getAiProvider()): string {
  const override = process.env.EMBEDDING_MODEL?.trim();
  if (override) return override;
  return provider === "gemini"
    ? DEFAULT_GEMINI_EMBEDDING_MODEL
    : DEFAULT_OPENAI_EMBEDDING_MODEL;
}

/**
 * embedding 维度：优先 EMBEDDING_DIMENSIONS；
 * 否则按当前 provider 默认（Gemini=768，OpenAI=1536）。
 * 改维度后必须同步改 SQL vector(N) 与 RPC，并清空/重建 works.embedding。
 */
export function getEmbeddingDimensions(provider = getAiProvider()): number {
  const raw = process.env.EMBEDDING_DIMENSIONS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return provider === "gemini"
    ? DEFAULT_GEMINI_EMBEDDING_DIMENSIONS
    : DEFAULT_OPENAI_EMBEDDING_DIMENSIONS;
}

export function getLlmTimeoutMs(): number {
  const raw =
    process.env.LLM_TIMEOUT_MS?.trim() ||
    process.env.OPENAI_TIMEOUT_MS?.trim() ||
    process.env.GEMINI_TIMEOUT_MS?.trim();
  const n = raw ? Number(raw) : 12_000;
  return Number.isFinite(n) && n > 0 ? n : 12_000;
}

export function hasLlmProvider(): boolean {
  return Boolean(getAiApiKey());
}

export function hasEmbeddingProvider(): boolean {
  return Boolean(getAiApiKey());
}
