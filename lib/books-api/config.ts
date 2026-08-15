/**
 * Google Books API 配置（仅服务端读取）。
 * 本阶段只做 env setup，不发起任何网络请求。
 */

export const GOOGLE_BOOKS_API_BASE =
  "https://www.googleapis.com/books/v1" as const;

/** 从环境变量读取 key；未配置时返回 null（不抛错，方便逐步接入） */
export function getGoogleBooksApiKey(): string | null {
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  return key || null;
}

export function isGoogleBooksConfigured(): boolean {
  return getGoogleBooksApiKey() != null;
}
