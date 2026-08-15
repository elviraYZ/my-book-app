import { GOOGLE_BOOKS_API_BASE } from "@/lib/books-api/config";
import type { GoogleVolume } from "@/lib/data/ingest/types";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatFetchError(query: string, err: unknown): string {
  const cause = err instanceof Error ? (err as Error & { cause?: Error }) : null;
  const detail =
    (cause?.cause as { code?: string; message?: string } | undefined)?.code ||
    cause?.cause?.message ||
    (err instanceof Error ? err.message : String(err));
  return (
    `无法连接 Google Books API [${query}]: ${detail}\n` +
    `若 code 为 ENOTFOUND / ETIMEDOUT：检查网络/DNS，国内环境通常需要可访问 googleapis.com 的代理或 VPN。`
  );
}

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const sec = Number(retryAfter);
    if (Number.isFinite(sec) && sec >= 0) return Math.min(sec * 1000, 30_000);
  }
  return Math.min(1000 * 2 ** (attempt - 1), 8_000);
}

/** 单页抓取（含 429/5xx 重试） */
export async function fetchGoogleBooksPage(options: {
  query: string;
  apiKey: string;
  maxResults: number;
  startIndex: number;
  langRestrict?: string;
  onRetry?: (status: number, waitMs: number, attempt: number) => void;
}): Promise<GoogleVolume[]> {
  const {
    query,
    apiKey,
    maxResults,
    startIndex,
    // 默认不限制语言：中英文都收；调用方可显式传 langRestrict
    langRestrict,
    onRetry,
  } = options;

  const url = new URL(`${GOOGLE_BOOKS_API_BASE}/volumes`);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("startIndex", String(startIndex));
  url.searchParams.set("printType", "books");
  if (langRestrict) url.searchParams.set("langRestrict", langRestrict);
  url.searchParams.set("key", apiKey);

  let lastError = "";

  for (let attempt = 1; attempt <= 1 + MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url.toString());
    } catch (err) {
      throw new Error(formatFetchError(query, err));
    }

    if (res.ok) {
      const json = (await res.json()) as { items?: GoogleVolume[] };
      return json.items ?? [];
    }

    const body = await res.text();
    lastError = `Google Books 请求失败 [${query}] ${res.status}: ${body.slice(0, 200)}`;

    const canRetry = RETRYABLE_STATUS.has(res.status) && attempt <= MAX_RETRIES;
    if (!canRetry) throw new Error(lastError);

    const wait = retryDelayMs(res, attempt);
    onRetry?.(res.status, wait, attempt);
    await sleep(wait);
  }

  throw new Error(lastError || `Google Books 请求失败 [${query}]`);
}
