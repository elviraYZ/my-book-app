"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";

import { BookmarkSaveModal } from "@/components/bookmark-save-modal";
import { getBookmark } from "@/lib/data";
import { cn } from "@/lib/utils";

export function BookmarkButton({
  bookId,
  bookTitle,
  topicId,
  className,
  iconClassName,
  label,
  variant = "icon",
  onSaved,
}: {
  bookId: string;
  bookTitle?: string;
  /** 打开时预选该专题 */
  topicId?: string | null;
  className?: string;
  iconClassName?: string;
  label?: string;
  variant?: "icon" | "button";
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getBookmark(bookId).then((bm) => {
      if (!cancelled) setSaved(!!bm);
    });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          variant === "button"
            ? "inline-flex h-10 items-center justify-center gap-2 rounded-xl text-[13px] font-semibold transition-colors"
            : "inline-flex items-center justify-center transition-colors",
          saved
            ? variant === "button"
              ? "bg-[#4F5DFF] text-white"
              : "text-[#4F5DFF]"
            : variant === "button"
              ? "bg-[#4F5DFF] text-white hover:opacity-95"
              : "text-[#9AA3B5] hover:text-[#4F5DFF]",
          className,
        )}
        aria-label={saved ? "已收藏，编辑保存位置" : "收藏"}
        title={saved ? "已收藏，点击可调整专题" : "收藏"}
      >
        <Bookmark
          className={cn(
            iconClassName ?? (variant === "button" ? "size-4" : "size-4"),
            saved && "fill-current",
          )}
        />
        {label ?? (variant === "button" ? (saved ? "已收藏" : "收藏") : null)}
      </button>
      <BookmarkSaveModal
        open={open}
        bookId={bookId}
        bookTitle={bookTitle}
        preselectedTopicId={topicId}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setSaved(true);
          onSaved?.();
        }}
        onRemoved={() => {
          setSaved(false);
          onSaved?.();
        }}
      />
    </>
  );
}
