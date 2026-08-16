"use client";

import Link from "next/link";
import { Star } from "lucide-react";

import { BookCover } from "@/components/book-cover";
import { BookmarkButton } from "@/components/bookmark-button";
import { bookDetailHref, type BookDetailFrom } from "@/lib/book-links";
import type { ExploreBook } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ExploreViewMode = "stack" | "grid";

/** Grid 模式：横向紧凑卡（首页 / 探索网格） */
function GridBookCard({
  book,
  from = "explore",
  className,
}: {
  book: ExploreBook;
  from?: BookDetailFrom;
  className?: string;
}) {
  return (
    <Link
      href={bookDetailHref(book.id, { from })}
      className={cn(
        "flex h-full gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm",
        "transition-[border-color,box-shadow] hover:border-primary/25 hover:shadow-md",
        className,
      )}
    >
      <BookCover
        title={book.title}
        coverUrl={book.cover_url}
        color={book.cover_color}
        className="w-11 shrink-0 self-start rounded-md text-[7px] sm:w-12"
        titleChars={5}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
        <div>
          <h3 className="truncate text-sm font-semibold text-slate-900">
            {book.title}
          </h3>
          <p className="truncate text-[11px] text-muted-foreground">
            {book.author ?? "未知作者"}
            {book.rating != null ? (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber-600">
                <Star className="size-2.5 fill-current" />
                {book.rating.toFixed(1)}
              </span>
            ) : null}
          </p>
        </div>
        {book.tags.length > 0 ? (
          <div className="flex gap-1 overflow-hidden">
            {book.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="shrink-0 rounded bg-sky-50 px-1.5 py-px text-[10px] text-sky-800"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {book.description ? (
          <p className="line-clamp-2 text-[11px] leading-snug text-slate-500">
            {book.description}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function ExploreBookCard({
  book,
  mode = "stack",
  from = "explore",
  className,
}: {
  book: ExploreBook;
  mode?: ExploreViewMode;
  from?: BookDetailFrom;
  className?: string;
}) {
  if (mode === "grid") {
    return <GridBookCard book={book} from={from} className={className} />;
  }

  return (
    <div className={cn("relative", className)}>
      <Link
        href={bookDetailHref(book.id, { from })}
        className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary/30"
      >
        <BookCover
          title={book.title}
          coverUrl={book.cover_url}
          color={book.cover_color}
          className="w-[4.75rem] rounded-md text-[10px] sm:w-[5.5rem]"
          titleChars={6}
        />
        <div className="min-w-0 flex-1 space-y-2 pr-8">
          <div>
            <h3 className="text-base font-semibold text-slate-900 sm:text-lg">
              {book.title}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{book.author}</p>
          </div>
          {book.rating != null ? (
            <p className="flex items-center gap-1 text-sm text-amber-600">
              <Star className="size-3.5 fill-current" />
              <span className="font-medium tabular-nums">
                {book.rating.toFixed(1)}
              </span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {book.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600"
              >
                {tag}
              </span>
            ))}
          </div>
          {book.description ? (
            <p className="line-clamp-2 text-sm leading-relaxed text-slate-600">
              {book.description}
            </p>
          ) : null}
        </div>
      </Link>
      <BookmarkButton
        bookId={book.id}
        bookTitle={book.title}
        className="absolute top-3 right-3 z-10 inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white"
        iconClassName="size-3.5"
      />
    </div>
  );
}
