"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { TopicDetailClient } from "@/components/topic-detail-client";
import { getTopic, getTopicBooks, listTopics } from "@/lib/data";
import { BOOKMARKS_CHANGED } from "@/lib/data-events";
import type { Topic, TopicBook } from "@/lib/types";

export function TopicDetailLoader({ id }: { id: string }) {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [items, setItems] = useState<TopicBook[]>([]);
  const [relatedTopics, setRelatedTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const refreshBooks = useCallback(async () => {
    const [found, books] = await Promise.all([
      getTopic(id),
      getTopicBooks(id),
    ]);
    if (found) {
      setTopic(found);
      setItems(books);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);

    void (async () => {
      const found = await getTopic(id);
      if (cancelled) return;
      if (!found) {
        setMissing(true);
        setLoading(false);
        return;
      }

      const [books, allTopics] = await Promise.all([
        getTopicBooks(id),
        listTopics(),
      ]);
      if (cancelled) return;

      const related = allTopics
        .filter(
          (t) =>
            t.id !== found.id &&
            (t.category === found.category ||
              (found.context.themes ?? []).some((theme) =>
                (t.context.themes ?? []).includes(theme),
              )),
        )
        .slice(0, 4);

      setTopic(found);
      setItems(books);
      setRelatedTopics(related);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // 详情页收藏/取消后返回，或 bfcache 恢复时刷新书单与计数
  useEffect(() => {
    const onBookmarks = () => {
      void refreshBooks();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshBooks();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void refreshBooks();
    };

    window.addEventListener(BOOKMARKS_CHANGED, onBookmarks);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onBookmarks);

    return () => {
      window.removeEventListener(BOOKMARKS_CHANGED, onBookmarks);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onBookmarks);
    };
  }, [refreshBooks]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 bg-[#F4F6FA] text-sm text-[#8B95A8]">
        <Loader2 className="size-4 animate-spin" />
        加载专题…
      </div>
    );
  }

  if (missing || !topic) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#F4F6FA] px-4 text-center">
        <p className="text-sm text-[#6B7280]">找不到这个专题，可能尚未保存成功。</p>
        <Link
          href="/topics"
          className="text-sm font-semibold text-[#4F5DFF] hover:underline"
        >
          返回我的专题
        </Link>
      </div>
    );
  }

  return (
    <TopicDetailClient
      topic={topic}
      items={items}
      relatedTopics={relatedTopics}
      onBookmarkChange={() => {
        void refreshBooks();
      }}
    />
  );
}
