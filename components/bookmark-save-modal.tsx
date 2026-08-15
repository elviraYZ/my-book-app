"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import {
  getBookmark,
  listTopics,
  removeBookmark,
  saveBookmark,
} from "@/lib/data";
import { emitBookmarksChanged } from "@/lib/data-events";
import type { Topic } from "@/lib/types";
import { cn } from "@/lib/utils";

export function BookmarkSaveModal({
  open,
  bookId,
  bookTitle,
  preselectedTopicId,
  onClose,
  onSaved,
  onRemoved,
}: {
  open: boolean;
  bookId: string;
  bookTitle?: string;
  /** 从专题详情进入时预勾该专题 */
  preselectedTopicId?: string | null;
  onClose: () => void;
  onSaved?: (topicIds: string[]) => void;
  onRemoved?: () => void;
}) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      const [allTopics, existing] = await Promise.all([
        listTopics(),
        getBookmark(bookId),
      ]);
      if (cancelled) return;
      setTopics(allTopics);
      setAlreadySaved(!!existing);
      const fromExisting = existing?.topic_ids ?? [];
      if (fromExisting.length > 0) {
        setSelected(fromExisting);
      } else if (preselectedTopicId) {
        setSelected([preselectedTopicId]);
      } else {
        setSelected([]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, bookId, preselectedTopicId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, saving, onClose]);

  if (!open) return null;

  const toggleTopic = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveBookmark(bookId, selected);
      emitBookmarksChanged();
      onSaved?.(selected);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async () => {
    if (!alreadySaved || saving) return;
    if (!window.confirm("确定取消收藏？将从「我的收藏」和所有专题中移除。")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await removeBookmark(bookId);
      emitBookmarksChanged();
      onRemoved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "取消收藏失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bookmark-save-title"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-[#E6EAF2] bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#EEF1F6] px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2
              id="bookmark-save-title"
              className="text-[16px] font-bold text-[#111827]"
            >
              收藏这本书
            </h2>
            {bookTitle ? (
              <p className="mt-0.5 truncate text-[12px] text-[#8B95A8]">
                {bookTitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex size-8 items-center justify-center rounded-lg text-[#8B95A8] hover:bg-[#F3F5F9]"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div>
            <p className="text-[13px] font-semibold text-[#111827]">保存位置</p>
            <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-[#C9D4FF] bg-[#F5F7FF] px-3 py-2.5">
              <span className="inline-flex size-5 items-center justify-center rounded-md bg-[#4F5DFF] text-white">
                <Check className="size-3" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#111827]">
                  我的收藏
                </p>
                <p className="text-[11px] text-[#8B95A8]">
                  默认保存，所有收藏都会出现在这里
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[13px] font-semibold text-[#111827]">
              添加到专题
              <span className="ml-1 font-normal text-[#9AA3B5]">可选</span>
            </p>
            <p className="mt-0.5 text-[11px] text-[#9AA3B5]">
              可多选；专题是收藏的分类，不是另一套保存
            </p>

            {loading ? (
              <div className="mt-3 flex items-center gap-2 text-[12px] text-[#8B95A8]">
                <Loader2 className="size-3.5 animate-spin" />
                加载专题…
              </div>
            ) : topics.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-[#E6EAF2] px-3 py-4 text-center text-[12px] text-[#8B95A8]">
                还没有专题。可先只收藏，之后在推荐结果里保存为专题。
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {topics.map((topic) => {
                  const on = selected.includes(topic.id);
                  return (
                    <li key={topic.id}>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => toggleTopic(topic.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                          on
                            ? "border-[#C9D4FF] bg-[#F5F7FF]"
                            : "border-[#E6EAF2] bg-white hover:bg-[#FAFBFD]",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-md border text-white",
                            on
                              ? "border-[#4F5DFF] bg-[#4F5DFF]"
                              : "border-[#D1D5DB] bg-white",
                          )}
                        >
                          {on ? <Check className="size-3" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#1F2937]">
                          {topic.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error ? (
            <p className="text-[12px] font-medium text-[#DC2626]">{error}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EEF1F6] px-4 py-3 sm:px-5">
          <div>
            {alreadySaved && !loading ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void onRemove()}
                className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-[13px] font-semibold text-[#C45C5C] hover:bg-[#FFF5F5] disabled:opacity-60"
              >
                取消收藏
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-[13px] font-semibold text-[#6B7280] hover:bg-[#F3F5F9]"
            >
              关闭
            </button>
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => void onSave()}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4F5DFF] px-4 text-[13px] font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
