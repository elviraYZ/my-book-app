/**
 * 推荐 pipeline 开发环境 stage timing（生产 no-op）。
 *
 * 不用 node:async_hooks / server-only：ingest → @/lib/data 会被 Client Component 引用。
 * 并发隔离用栈式 prev 恢复（与 lib/ai/request-state 相同约定）。
 */

export type RecommendStageTimings = {
  requestId: string;
  totalMs: number;
  contextLlmMs: number;
  queryEmbeddingMs: number;
  /** buildQueryEmbeddingText（通常极短） */
  semanticBuildQueryMs: number;
  /** embedText API（与 queryEmbeddingMs 同段，便于对照） */
  semanticEmbeddingMs: number;
  lexicalRecallMs: number;
  primaryRecallMs: number;
  semanticRecallMs: number;
  semanticRpcMs: number;
  semanticFetchWorksMs: number;
  semanticMergeMs: number;
  scoreMs: number;
  sufficiencyMs: number;
  googleIngestMs: number;
  newBookEmbeddingMs: number;
  rerankMs: number;
  explainLlmMs: number;
  contextLlmCalls: number;
  queryEmbeddingCalls: number;
  newBookEmbeddingCalls: number;
  semanticRpcCalls: number;
  semanticWorkFetchCalls: number;
};

type TimingBucket = {
  requestId: string;
  t0: number;
  contextLlmMs: number;
  queryEmbeddingMs: number;
  semanticBuildQueryMs: number;
  semanticEmbeddingMs: number;
  lexicalRecallMs: number;
  primaryRecallMs: number;
  semanticRecallMs: number;
  semanticRpcMs: number;
  semanticFetchWorksMs: number;
  semanticMergeMs: number;
  scoreMs: number;
  sufficiencyMs: number;
  googleIngestMs: number;
  newBookEmbeddingMs: number;
  rerankMs: number;
  explainLlmMs: number;
  contextLlmCalls: number;
  queryEmbeddingCalls: number;
  newBookEmbeddingCalls: number;
  semanticRpcCalls: number;
  semanticWorkFetchCalls: number;
};

type TimingStage = Exclude<
  keyof TimingBucket,
  | "requestId"
  | "t0"
  | "contextLlmCalls"
  | "queryEmbeddingCalls"
  | "newBookEmbeddingCalls"
  | "semanticRpcCalls"
  | "semanticWorkFetchCalls"
>;

let current: TimingBucket | null = null;

function emptyBucket(requestId: string): TimingBucket {
  return {
    requestId,
    t0: performance.now(),
    contextLlmMs: 0,
    queryEmbeddingMs: 0,
    semanticBuildQueryMs: 0,
    semanticEmbeddingMs: 0,
    lexicalRecallMs: 0,
    primaryRecallMs: 0,
    semanticRecallMs: 0,
    semanticRpcMs: 0,
    semanticFetchWorksMs: 0,
    semanticMergeMs: 0,
    scoreMs: 0,
    sufficiencyMs: 0,
    googleIngestMs: 0,
    newBookEmbeddingMs: 0,
    rerankMs: 0,
    explainLlmMs: 0,
    contextLlmCalls: 0,
    queryEmbeddingCalls: 0,
    newBookEmbeddingCalls: 0,
    semanticRpcCalls: 0,
    semanticWorkFetchCalls: 0,
  };
}

export function isRecommendTimingEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function createRecommendRequestId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `req_${Date.now().toString(36)}_${rand}`;
}

/**
 * 在独立 timing 上下文中跑 pipeline；finally 恢复 prev，避免嵌套/收尾串台。
 */
export async function runWithRecommendTiming<T>(
  requestId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isRecommendTimingEnabled()) {
    return fn();
  }
  const prev = current;
  current = emptyBucket(requestId);
  console.log(`[recommend:timing] start requestId=${requestId}`);
  try {
    return await fn();
  } finally {
    endRecommendTiming();
    current = prev;
  }
}

export function snapshotRecommendTiming(): RecommendStageTimings | null {
  if (!current) return null;
  const active = current;
  const totalMs = Math.round(performance.now() - active.t0);
  const ingestWall = active.googleIngestMs;
  const embedPart = active.newBookEmbeddingMs;
  const googleIngestNet = Math.max(0, ingestWall - embedPart);
  const semanticRecallMs =
    active.semanticRecallMs > 0
      ? active.semanticRecallMs
      : active.semanticRpcMs +
        active.semanticFetchWorksMs +
        active.semanticMergeMs;
  return {
    requestId: active.requestId,
    totalMs,
    contextLlmMs: Math.round(active.contextLlmMs),
    queryEmbeddingMs: Math.round(active.queryEmbeddingMs),
    semanticBuildQueryMs: Math.round(active.semanticBuildQueryMs),
    semanticEmbeddingMs: Math.round(active.semanticEmbeddingMs),
    lexicalRecallMs: Math.round(active.lexicalRecallMs),
    primaryRecallMs: Math.round(active.primaryRecallMs),
    semanticRecallMs: Math.round(semanticRecallMs),
    semanticRpcMs: Math.round(active.semanticRpcMs),
    semanticFetchWorksMs: Math.round(active.semanticFetchWorksMs),
    semanticMergeMs: Math.round(active.semanticMergeMs),
    scoreMs: Math.round(active.scoreMs),
    sufficiencyMs: Math.round(active.sufficiencyMs),
    googleIngestMs: Math.round(googleIngestNet),
    newBookEmbeddingMs: Math.round(embedPart),
    rerankMs: Math.round(active.rerankMs),
    explainLlmMs: Math.round(active.explainLlmMs),
    contextLlmCalls: active.contextLlmCalls,
    queryEmbeddingCalls: active.queryEmbeddingCalls,
    newBookEmbeddingCalls: active.newBookEmbeddingCalls,
    semanticRpcCalls: active.semanticRpcCalls,
    semanticWorkFetchCalls: active.semanticWorkFetchCalls,
  };
}

function endRecommendTiming(): RecommendStageTimings | null {
  const out = snapshotRecommendTiming();
  if (out) {
    console.log(
      `[recommend:timing] done requestId=${out.requestId} totalMs=${out.totalMs}`,
      {
        contextLlmMs: out.contextLlmMs,
        queryEmbeddingMs: out.queryEmbeddingMs,
        semanticBuildQueryMs: out.semanticBuildQueryMs,
        semanticEmbeddingMs: out.semanticEmbeddingMs,
        lexicalRecallMs: out.lexicalRecallMs,
        primaryRecallMs: out.primaryRecallMs,
        semanticRecallMs: out.semanticRecallMs,
        semanticRpcMs: out.semanticRpcMs,
        semanticFetchWorksMs: out.semanticFetchWorksMs,
        semanticMergeMs: out.semanticMergeMs,
        scoreMs: out.scoreMs,
        sufficiencyMs: out.sufficiencyMs,
        googleIngestMs: out.googleIngestMs,
        newBookEmbeddingMs: out.newBookEmbeddingMs,
        rerankMs: out.rerankMs,
        contextLlmCalls: out.contextLlmCalls,
        queryEmbeddingCalls: out.queryEmbeddingCalls,
        newBookEmbeddingCalls: out.newBookEmbeddingCalls,
        semanticRpcCalls: out.semanticRpcCalls,
        semanticWorkFetchCalls: out.semanticWorkFetchCalls,
      },
    );
  }
  return out;
}

export function addTiming(stage: TimingStage, ms: number): void {
  if (!current) return;
  current[stage] += ms;
}

export function bumpContextLlmCall(): void {
  if (!current) return;
  current.contextLlmCalls += 1;
}

export function bumpQueryEmbeddingCall(): void {
  if (!current) return;
  current.queryEmbeddingCalls += 1;
}

export function bumpSemanticRpcCall(): void {
  if (!current) return;
  current.semanticRpcCalls += 1;
}

export function bumpSemanticWorkFetchCall(): void {
  if (!current) return;
  current.semanticWorkFetchCalls += 1;
}

export function bumpNewBookEmbeddingCall(ms: number): void {
  if (!current) return;
  current.newBookEmbeddingCalls += 1;
  current.newBookEmbeddingMs += ms;
}

export async function timeAsync<T>(
  stage: TimingStage,
  fn: () => Promise<T>,
): Promise<T> {
  if (!current) return fn();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    addTiming(stage, performance.now() - t0);
  }
}

export function timeSync<T>(stage: TimingStage, fn: () => T): T {
  if (!current) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    addTiming(stage, performance.now() - t0);
  }
}
