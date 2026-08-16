import type { SupabaseClient } from "@supabase/supabase-js";

import { isMockMode } from "@/lib/data/config";
import {
  ensureBookRow,
  resolveBookUuid,
} from "@/lib/data/books-ensure";
import { mockStore } from "@/lib/data/mock-store";
import {
  createDataClient,
  requireUserId,
} from "@/lib/supabase/data-client";
import type { UserBookAction } from "@/lib/types";

async function loadCatalogBook(bookId: string) {
  const { getBook } = await import("@/lib/data/books");
  return getBook(bookId);
}

function mapAction(row: {
  id: string;
  user_id: string;
  book_id: string;
  status: string;
  topic_id?: string | null;
  created_at: string;
  updated_at: string;
}): UserBookAction {
  return {
    id: row.id,
    user_id: row.user_id,
    book_id: row.book_id,
    status: "disliked",
    topic_id: row.topic_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 写入「不感兴趣」；API 模式落库 user_book_actions，mock 写本地。 */
export async function setBookAction(
  bookId: string,
  status: "disliked",
  topicId?: string | null,
): Promise<UserBookAction> {
  if (status !== "disliked") {
    throw new Error("仅支持不感兴趣");
  }

  if (isMockMode()) {
    return mockStore.setBookAction(bookId, status, topicId);
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

  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("user_book_actions")
    .select("id")
    .eq("user_id", userId)
    .eq("book_id", bookUuid)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from("user_book_actions")
      .update({
        status: "disliked",
        topic_id: topicId ?? null,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "更新不感兴趣失败");
    }
    return mapAction({
      id: data.id as string,
      user_id: data.user_id as string,
      book_id: data.book_id as string,
      status: data.status as string,
      topic_id: data.topic_id as string | null,
      created_at: data.created_at as string,
      updated_at: data.updated_at as string,
    });
  }

  const { data, error } = await supabase
    .from("user_book_actions")
    .insert({
      user_id: userId,
      book_id: bookUuid,
      status: "disliked",
      topic_id: topicId ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "记录不感兴趣失败");
  }

  return mapAction({
    id: data.id as string,
    user_id: data.user_id as string,
    book_id: data.book_id as string,
    status: data.status as string,
    topic_id: data.topic_id as string | null,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  });
}

/** 当前用户是否已标记该书不感兴趣 */
export async function getBookAction(
  bookId: string,
): Promise<UserBookAction | null> {
  if (isMockMode()) {
    return mockStore.getBookAction(bookId);
  }

  const supabase = await createDataClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const bookUuid = await resolveBookUuid(supabase, bookId);
  if (!bookUuid) return null;

  const { data, error } = await supabase
    .from("user_book_actions")
    .select("*")
    .eq("user_id", user.id)
    .eq("book_id", bookUuid)
    .eq("status", "disliked")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return mapAction({
    id: data.id as string,
    user_id: data.user_id as string,
    book_id: data.book_id as string,
    status: data.status as string,
    topic_id: data.topic_id as string | null,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  });
}

/**
 * 当前用户所有「不感兴趣」的 book/work id（UUID）。
 * 服务端推荐请传入带 cookie 的 supabase（options.supabase）。
 */
export async function listDislikedBookIds(
  supabaseClient?: SupabaseClient,
): Promise<string[]> {
  if (isMockMode()) {
    return mockStore.listDislikedBookIds();
  }

  const supabase = supabaseClient ?? (await createDataClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("user_book_actions")
    .select("book_id")
    .eq("user_id", user.id)
    .eq("status", "disliked");

  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => r.book_id as string))];
}
