/**
 * 召回用 works 拉取：分页读全库（或 overlaps 过滤），不受 explore CATALOG_LIMIT=300 限制。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type DbWorkRow,
  mapWorkToBook,
} from "@/lib/data/books-ensure";
import type { Book } from "@/lib/types";

const WORK_WITH_EDITIONS =
  "*, book_editions!book_editions_work_id_fkey(*)";

const PAGE = 1000;
/** 硬顶：防止误拉过大表 */
export const RECALL_FETCH_MAX = 5000;

export function mapWorkRowsToBooks(rows: DbWorkRow[]): Book[] {
  const books: Book[] = [];
  for (const row of rows) {
    const book = mapWorkToBook(row);
    if (book) books.push(book);
  }
  return books;
}

/** 分页拉取 works（最多 RECALL_FETCH_MAX） */
export async function fetchWorksPaged(
  supabase: SupabaseClient,
  options: { max?: number } = {},
): Promise<Book[]> {
  const max = Math.min(options.max ?? RECALL_FETCH_MAX, RECALL_FETCH_MAX);
  const out: Book[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const to = Math.min(from + PAGE - 1, max - 1);
    const { data, error } = await supabase
      .from("works")
      .select(WORK_WITH_EDITIONS)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(`fetchWorksPaged: ${error.message}`);
    const batch = mapWorkRowsToBooks((data ?? []) as DbWorkRow[]);
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

/**
 * primary_topics / topics 与给定标签数组有交集的 works。
 * PostgREST overlaps；失败时回退全表扫描过滤。
 */
export async function fetchWorksOverlappingTopics(
  supabase: SupabaseClient,
  topics: string[],
  options: { max?: number; column?: "primary_topics" | "topics" } = {},
): Promise<Book[]> {
  const cleaned = [...new Set(topics.map((t) => t.trim()).filter(Boolean))];
  if (cleaned.length === 0) return [];

  const max = Math.min(options.max ?? RECALL_FETCH_MAX, RECALL_FETCH_MAX);
  const column = options.column ?? "primary_topics";

  try {
    const { data, error } = await supabase
      .from("works")
      .select(WORK_WITH_EDITIONS)
      .overlaps(column, cleaned)
      .order("created_at", { ascending: false })
      .limit(max);
    if (error) throw error;
    return mapWorkRowsToBooks((data ?? []) as DbWorkRow[]);
  } catch (err) {
    console.warn(
      `[recall-fetch] overlaps(${column}) failed, fallback scan:`,
      err instanceof Error ? err.message : err,
    );
    const all = await fetchWorksPaged(supabase, { max });
    const want = new Set(cleaned);
    return all.filter((b) => {
      const prim = b.primary_topics ?? [];
      const tags = b.tags ?? [];
      const pool = column === "primary_topics" ? prim : tags;
      const check = pool.length > 0 ? pool : tags;
      return check.some((t) => want.has(t));
    });
  }
}
