import {
  type DbBookRow,
  type DbWorkRow,
  fetchWorkByEditionExternalId,
  fetchWorkById,
  isUuid,
  mapDbBookToBook,
  mapWorkToBook,
  workToDbBookRow,
} from "@/lib/data/books-ensure";
import { isMockMode } from "@/lib/data/config";
import { mockStore } from "@/lib/data/mock-store";
import { createDataClient } from "@/lib/supabase/data-client";
import type { Book, ExploreBook } from "@/lib/types";

const CATALOG_LIMIT = 5000;

/** 与 books-ensure 一致：指定 work_id FK，避免双关系歧义 */
const WORK_WITH_EDITIONS =
  "*, book_editions!book_editions_work_id_fkey(*)";

/** 探索列表：少字段，减轻嵌套 editions 体积 */
const WORK_LIST_SELECT = [
  "id",
  "canonical_title",
  "primary_author",
  "topics",
  "primary_topics",
  "difficulty",
  "content_style",
  "display_summary",
  "use_cases",
  "concepts",
  "created_at",
  "representative_edition_id",
  "book_editions!book_editions_work_id_fkey(id, external_id, title, cover_url, description, page_count, rating, ratings_count, preview_url, info_url, published_date, publisher, isbn_13, isbn_10, language)",
].join(",");

export type CatalogBooksPage = {
  books: Book[];
  nextOffset: number;
  hasMore: boolean;
};

function filterMockCatalog(options: {
  genreTags?: string[];
  difficulties?: string[];
}): Book[] {
  let books = mockCatalog();
  const tags = options.genreTags ?? [];
  const difficulties = options.difficulties ?? [];
  if (tags.length > 0) {
    books = books.filter((b) =>
      tags.some((tag) =>
        b.tags.some((t) => t.includes(tag) || tag.includes(t)),
      ),
    );
  }
  if (difficulties.length > 0) {
    books = books.filter(
      (b) => b.difficulty != null && difficulties.includes(b.difficulty),
    );
  }
  return books;
}

function exploreToBook(book: ExploreBook): Book {
  return {
    id: book.id,
    title: book.title,
    author: book.author ?? null,
    cover_url: book.cover_url ?? null,
    description: book.description ?? null,
    tags: book.tags,
    reading_minutes: book.reading_minutes ?? null,
    difficulty: book.difficulty ?? null,
    content_style: book.content_style,
    rating: book.rating ?? null,
    created_at: "2026-08-01T00:00:00Z",
    cover_color: book.cover_color,
  };
}

function mockCatalog(): Book[] {
  const byId = new Map<string, Book>();
  for (const book of mockStore.constants.books) {
    byId.set(book.id, structuredClone(book));
  }
  for (const eb of mockStore.constants.exploreBooks) {
    if (!byId.has(eb.id)) byId.set(eb.id, exploreToBook(eb));
  }
  return [...byId.values()];
}

/** api：works + 代表版；mock：本地种子（推荐等仍可能用全集） */
export async function listCatalogBooks(): Promise<Book[]> {
  if (isMockMode()) return mockCatalog();

  const supabase = await createDataClient();
  const { data, error } = await supabase
    .from("works")
    .select(WORK_WITH_EDITIONS)
    .order("created_at", { ascending: false })
    .limit(CATALOG_LIMIT);

  if (error) throw new Error(error.message);

  const books: Book[] = [];
  for (const row of (data ?? []) as DbWorkRow[]) {
    const book = mapWorkToBook(row);
    if (book) books.push(book);
  }
  return books;
}

/** 探索分页：按 created_at 倒序；可选题材 overlaps */
export async function listCatalogBooksPage(options: {
  offset?: number;
  limit?: number;
  genreTags?: string[];
  difficulties?: string[];
} = {}): Promise<CatalogBooksPage> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(Math.max(1, options.limit ?? 36), 100);
  const genreTags = options.genreTags?.filter(Boolean) ?? [];
  const difficulties = options.difficulties?.filter(Boolean) ?? [];

  if (isMockMode()) {
    const all = filterMockCatalog({ genreTags, difficulties });
    const slice = all.slice(offset, offset + limit);
    return {
      books: slice,
      nextOffset: offset + slice.length,
      hasMore: offset + slice.length < all.length,
    };
  }

  const supabase = await createDataClient();
  let query = supabase
    .from("works")
    .select(WORK_LIST_SELECT)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (genreTags.length > 0) {
    query = query.overlaps("topics", genreTags);
  }
  if (difficulties.length > 0) {
    query = query.in("difficulty", difficulties);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as DbWorkRow[];
  const books: Book[] = [];
  for (const row of rows) {
    const book = mapWorkToBook(row);
    if (book) books.push(book);
  }

  return {
    books,
    nextOffset: offset + rows.length,
    hasMore: rows.length === limit,
  };
}

export async function getCatalogBook(id: string): Promise<{
  book: Book;
  row: DbBookRow | null;
} | null> {
  if (isMockMode()) {
    const book = mockCatalog().find((b) => b.id === id);
    return book ? { book, row: null } : null;
  }

  const supabase = await createDataClient();
  let work: DbWorkRow | null = null;

  if (isUuid(id)) {
    work = await fetchWorkById(supabase, id);
  }
  if (!work) {
    work = await fetchWorkByEditionExternalId(supabase, id);
  }
  if (!work) return null;

  const book = mapWorkToBook(work);
  if (!book) return null;
  return { book, row: workToDbBookRow(work) };
}

export function bookToExploreBook(book: Book): ExploreBook {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    rating: book.rating,
    tags: book.tags,
    cover_color: book.cover_color,
    cover_url: book.cover_url,
    difficulty: book.difficulty,
    reading_minutes: book.reading_minutes,
    content_style: book.content_style,
    description: book.description,
  };
}
