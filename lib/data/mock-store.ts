import {
  mockBooks,
  mockExplore,
  mockExploreBooks,
  mockProfile,
  mockTopicBooks,
  mockTopics,
  mockUserBookActions,
  suggestPrompts,
  exploreFilters,
} from "@/lib/mock-data";
import type {
  Book,
  Bookmark,
  Profile,
  RecommendResponse,
  Topic,
  TopicBook,
  UserBookAction,
} from "@/lib/types";

const PROFILE_KEY = "yoyan-profile";
const ACTIONS_KEY = "yoyan-book-actions";
const LAST_RECOMMEND_KEY = "yoyan-last-recommend";
const TOPICS_KEY = "yoyan-topics";
const TOPIC_BOOKS_KEY = "yoyan-topic-books";
const BOOKMARKS_KEY = "yoyan-bookmarks";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function seedBookmarksFromTopics(): Bookmark[] {
  const map = new Map<string, string[]>();
  for (const [topicId, items] of Object.entries(mockTopicBooks)) {
    for (const item of items) {
      if (item.user_status !== "bookmarked") continue;
      const ids = map.get(item.book_id) ?? [];
      if (!ids.includes(topicId)) ids.push(topicId);
      map.set(item.book_id, ids);
    }
  }
  const now = "2026-08-12T02:35:00Z";
  return [...map.entries()].map(([book_id, topic_ids], index) => ({
    id: `bm-seed-${index}`,
    book_id,
    topic_ids,
    created_at: now,
    updated_at: now,
  }));
}

const seedBookmarks = seedBookmarksFromTopics();

/** 可变内存态（服务端每次请求独立；客户端靠 localStorage 续存） */
let topics = clone(mockTopics);
let topicBooks = clone(mockTopicBooks);
let actions = clone(mockUserBookActions);
let bookmarks = clone(seedBookmarks);
let profile = clone(mockProfile);
let lastRecommend: RecommendResponse | null = null;
let topicsHydrated = false;
let bookmarksHydrated = false;

function canUseStorage() {
  return typeof window !== "undefined";
}

function readStorage<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** 客户端：用 localStorage 覆盖内存种子，保证新建专题跨路由可见 */
function ensureTopicsHydrated() {
  if (!canUseStorage() || topicsHydrated) return;
  topicsHydrated = true;
  const storedTopics = readStorage<Topic[]>(TOPICS_KEY);
  const storedBooks = readStorage<Record<string, TopicBook[]>>(TOPIC_BOOKS_KEY);
  if (storedTopics && storedTopics.length > 0) {
    topics = storedTopics;
  }
  if (storedBooks) {
    topicBooks = { ...clone(mockTopicBooks), ...storedBooks };
  }
}

function persistTopics() {
  writeStorage(TOPICS_KEY, topics);
  writeStorage(TOPIC_BOOKS_KEY, topicBooks);
}

function ensureBookmarksHydrated() {
  if (!canUseStorage() || bookmarksHydrated) return;
  bookmarksHydrated = true;
  const stored = readStorage<Bookmark[]>(BOOKMARKS_KEY);
  if (stored && stored.length > 0) {
    bookmarks = stored;
  }
}

function persistBookmarks() {
  writeStorage(BOOKMARKS_KEY, bookmarks);
}

function findBook(bookId: string): Book | undefined {
  const fromLibrary = mockBooks.find((b) => b.id === bookId);
  if (fromLibrary) return clone(fromLibrary);
  const eb = mockExploreBooks.find((b) => b.id === bookId);
  if (!eb) return undefined;
  return {
    id: eb.id,
    title: eb.title,
    author: eb.author ?? null,
    cover_url: null,
    description: eb.description ?? null,
    tags: eb.tags,
    reading_minutes: eb.reading_minutes ?? null,
    difficulty: eb.difficulty ?? null,
    content_style: eb.content_style ?? [],
    rating: eb.rating ?? null,
    created_at: "2026-08-01T00:00:00Z",
    cover_color: eb.cover_color,
  };
}

function attachBook(bm: Bookmark): Bookmark {
  return { ...clone(bm), book: findBook(bm.book_id) };
}

function refreshTopicBookmarkCount(topicId: string) {
  const count = bookmarks.filter((b) => b.topic_ids.includes(topicId)).length;
  const bookCount = (topicBooks[topicId] ?? []).length;
  topics = topics.map((t) =>
    t.id === topicId
      ? {
          ...t,
          bookmarked_count: count,
          book_count: Math.max(bookCount, count),
          updated_at: new Date().toISOString(),
          updated_label: "刚刚",
        }
      : t,
  );
}

function ensureTopicHasBookmarkedEntry(topicId: string, bookId: string) {
  const items = topicBooks[topicId] ?? [];
  const idx = items.findIndex((i) => i.book_id === bookId);
  if (idx >= 0) {
    items[idx] = { ...items[idx], user_status: "bookmarked" };
    topicBooks[topicId] = items;
    return;
  }
  const book = findBook(bookId);
  topicBooks[topicId] = [
    {
      id: `tb-bm-${topicId}-${bookId}`,
      topic_id: topicId,
      book_id: bookId,
      match_score: null,
      match_reason: "已收藏并归入本专题",
      matched_tags: book?.tags?.slice(0, 3) ?? [],
      rank: null,
      explain: {
        theme_fit: "来自收藏",
        time_fit: "—",
        style: "—",
      },
      created_at: new Date().toISOString(),
      book,
      user_status: "bookmarked",
    },
    ...items,
  ];
}

export const mockStore = {
  constants: {
    suggestPrompts,
    exploreFilters,
    exploreItems: mockExplore,
    exploreBooks: mockExploreBooks,
    books: mockBooks,
  },

  getProfile(): Profile {
    const stored = readStorage<Profile>(PROFILE_KEY);
    return clone(stored ?? profile);
  },

  saveProfile(next: Profile) {
    profile = clone(next);
    writeStorage(PROFILE_KEY, profile);
    return clone(profile);
  },

  listTopics(): Topic[] {
    ensureTopicsHydrated();
    return clone(topics);
  },

  getTopic(id: string): Topic | null {
    ensureTopicsHydrated();
    return clone(topics.find((t) => t.id === id) ?? null);
  },

  createTopic(input: {
    title: string;
    context_text: string;
    context?: Topic["context"];
  }): Topic {
    ensureTopicsHydrated();
    const now = new Date().toISOString();
    const themes = input.context?.themes ?? [];
    const categoryHint = themes.find((t) =>
      ["游戏设计", "关卡设计", "引擎开发", "AI与技术", "个人成长"].includes(t),
    );
    const topic: Topic = {
      id: `topic-${crypto.randomUUID().slice(0, 8)}`,
      user_id: profile.id,
      title: input.title,
      context_text: input.context_text,
      context: {
        ...(input.context ?? {
          raw_prompt: input.context_text,
          source: "ai_input",
        }),
        topic_id: undefined,
      },
      created_at: now,
      updated_at: now,
      book_count: 0,
      bookmarked_count: 0,
      updated_label: "刚刚",
      icon: "loop",
      category: categoryHint ?? "游戏设计",
      cover_colors: ["#3B82F6", "#10B981", "#F59E0B"],
    };
    topic.context = { ...topic.context, topic_id: topic.id };

    // 若刚跑过推荐，把书单挂到专题下，详情页不至于空白
    const rec = mockStore.getLastRecommend();
    const booksFromRec =
      rec?.books.map((b, index) => ({
        ...clone(b),
        id: `tb-${topic.id}-${index}`,
        topic_id: topic.id,
      })) ?? [];

    topic.book_count = booksFromRec.length;
    topics = [topic, ...topics];
    topicBooks[topic.id] = booksFromRec;
    persistTopics();
    return clone(topic);
  },

  deleteTopic(id: string): boolean {
    ensureTopicsHydrated();
    const exists = topics.some((t) => t.id === id);
    if (!exists) return false;
    topics = topics.filter((t) => t.id !== id);
    delete topicBooks[id];
    persistTopics();
    return true;
  },

  updateTopic(
    id: string,
    patch: {
      title?: string;
      context_text?: string;
      context?: Topic["context"];
    },
  ): Topic | null {
    ensureTopicsHydrated();
    const idx = topics.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    const now = new Date().toISOString();
    const prev = topics[idx];
    const next: Topic = {
      ...prev,
      title: patch.title ?? prev.title,
      context_text: patch.context_text ?? prev.context_text,
      context: patch.context
        ? { ...patch.context, topic_id: id }
        : prev.context,
      updated_at: now,
      updated_label: "刚刚",
    };
    const themes = next.context.themes ?? [];
    const categoryHint = themes.find((t) =>
      ["游戏设计", "关卡设计", "引擎开发", "AI与技术", "个人成长"].includes(t),
    );
    if (categoryHint) next.category = categoryHint;
    topics = topics.map((t, i) => (i === idx ? next : t));
    persistTopics();
    return clone(next);
  },

  /**
   * 用新推荐刷新专题书单：保留归入本专题的收藏；其余推荐可被替换。
   */
  syncTopicRecommendations(
    topicId: string,
    recommended: TopicBook[],
  ): TopicBook[] {
    ensureTopicsHydrated();
    ensureBookmarksHydrated();
    const existing = topicBooks[topicId] ?? [];
    const keptIds = new Set(
      bookmarks
        .filter((b) => b.topic_ids.includes(topicId))
        .map((b) => b.book_id),
    );

    const kept: TopicBook[] = [];
    for (const item of existing) {
      if (!keptIds.has(item.book_id)) continue;
      kept.push({ ...clone(item), user_status: "bookmarked" });
    }
    for (const bookId of keptIds) {
      if (kept.some((k) => k.book_id === bookId)) continue;
      ensureTopicHasBookmarkedEntry(topicId, bookId);
      const added = (topicBooks[topicId] ?? []).find((i) => i.book_id === bookId);
      if (added) kept.push(clone(added));
    }

    const merged: TopicBook[] = [...kept];
    const seen = new Set(kept.map((i) => i.book_id));

    recommended.forEach((item, index) => {
      if (seen.has(item.book_id)) {
        const ki = merged.findIndex((k) => k.book_id === item.book_id);
        if (ki >= 0) {
          merged[ki] = {
            ...merged[ki],
            match_score: item.match_score,
            match_reason: item.match_reason,
            matched_tags: item.matched_tags,
            explain: item.explain,
            rank: item.rank,
            session_id: item.session_id,
            user_status: "bookmarked",
          };
        }
        return;
      }
      seen.add(item.book_id);
      merged.push({
        ...clone(item),
        id: `tb-${topicId}-${Date.now()}-${index}`,
        topic_id: topicId,
        user_status: null,
      });
    });

    topicBooks[topicId] = merged;
    refreshTopicBookmarkCount(topicId);
    persistTopics();
    return mockStore.getTopicBooks(topicId);
  },

  getTopicBooks(topicId: string): TopicBook[] {
    ensureTopicsHydrated();
    ensureBookmarksHydrated();
    const storedActions = (
      readStorage<UserBookAction[]>(ACTIONS_KEY) ?? actions
    ).filter((a) => a.status === "disliked");
    const byBook = new Map<string, TopicBook>();

    for (const item of topicBooks[topicId] ?? []) {
      byBook.set(item.book_id, clone(item));
    }

    for (const bm of bookmarks) {
      if (!bm.topic_ids.includes(topicId)) continue;
      const existing = byBook.get(bm.book_id);
      if (existing) {
        byBook.set(bm.book_id, { ...existing, user_status: "bookmarked" });
      } else {
        const book = findBook(bm.book_id);
        byBook.set(bm.book_id, {
          id: `tb-bm-${topicId}-${bm.book_id}`,
          topic_id: topicId,
          book_id: bm.book_id,
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
    }

    return [...byBook.values()].map((item) => {
      if (storedActions.some((a) => a.book_id === item.book_id)) {
        return { ...item, user_status: "disliked" as const };
      }
      if (
        bookmarks.some(
          (b) => b.book_id === item.book_id && b.topic_ids.includes(topicId),
        )
      ) {
        return { ...item, user_status: "bookmarked" as const };
      }
      return {
        ...item,
        user_status:
          item.user_status === "disliked" ? "disliked" : item.user_status,
      };
    });
  },

  listBookmarks(): Bookmark[] {
    ensureBookmarksHydrated();
    return bookmarks.map(attachBook);
  },

  getBookmark(bookId: string): Bookmark | null {
    ensureBookmarksHydrated();
    const found = bookmarks.find((b) => b.book_id === bookId);
    return found ? attachBook(found) : null;
  },

  saveBookmark(bookId: string, topicIds: string[]): Bookmark {
    ensureBookmarksHydrated();
    ensureTopicsHydrated();
    const now = new Date().toISOString();
    const uniqueTopics = [...new Set(topicIds.filter(Boolean))];
    const prev = bookmarks.find((b) => b.book_id === bookId);
    const prevTopics = prev?.topic_ids ?? [];

    let nextBm: Bookmark;
    if (prev) {
      nextBm = { ...prev, topic_ids: uniqueTopics, updated_at: now };
      bookmarks = bookmarks.map((b) => (b.book_id === bookId ? nextBm : b));
    } else {
      nextBm = {
        id: `bm-${crypto.randomUUID().slice(0, 8)}`,
        book_id: bookId,
        topic_ids: uniqueTopics,
        created_at: now,
        updated_at: now,
      };
      bookmarks = [nextBm, ...bookmarks];
    }

    for (const tid of prevTopics) {
      if (uniqueTopics.includes(tid)) continue;
      topicBooks[tid] = (topicBooks[tid] ?? []).map((item) =>
        item.book_id === bookId ? { ...item, user_status: null } : item,
      );
      refreshTopicBookmarkCount(tid);
    }
    for (const tid of uniqueTopics) {
      ensureTopicHasBookmarkedEntry(tid, bookId);
      refreshTopicBookmarkCount(tid);
    }

    persistBookmarks();
    persistTopics();
    return attachBook(nextBm);
  },

  removeBookmark(bookId: string): boolean {
    ensureBookmarksHydrated();
    ensureTopicsHydrated();
    const prev = bookmarks.find((b) => b.book_id === bookId);
    if (!prev) return false;
    bookmarks = bookmarks.filter((b) => b.book_id !== bookId);
    for (const tid of prev.topic_ids) {
      topicBooks[tid] = (topicBooks[tid] ?? []).map((item) =>
        item.book_id === bookId ? { ...item, user_status: null } : item,
      );
      refreshTopicBookmarkCount(tid);
    }
    // 清掉历史里误写入的 bookmarked action（收藏已迁到 bookmarks）
    const current = readStorage<UserBookAction[]>(ACTIONS_KEY) ?? actions;
    actions = current.filter((a) => a.book_id !== bookId);
    writeStorage(ACTIONS_KEY, actions);
    persistBookmarks();
    persistTopics();
    return true;
  },

  /** 仅「不感兴趣」；收藏请用 saveBookmark / removeBookmark */
  setBookAction(
    bookId: string,
    status: "disliked",
    topicId?: string | null,
  ): UserBookAction {
    const now = new Date().toISOString();
    const current = (readStorage<UserBookAction[]>(ACTIONS_KEY) ?? actions).filter(
      (a) => a.status === "disliked",
    );
    const existing = current.find((a) => a.book_id === bookId);
    let next: UserBookAction[];

    if (existing) {
      next = current.map((a) =>
        a.book_id === bookId
          ? { ...a, status, topic_id: topicId ?? a.topic_id, updated_at: now }
          : a,
      );
    } else {
      next = [
        ...current,
        {
          id: `uba-${crypto.randomUUID().slice(0, 8)}`,
          user_id: profile.id,
          book_id: bookId,
          status,
          topic_id: topicId ?? null,
          created_at: now,
          updated_at: now,
        },
      ];
    }

    actions = next;
    writeStorage(ACTIONS_KEY, next);
    return clone(next.find((a) => a.book_id === bookId)!);
  },

  getBookAction(bookId: string): UserBookAction | null {
    const current = (readStorage<UserBookAction[]>(ACTIONS_KEY) ?? actions).filter(
      (a) => a.status === "disliked",
    );
    const found = current.find((a) => a.book_id === bookId);
    return found ? clone(found) : null;
  },

  listDislikedBookIds(): string[] {
    const current = (readStorage<UserBookAction[]>(ACTIONS_KEY) ?? actions).filter(
      (a) => a.status === "disliked",
    );
    return [...new Set(current.map((a) => a.book_id))];
  },

  saveLastRecommend(result: RecommendResponse) {
    lastRecommend = clone(result);
    writeStorage(LAST_RECOMMEND_KEY, result);
  },

  getLastRecommend(): RecommendResponse | null {
    const stored = readStorage<RecommendResponse>(LAST_RECOMMEND_KEY);
    return clone(stored ?? lastRecommend);
  },

  clearLastRecommend() {
    lastRecommend = null;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(LAST_RECOMMEND_KEY);
      } catch {
        /* ignore */
      }
    }
  },
};
