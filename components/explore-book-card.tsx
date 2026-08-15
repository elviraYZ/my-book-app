"use client";

import Link from "next/link";
import { Star } from "lucide-react";

import { BookmarkButton } from "@/components/bookmark-button";
import { bookDetailHref, type BookDetailFrom } from "@/lib/book-links";
import type { ExploreBook } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ExploreViewMode = "stack" | "grid";

function Cover({ book, className }: { book: ExploreBook; className?: string }) {
  if (book.cover_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={book.cover_url}
        alt={book.title}
        className={cn(
          "aspect-[2/3] shrink-0 rounded-md object-cover shadow-sm",
          className,
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex aspect-[2/3] shrink-0 items-end justify-center rounded-md px-1 pb-2 text-center text-[9px] font-semibold leading-tight text-white shadow-sm",
        className,
      )}
      style={{ backgroundColor: book.cover_color ?? "#64748b" }}
    >
      {book.title.slice(0, 6)}
    </div>
  );
}

/** Grid 模式：横向紧凑卡 */
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
        "flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm",
        "transition-[border-color,box-shadow] hover:border-primary/25 hover:shadow-md",
        className,
      )}
    >
      <Cover book={book} className="w-14 text-[8px] sm:w-16" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div>
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-slate-900">
            {book.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {book.author}
          </p>
        </div>
        {book.rating != null ? (
          <p className="flex items-center gap-1 text-xs text-amber-600">
            <Star className="size-3 fill-current" />
            <span className="font-medium tabular-nums">
              {book.rating.toFixed(1)}
            </span>
          </p>
        ) : null}
        {book.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {book.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-800"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {book.description ? (
          <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-600">
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
        <Cover book={book} className="w-[4.75rem] text-[10px] sm:w-[5.5rem]" />
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
