import { isMockMode } from "@/lib/data/config";
import {
  ensureBookRow,
  mapWorkToBook,
  resolveBookUuid,
  type DbWorkRow,
} from "@/lib/data/books-ensure";
import { mockStore } from "@/lib/data/mock-store";
import {
  createDataClient,
  requireUserId,
} from "@/lib/supabase/data-client";
import type { Bookmark } from "@/lib/types";

async function loadCatalogBook(bookId: string) {
  const { getBook } = await import("@/lib/data/books");
  return getBook(bookId);
}

function bookFromEmbed(works: DbWorkRow | null | undefined) {
  if (!works) return undefined;
  return mapWorkToBook(works) ?? undefined;
}

function mapBookmark(row: {
  id: string;
  book_id: string;
  created_at: string;
  updated_at: string;
  topic_ids: string[];
  works?: DbWorkRow | null;
}): Bookmark {
  const book = bookFromEmbed(row.works);
  return {
    id: row.id,
    book_id: book?.id ?? row.book_id,
    topic_ids: row.topic_ids,
    created_at: row.created_at,
    updated_at: row.updated_at,
    book,
  };
}

export async function listBookmarks(): Promise<Bookmark[]> {
  if (isMockMode()) {
    return mockStore.listBookmarks();
  }

  const supabase = await createDataClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("bookmarks")
    .select(
      "*, works!bookmarks_book_id_fkey(*, book_editions!book_editions_work_id_fkey(*))",
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  const ids = (data ?? []).map((b) => b.id as string);
  const topicMap = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: links } = await supabase
      .from("bookmark_topics")
      .select("bookmark_id, topic_id")
      .in("bookmark_id", ids);
    for (const link of links ?? []) {
      const bid = link.bookmark_id as string;
      const list = topicMap.get(bid) ?? [];
      list.push(link.topic_id as string);
      topicMap.set(bid, list);
    }
  }

  return (data ?? []).map((row) =>
    mapBookmark({
      id: row.id as string,
      book_id: row.book_id as string,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      topic_ids: topicMap.get(row.id as string) ?? [],
      works: row.works as DbWorkRow | null,
    }),
  );
}

export async function getBookmark(bookId: string): Promise<Bookmark | null> {
  if (isMockMode()) {
    return mockStore.getBookmark(bookId);
  }

  const supabase = await createDataClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const bookUuid = await resolveBookUuid(supabase, bookId);
  if (!bookUuid) return null;

  const { data, error } = await supabase
    .from("bookmarks")
    .select(
      "*, works!bookmarks_book_id_fkey(*, book_editions!book_editions_work_id_fkey(*))",
    )
    .eq("user_id", user.id)
    .eq("book_id", bookUuid)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: links } = await supabase
    .from("bookmark_topics")
    .select("topic_id")
    .eq("bookmark_id", data.id);

  return mapBookmark({
    id: data.id as string,
    book_id: data.book_id as string,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
    topic_ids: (links ?? []).map((l) => l.topic_id as string),
    works: data.works as DbWorkRow | null,
  });
}

export async function saveBookmark(
  bookId: string,
  topicIds: string[],
): Promise<Bookmark> {
  if (isMockMode()) {
    return mockStore.saveBookmark(bookId, topicIds);
  }

  const supabase = await createDataClient();
  const userId = await requireUserId(supabase);

  const catalog = await loadCatalogBook(bookId);
  const bookUuid = await ensureBookRow(supabase, {
    id: bookId,
    title: catalog?.title ?? "未知书名",
    author: catalog?.author,
    cover_url: catalog?.cover_url,
    description: catalog?.description,
    tags: catalog?.tags ?? [],
    reading_minutes: catalog?.reading_minutes,
    difficulty: catalog?.difficulty,
    content_style: catalog?.content_style,
    rating: catalog?.rating,
  });

  const uniqueTopics = [...new Set(topicIds.filter(Boolean))];

  const { data: existing } = await supabase
    .from("bookmarks")
    .select("id")
    .eq("user_id", userId)
    .eq("book_id", bookUuid)
    .maybeSingle();

  let bookmarkId: string;
  if (existing?.id) {
    bookmarkId = existing.id as string;
    await supabase
      .from("bookmarks")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", bookmarkId);
  } else {
    const { data: inserted, error } = await supabase
      .from("bookmarks")
      .insert({ user_id: userId, book_id: bookUuid })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(error?.message ?? "收藏失败");
    }
    bookmarkId = inserted.id as string;
  }

  await supabase.from("bookmark_topics").delete().eq("bookmark_id", bookmarkId);
  if (uniqueTopics.length > 0) {
    const { error: linkError } = await supabase.from("bookmark_topics").insert(
      uniqueTopics.map((topic_id) => ({
        bookmark_id: bookmarkId,
        topic_id,
      })),
    );
    if (linkError) throw new Error(linkError.message);
  }

  const saved = await getBookmark(bookId);
  if (!saved) throw new Error("收藏后读取失败");
  return saved;
}

export async function removeBookmark(bookId: string): Promise<boolean> {
  if (isMockMode()) {
    return mockStore.removeBookmark(bookId);
  }

  const supabase = await createDataClient();
  const userId = await requireUserId(supabase);
  const bookUuid = await resolveBookUuid(supabase, bookId);
  if (!bookUuid) return false;

  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("user_id", userId)
    .eq("book_id", bookUuid);

  if (error) throw new Error(error.message);
  return true;
}
