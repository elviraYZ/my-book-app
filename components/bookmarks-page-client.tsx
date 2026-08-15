"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, BookOpen } from "lucide-react";

import { BookmarkButton } from "@/components/bookmark-button";
import { NewSearchButton } from "@/components/new-search-provider";
import { SiteHeader } from "@/components/site-header";
import { bookDetailHref } from "@/lib/book-links";
import { listBookmarks, listTopics } from "@/lib/data";
import type { Bookmark as BookmarkRecord, Topic } from "@/lib/types";

function Cover({
  title,
  color,
}: {
  title: string;
  color?: string;
}) {
  return (
    <div
      className="flex aspect-[2/3] w-14 shrink-0 items-end justify-center rounded-lg px-1 pb-1.5 text-center text-[8px] font-semibold leading-tight text-white shadow-sm sm:w-16"
      style={{ backgroundColor: color ?? "#64748b" }}
    >
      {title.slice(0, 6)}
    </div>
  );
}

export function BookmarksPageClient({
  initialBookmarks,
}: {
  initialBookmarks: BookmarkRecord[];
}) {
  const [bookmarks, setBookmarks] =
    useState<BookmarkRecord[]>(initialBookmarks);
  const [topics, setTopics] = useState<Topic[]>([]);

  useEffect(() => {
    void listBookmarks().then(setBookmarks);
    void listTopics().then(setTopics);
  }, []);

  const topicTitle = (id: string) =>
    topics.find((t) => t.id === id)?.title ?? "专题";

  return (
    <div className="min-h-dvh bg-[#F4F6FA]">
      <SiteHeader active="favorites" />
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-[#111827]">
            我的收藏
          </h1>
          <p className="mt-1 text-[14px] text-[#8B95A8]">
            所有收藏过的书都在这里；专题只是收藏的分类。
          </p>
        </div>

        {bookmarks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#DCE3F0] bg-white px-6 py-16 text-center">
            <Bookmark className="mx-auto size-8 text-[#C5CAD6]" />
            <p className="mt-3 text-sm text-[#6B7280]">还没有收藏</p>
            <p className="mt-1 text-xs text-[#9AA3B5]">
              在推荐或探索里点「收藏」，可选是否归入专题
            </p>
            <NewSearchButton className="mt-4 inline-flex h-9 items-center justify-center rounded-xl bg-[#4F5DFF] px-4 text-sm font-semibold text-white">
              去找书
            </NewSearchButton>
          </div>
        ) : (
          <ul className="space-y-3">
            {bookmarks.map((bm) => {
              const book = bm.book;
              const title = book?.title ?? "未知书名";
              const href = bookDetailHref(bm.book_id, { from: "bookmarks" });
              return (
                <li
                  key={bm.id}
                  className="flex gap-3 rounded-2xl border border-[#E6EAF2] bg-white p-3 shadow-[0_1px_2px_rgba(31,41,55,0.04)] sm:gap-4 sm:p-4"
                >
                  <Link href={href} className="shrink-0">
                    <Cover title={title} color={book?.cover_color} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={href}
                          className="block truncate text-[15px] font-bold text-[#111827] hover:text-[#4F5DFF]"
                        >
                          {title}
                        </Link>
                        <p className="mt-0.5 truncate text-[12px] text-[#8B95A8]">
                          {book?.author ?? "—"}
                        </p>
                      </div>
                      <BookmarkButton
                        bookId={bm.book_id}
                        bookTitle={title}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#E6EAF2]"
                        iconClassName="size-3.5"
                        onSaved={() => {
                          void listBookmarks().then(setBookmarks);
                        }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-medium text-[#4F5DFF]">
                        <BookOpen className="size-3" />
                        我的收藏
                      </span>
                      {bm.topic_ids.map((tid) => (
                        <Link
                          key={tid}
                          href={`/topics/${tid}`}
                          className="rounded-md bg-[#F3F5F9] px-1.5 py-0.5 text-[10px] font-medium text-[#5F6B7C] hover:bg-[#EEF2FF] hover:text-[#4F5DFF]"
                        >
                          {topicTitle(tid)}
                        </Link>
                      ))}
                      {bm.topic_ids.length === 0 ? (
                        <span className="text-[10px] text-[#C5CAD6]">
                          未归入专题
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
