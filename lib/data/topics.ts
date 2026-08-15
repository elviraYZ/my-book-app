import { isMockMode } from "@/lib/data/config";
import { mockStore } from "@/lib/data/mock-store";
import {
  ensureBookRow,
  mapWorkToBook,
  type DbWorkRow,
} from "@/lib/data/books-ensure";
import {
  createDataClient,
  requireUserId,
} from "@/lib/supabase/data-client";
import type {
  RecommendContext,
  Topic,
  TopicBook,
} from "@/lib/types";

type TopicUi = {
  icon?: Topic["icon"];
  category?: string;
  cover_colors?: string[];
};

function updatedLabel(iso?: string | null) {
  if (!iso) return "刚刚";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days <= 0) return "今天更新";
  if (days === 1) return "更新于 1 天前";
  if (days < 30) return `更新于 ${days} 天前`;
  return "更新于较早前";
}

function readUi(context: RecommendContext | null | undefined): TopicUi {
  const raw = context as RecommendContext & { ui?: TopicUi };
  return raw?.ui ?? {};
}

function withUi(
  context: RecommendContext,
  ui: TopicUi,
): RecommendContext {
  return { ...context, ui } as RecommendContext;
}

function mapTopic(
  row: {
    id: string;
    user_id: string;
    title: string;
    context_text?: string | null;
    context?: RecommendContext | null;
    created_at: string;
    updated_at?: string | null;
  },
  counts?: { book_count?: number; bookmarked_count?: number },
): Topic {
  const context = (row.context ?? {}) as RecommendContext;
  const ui = readUi(context);
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    context_text: row.context_text ?? "",
    context,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    book_count: counts?.book_count ?? 0,
    bookmarked_count: counts?.bookmarked_count ?? 0,
    updated_label: updatedLabel(row.updated_at ?? row.created_at),
    icon: ui.icon ?? "loop",
    category: ui.category ?? "游戏设计",
    cover_colors: ui.cover_colors ?? ["#3B82F6", "#10B981", "#F59E0B"],
  };
}

async function topicCounts(
  supabase: Awaited<ReturnType<typeof createDataClient>>,
  topicIds: string[],
): Promise<Map<string, { book_count: number; bookmarked_count: number }>> {
  const map = new Map<
    string,
    { book_count: number; bookmarked_count: number }
  >();
  for (const id of topicIds) {
    map.set(id, { book_count: 0, bookmarked_count: 0 });
  }
  if (topicIds.length === 0) return map;

  const { data: tbs } = await supabase
    .from("topic_books")
    .select("topic_id")
    .in("topic_id", topicIds);
  for (const row of tbs ?? []) {
    const id = row.topic_id as string;
    const cur = map.get(id) ?? { book_count: 0, bookmarked_count: 0 };
    cur.book_count += 1;
    map.set(id, cur);
  }

  const { data: bts } = await supabase
    .from("bookmark_topics")
    .select("topic_id")
    .in("topic_id", topicIds);
  for (const row of bts ?? []) {
    const id = row.topic_id as string;
    const cur = map.get(id) ?? { book_count: 0, bookmarked_count: 0 };
    cur.bookmarked_count += 1;
    map.set(id, cur);
  }

  return map;
}

export async function listTopics(): Promise<Topic[]> {
  if (isMockMode()) {
    return mockStore.listTopics();
  }

  const supabase = await createDataClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const counts = await topicCounts(
    supabase,
    rows.map((r) => r.id as string),
  );
  return rows.map((row) =>
    mapTopic(row, counts.get(row.id as string)),
  );
}

export async function getTopic(id: string): Promise<Topic | null> {
  if (isMockMode()) {
    return mockStore.getTopic(id);
  }

  const supabase = await createDataClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const counts = await topicCounts(supabase, [id]);
  return mapTopic(data, counts.get(id));
}

export async function getTopicBooks(topicId: string): Promise<TopicBook[]> {
  if (isMockMode()) {
    return mockStore.getTopicBooks(topicId);
  }

  const supabase = await createDataClient();
  await requireUserId(supabase);

  const { data: rows, error } = await supabase
    .from("topic_books")
    .select(
      "*, works!topic_books_book_id_fkey(*, book_editions!book_editions_work_id_fkey(*))",
    )
    .eq("topic_id", topicId)
    .order("rank", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);

  const { data: bmLinks } = await supabase
    .from("bookmark_topics")
    .select(
      "bookmark_id, bookmarks(book_id, created_at, works!bookmarks_book_id_fkey(*, book_editions!book_editions_work_id_fkey(*)))",
    )
    .eq("topic_id", topicId);

  const bookmarkedBookUuids = new Set<string>();
  const byBook = new Map<string, TopicBook>();

  for (const row of rows ?? []) {
    const work = row.works as DbWorkRow | null;
    const book = work ? mapWorkToBook(work) ?? undefined : undefined;
    const bookUuid = row.book_id as string;
    byBook.set(bookUuid, {
      id: row.id as string,
      topic_id: topicId,
      session_id: (row.session_id as string | null) ?? null,
      book_id: book?.id ?? bookUuid,
      match_score:
        row.match_score != null ? Number(row.match_score) : null,
      match_reason: (row.match_reason as string | null) ?? null,
      matched_tags: (row.matched_tags as string[]) ?? [],
      rank: (row.rank as number | null) ?? null,
      explain: (row.explain as TopicBook["explain"]) ?? {},
      created_at: row.created_at as string,
      book,
      user_status: null,
    });
  }

  for (const link of bmLinks ?? []) {
    const bm = link.bookmarks as unknown as {
      book_id: string;
      created_at: string;
      works: DbWorkRow | null;
    } | null;
    if (!bm) continue;
    bookmarkedBookUuids.add(bm.book_id);
    const existing = byBook.get(bm.book_id);
    if (existing) {
      byBook.set(bm.book_id, {
        ...existing,
        user_status: "bookmarked",
      });
      continue;
    }
    const book = bm.works ? mapWorkToBook(bm.works) ?? undefined : undefined;
    byBook.set(bm.book_id, {
      id: `tb-bm-${topicId}-${bm.book_id}`,
      topic_id: topicId,
      book_id: book?.id ?? bm.book_id,
      match_score: null,
      match_reason: "已收藏并归入本专题",
      matched_tags: book?.tags?.slice(0, 3) ?? [],
      rank: null,
      explain: {
        theme_fit: "来自收藏",
        time_fit: "—",
        style: "—",
      },
      created_at: bm.created_at,
      book,
      user_status: "bookmarked",
    });
  }

  for (const [uuid, item] of byBook) {
    if (bookmarkedBookUuids.has(uuid)) {
      byBook.set(uuid, { ...item, user_status: "bookmarked" });
    }
  }

  return [...byBook.values()];
}

export async function createTopic(input: {
  title: string;
  context_text: string;
  context?: RecommendContext;
  books?: TopicBook[];
}): Promise<Topic> {
  if (isMockMode()) {
    return mockStore.createTopic(input);
  }

  const supabase = await createDataClient();
  const userId = await requireUserId(supabase);

  const themes = input.context?.themes ?? [];
  const categoryHint = themes.find((t) =>
    ["游戏设计", "关卡设计", "引擎开发", "AI与技术", "个人成长"].includes(t),
  );
  const ui: TopicUi = {
    icon: "loop",
    category: categoryHint ?? "游戏设计",
    cover_colors: ["#3B82F6", "#10B981", "#F59E0B"],
  };
  const context = withUi(
    {
      ...(input.context ?? {
        raw_prompt: input.context_text,
        source: "ai_input",
      }),
      goal: input.title,
    },
    ui,
  );

  const { data: topicRow, error } = await supabase
    .from("topics")
    .insert({
      user_id: userId,
      title: input.title,
      context_text: input.context_text,
      context: { ...context, topic_id: null },
    })
    .select("*")
    .single();

  if (error || !topicRow) {
    throw new Error(error?.message ?? "创建专题失败");
  }

  const topicId = topicRow.id as string;
  await supabase
    .from("topics")
    .update({ context: { ...context, topic_id: topicId } })
    .eq("id", topicId);

  const sourceBooks =
    input.books ?? mockStore.getLastRecommend()?.books ?? [];

  if (sourceBooks.length > 0) {
    const rows = [];
    for (let index = 0; index < sourceBooks.length; index++) {
      const item = sourceBooks[index];
      const book = item.book;
      if (!book && !item.book_id) continue;
      const bookUuid = await ensureBookRow(supabase, {
        id: book?.id ?? item.book_id,
        title: book?.title ?? "未知书名",
        author: book?.author,
        cover_url: book?.cover_url,
        description: book?.description,
        tags: book?.tags ?? item.matched_tags ?? [],
        reading_minutes: book?.reading_minutes,
        difficulty: book?.difficulty,
        content_style: book?.content_style,
        rating: book?.rating,
      });
      rows.push({
        topic_id: topicId,
        book_id: bookUuid,
        match_score: item.match_score,
        match_reason: item.match_reason,
        matched_tags: item.matched_tags ?? [],
        rank: item.rank ?? index + 1,
        explain: item.explain ?? {},
      });
    }
    if (rows.length > 0) {
      const { error: tbError } = await supabase.from("topic_books").insert(rows);
      if (tbError) throw new Error(tbError.message);
    }
  }

  const created = await getTopic(topicId);
  if (!created) throw new Error("专题创建后读取失败");
  return created;
}

export async function deleteTopic(id: string): Promise<boolean> {
  if (isMockMode()) {
    return mockStore.deleteTopic(id);
  }

  const supabase = await createDataClient();
  await requireUserId(supabase);
  const { error } = await supabase.from("topics").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}

export async function updateTopic(
  id: string,
  patch: {
    title?: string;
    context_text?: string;
    context?: RecommendContext;
  },
): Promise<Topic | null> {
  if (isMockMode()) {
    return mockStore.updateTopic(id, patch);
  }

  const supabase = await createDataClient();
  await requireUserId(supabase);

  const existing = await getTopic(id);
  if (!existing) return null;

  const nextContext = patch.context
    ? withUi(patch.context, readUi(existing.context))
    : existing.context;

  const { error } = await supabase
    .from("topics")
    .update({
      title: patch.title ?? existing.title,
      context_text: patch.context_text ?? existing.context_text,
      context: { ...nextContext, topic_id: id },
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  return getTopic(id);
}

export async function syncTopicRecommendations(
  topicId: string,
  books: TopicBook[],
): Promise<TopicBook[]> {
  if (isMockMode()) {
    return mockStore.syncTopicRecommendations(topicId, books);
  }

  const supabase = await createDataClient();
  await requireUserId(supabase);

  const { data: bmLinks } = await supabase
    .from("bookmark_topics")
    .select("bookmarks(book_id)")
    .eq("topic_id", topicId);
  const keepUuids = new Set(
    (bmLinks ?? [])
      .map(
        (l) =>
          (l.bookmarks as unknown as { book_id: string } | null)?.book_id,
      )
      .filter(Boolean) as string[],
  );

  const { data: existing } = await supabase
    .from("topic_books")
    .select("id, book_id")
    .eq("topic_id", topicId);

  const toDelete = (existing ?? [])
    .filter((row) => !keepUuids.has(row.book_id as string))
    .map((row) => row.id as string);

  if (toDelete.length > 0) {
    await supabase.from("topic_books").delete().in("id", toDelete);
  }

  for (let index = 0; index < books.length; index++) {
    const item = books[index];
    const book = item.book;
    if (!book && !item.book_id) continue;
    const bookUuid = await ensureBookRow(supabase, {
      id: book?.id ?? item.book_id,
      title: book?.title ?? "未知书名",
      author: book?.author,
      cover_url: book?.cover_url,
      description: book?.description,
      tags: book?.tags ?? item.matched_tags ?? [],
      reading_minutes: book?.reading_minutes,
      difficulty: book?.difficulty,
      content_style: book?.content_style,
      rating: book?.rating,
    });
    if (keepUuids.has(bookUuid)) continue;

    const { data: already } = await supabase
      .from("topic_books")
      .select("id")
      .eq("topic_id", topicId)
      .eq("book_id", bookUuid)
      .maybeSingle();
    if (already) continue;

    await supabase.from("topic_books").insert({
      topic_id: topicId,
      book_id: bookUuid,
      match_score: item.match_score,
      match_reason: item.match_reason,
      matched_tags: item.matched_tags ?? [],
      rank: item.rank ?? index + 1,
      explain: item.explain ?? {},
    });
  }

  await supabase
    .from("topics")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", topicId);

  return getTopicBooks(topicId);
}
