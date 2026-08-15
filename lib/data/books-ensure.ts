import type { SupabaseClient } from "@supabase/supabase-js";

import {
  classifyContentStyles,
  filterWhitelistTags,
} from "@/lib/data/book-tags";
import { workKey as makeWorkKey } from "@/lib/data/book-quality";
import type { Book, ContentStyle, ReadingDepth } from "@/lib/types";

type BookLike = {
  id: string;
  title: string;
  author?: string | null;
  cover_url?: string | null;
  description?: string | null;
  tags?: string[];
  reading_minutes?: number | null;
  difficulty?: ReadingDepth | null;
  content_style?: ContentStyle[];
  rating?: number | null;
  cover_color?: string;
};

export type DbEditionRow = {
  id: string;
  work_id: string;
  external_id?: string | null;
  source?: string | null;
  isbn_13?: string | null;
  isbn_10?: string | null;
  language?: string | null;
  title: string;
  description?: string | null;
  cover_url?: string | null;
  publisher?: string | null;
  published_date?: string | null;
  page_count?: number | null;
  rating?: number | null;
  ratings_count?: number | null;
  preview_url?: string | null;
  info_url?: string | null;
  created_at?: string;
};

export type DbWorkRow = {
  id: string;
  work_key: string;
  canonical_title: string;
  primary_author?: string | null;
  topics?: string[] | null;
  difficulty?: string | null;
  content_style?: string[] | null;
  primary_topics?: string[] | null;
  display_summary?: string | null;
  use_cases?: string[] | null;
  concepts?: string[] | null;
  representative_edition_id?: string | null;
  created_at: string;
  updated_at?: string;
  book_editions?: DbEditionRow[] | null;
};

/** @deprecated 兼容旧命名；实际为 work + 代表版拼装行 */
export type DbBookRow = {
  id: string;
  external_id?: string | null;
  title: string;
  author?: string | null;
  cover_url?: string | null;
  description?: string | null;
  tags?: string[] | null;
  reading_minutes?: number | null;
  difficulty?: string | null;
  content_style?: string[] | null;
  primary_topics?: string[] | null;
  display_summary?: string | null;
  use_cases?: string[] | null;
  concepts?: string[] | null;
  rating?: number | null;
  ratings_count?: number | null;
  page_count?: number | null;
  preview_url?: string | null;
  info_url?: string | null;
  published_date?: string | null;
  publisher?: string | null;
  isbn_13?: string | null;
  isbn_10?: string | null;
  language?: string | null;
  edition_count?: number;
  created_at: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export { isUuid };

function sessionMinutesFromPages(pageCount: number | null | undefined): number | null {
  if (pageCount == null || pageCount <= 0) return null;
  if (pageCount <= 180) return 15;
  if (pageCount <= 280) return 25;
  if (pageCount <= 400) return 45;
  return 75;
}

function inferDifficulty(
  difficulty: string | null | undefined,
  pageCount: number | null | undefined,
  readingMinutes: number | null | undefined,
): ReadingDepth | null {
  if (
    difficulty === "light" ||
    difficulty === "medium" ||
    difficulty === "deep"
  ) {
    return difficulty;
  }
  if (pageCount != null && pageCount > 0) {
    if (pageCount <= 180) return "light";
    if (pageCount <= 360) return "medium";
    return "deep";
  }
  if (readingMinutes != null && readingMinutes > 0) {
    if (readingMinutes <= 180) return "light";
    if (readingMinutes <= 420) return "medium";
    return "deep";
  }
  return null;
}

function coverColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const palette = [
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#64748B",
  ];
  return palette[hash % palette.length];
}

export function pickEditionForWork(work: DbWorkRow): DbEditionRow | null {
  const editions = work.book_editions ?? [];
  if (editions.length === 0) return null;
  if (work.representative_edition_id) {
    const rep = editions.find((e) => e.id === work.representative_edition_id);
    if (rep) return rep;
  }
  return editions[0] ?? null;
}

/** work + 代表版 → 扁平行（给旧 map / detail 用） */
export function workToDbBookRow(work: DbWorkRow): DbBookRow | null {
  const edition = pickEditionForWork(work);
  if (!edition) return null;
  return {
    id: work.id,
    external_id: edition.external_id ?? null,
    title: edition.title || work.canonical_title,
    author: work.primary_author ?? null,
    cover_url: edition.cover_url ?? null,
    description: edition.description ?? null,
    tags: work.topics ?? [],
    reading_minutes: sessionMinutesFromPages(edition.page_count),
    difficulty: work.difficulty ?? null,
    content_style: work.content_style ?? [],
    primary_topics: work.primary_topics ?? [],
    display_summary: work.display_summary ?? null,
    use_cases: work.use_cases ?? [],
    concepts: work.concepts ?? [],
    rating: edition.rating != null ? Number(edition.rating) : null,
    ratings_count:
      edition.ratings_count != null ? Number(edition.ratings_count) : null,
    page_count: edition.page_count ?? null,
    preview_url: edition.preview_url ?? null,
    info_url: edition.info_url ?? null,
    published_date: edition.published_date ?? null,
    publisher: edition.publisher ?? null,
    isbn_13: edition.isbn_13 ?? null,
    isbn_10: edition.isbn_10 ?? null,
    language: edition.language ?? null,
    edition_count: (work.book_editions ?? []).length || 1,
    created_at: work.created_at,
  };
}

export function mapDbBookToBook(row: DbBookRow): Book {
  const seed = row.external_id ?? row.id;
  const tags = filterWhitelistTags(row.tags);
  const content_style = classifyContentStyles(
    row.title,
    row.description,
    tags,
    row.content_style ?? undefined,
  ) as ContentStyle[];
  const difficulty = inferDifficulty(
    row.difficulty,
    row.page_count,
    row.reading_minutes,
  );

  return {
    id: row.id,
    external_id: row.external_id ?? null,
    title: row.title,
    author: row.author ?? null,
    cover_url: row.cover_url ?? null,
    description: row.description ?? null,
    tags,
    reading_minutes: row.reading_minutes ?? null,
    difficulty,
    content_style,
    primary_topics: row.primary_topics ?? [],
    display_summary: row.display_summary ?? null,
    use_cases: row.use_cases ?? [],
    concepts: row.concepts ?? [],
    rating: row.rating != null ? Number(row.rating) : null,
    created_at: row.created_at,
    cover_color: coverColorFor(seed),
  };
}

export function mapWorkToBook(work: DbWorkRow): Book | null {
  const row = workToDbBookRow(work);
  return row ? mapDbBookToBook(row) : null;
}

/** 显式用 work_id 关系；避免与 representative_edition_id 歧义 */
const WORK_SELECT =
  "*, book_editions!book_editions_work_id_fkey(*)";

export async function fetchWorkById(
  supabase: SupabaseClient,
  id: string,
): Promise<DbWorkRow | null> {
  const { data, error } = await supabase
    .from("works")
    .select(WORK_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DbWorkRow | null) ?? null;
}

/** 一次批量按 work id 拉取（semantic recall 用，避免 N+1） */
export async function fetchWorksByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<DbWorkRow[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const { data, error } = await supabase
    .from("works")
    .select(WORK_SELECT)
    .in("id", unique);
  if (error) throw new Error(error.message);
  return (data as DbWorkRow[]) ?? [];
}

export async function fetchWorkByEditionExternalId(
  supabase: SupabaseClient,
  externalId: string,
): Promise<DbWorkRow | null> {
  const { data: edition, error } = await supabase
    .from("book_editions")
    .select("work_id")
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!edition?.work_id) return null;
  return fetchWorkById(supabase, edition.work_id as string);
}

/** 将 mock/外部书目落到 works（+ 单版），返回 work uuid */
export async function ensureBookRow(
  supabase: SupabaseClient,
  book: BookLike,
): Promise<string> {
  if (isUuid(book.id)) {
    const existing = await fetchWorkById(supabase, book.id);
    if (existing?.id) return existing.id;
  }

  const byExternal = await fetchWorkByEditionExternalId(supabase, book.id);
  if (byExternal?.id) return byExternal.id;

  const author = book.author?.trim() || "未知";
  const key = makeWorkKey(book.title, author);

  const { data: byKey } = await supabase
    .from("works")
    .select("id")
    .eq("work_key", key)
    .maybeSingle();
  if (byKey?.id) return byKey.id as string;

  const tags = book.tags ?? [];
  const content_style = book.content_style ?? [];
  const difficulty = book.difficulty ?? null;

  const { data: work, error: workError } = await supabase
    .from("works")
    .insert({
      work_key: key,
      canonical_title: book.title,
      primary_author: book.author ?? null,
      topics: tags,
      difficulty,
      content_style,
    })
    .select("id")
    .single();

  if (workError || !work) {
    const { data: again } = await supabase
      .from("works")
      .select("id")
      .eq("work_key", key)
      .maybeSingle();
    if (again?.id) return again.id as string;
    throw new Error(workError?.message ?? "无法写入作品");
  }

  const workId = work.id as string;
  const { data: edition, error: edError } = await supabase
    .from("book_editions")
    .insert({
      work_id: workId,
      external_id: isUuid(book.id) ? null : book.id,
      source: "app",
      title: book.title,
      description: book.description ?? null,
      cover_url: book.cover_url ?? null,
      rating: book.rating ?? null,
      language: "zh",
    })
    .select("id")
    .single();

  if (edError || !edition) {
    throw new Error(edError?.message ?? "无法写入版本");
  }

  await supabase
    .from("works")
    .update({ representative_edition_id: edition.id })
    .eq("id", workId);

  return workId;
}

/** UI 可能传 work uuid 或 edition external_id；内部关联用 work uuid */
export async function resolveBookUuid(
  supabase: SupabaseClient,
  bookId: string,
): Promise<string | null> {
  if (isUuid(bookId)) {
    const work = await fetchWorkById(supabase, bookId);
    if (work?.id) return work.id;
  }
  const byExternal = await fetchWorkByEditionExternalId(supabase, bookId);
  return byExternal?.id ?? null;
}
