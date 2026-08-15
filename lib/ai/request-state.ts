/**
 * 单次推荐请求内的 AI 调用状态。
 * 不用 node:async_hooks（会进 Client bundle 导致 Turbopack panic）。
 * 依赖 pipeline 单请求 await 链；并发请求下用栈式 prev 恢复。
 */

export type AiRequestState = {
  networkFailed: boolean;
};

let current: AiRequestState | null = null;

export async function runWithAiRequestState<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const prev = current;
  current = { networkFailed: false };
  try {
    return await fn();
  } finally {
    current = prev;
  }
}

export function markAiNetworkFailed(): void {
  if (current) current.networkFailed = true;
}

export function isAiNetworkFailed(): boolean {
  return Boolean(current?.networkFailed);
}

export function isNetworkishError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  const cause =
    err instanceof Error && err.cause instanceof Error
      ? `${err.cause.name} ${err.cause.message}`
      : "";
  const blob = `${msg} ${cause}`;
  return /ConnectTimeout|UND_ERR_CONNECT|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|AbortError|aborted|HeadersTimeout|BodyTimeout/i.test(
    blob,
  );
}
