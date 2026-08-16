"use client";

import { cn } from "@/lib/utils";

type BookCoverProps = {
  title: string;
  coverUrl?: string | null;
  color?: string | null;
  className?: string;
  /** 色块兜底时截取的标题字数 */
  titleChars?: number;
};

/**
 * 有 cover_url 显示封面图，否则色块 + 书名缩写。
 * 列表/推荐/收藏此前只画色块，详情才用图。
 */
export function BookCover({
  title,
  coverUrl,
  color,
  className,
  titleChars = 8,
}: BookCoverProps) {
  const url = coverUrl?.trim() || null;

  if (!url) {
    return (
      <div
        className={cn(
          "flex aspect-[2/3] shrink-0 items-end justify-center rounded-lg px-1.5 pb-2 text-center text-[10px] font-semibold leading-tight text-white shadow-sm",
          className,
        )}
        style={{ backgroundColor: color ?? "#64748b" }}
      >
        {title.slice(0, titleChars)}
      </div>
    );
  }

  return (
    <span className={cn("relative block aspect-[2/3] shrink-0", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={title}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="absolute inset-0 size-full rounded-[inherit] object-cover shadow-sm"
        onError={(e) => {
          e.currentTarget.style.display = "none";
          const fb = e.currentTarget.nextElementSibling;
          if (fb instanceof HTMLElement) fb.style.display = "flex";
        }}
      />
      <div
        className="hidden size-full items-end justify-center rounded-[inherit] px-1.5 pb-2 text-center text-[10px] font-semibold leading-tight text-white shadow-sm"
        style={{ backgroundColor: color ?? "#64748b" }}
        aria-hidden
      >
        {title.slice(0, titleChars)}
      </div>
    </span>
  );
}
