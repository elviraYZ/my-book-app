"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";

import {
  CreateTopicModal,
  type CreateTopicPrefill,
} from "@/components/create-topic-modal";
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
  saveAsTopicPrefill,
  onClose,
  onSaved,
  onRemoved,
  onTopicCreated,
}: {
  open: boolean;
  bookId: string;
  bookTitle?: string;
  /** 从专题详情 / 已绑定推荐进入时：提示并预勾「当前专题」 */
  preselectedTopicId?: string | null;
  /**
   * 与页面「保存为专题」相同的 prefill。
   * 有值时显示「保存为专题」；无推荐 Context 时不显示（避免空建专题）。
   */
  saveAsTopicPrefill?: CreateTopicPrefill | null;
  onClose: () => void;
  onSaved?: (topicIds: string[]) => void;
  onRemoved?: () => void;
  /** 通过「保存为专题」新建后回调（便于推荐页绑定当前专题） */
  onTopicCreated?: (topicId: string) => void;
}) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);

  const canSaveAsTopic = Boolean(
    saveAsTopicPrefill?.description?.trim() && saveAsTopicPrefill?.context,
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaveAsOpen(false);

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
    if (!open || saveAsOpen) return;
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
  }, [open, saveAsOpen, saving, onClose]);

  const currentTopic = useMemo(
    () =>
      preselectedTopicId
        ? topics.find((t) => t.id === preselectedTopicId) ?? null
        : null,
    [preselectedTopicId, topics],
  );

  const otherTopics = useMemo(() => {
    if (!preselectedTopicId) return topics;
    return topics.filter((t) => t.id !== preselectedTopicId);
  }, [topics, preselectedTopicId]);

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

  const onSaveAsTopicDone = async (topicId: string) => {
    setSaveAsOpen(false);
    const allTopics = await listTopics();
    setTopics(allTopics);
    setSelected((prev) =>
      prev.includes(topicId) ? prev : [...prev, topicId],
    );
    onTopicCreated?.(topicId);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookmark-save-title"
        onClick={() => {
          if (!saving && !saveAsOpen) onClose();
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
              <p className="text-[13px] font-semibold text-[#111827]">
                保存位置
              </p>
              <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-[#C9D4FF] bg-[#F5F7FF] px-3 py-2.5">
                <span className="inline-flex size-5 items-center justify-center rounded-md bg-[#4F5DFF] text-white">
                  <Check className="size-3" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#111827]">
                    我的收藏
                  </p>
                  <p className="text-[11px] text-[#8B95A8]">
                    一定会保存；专题可选，不选也没关系
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-[#111827]">
                  添加到专题
                  <span className="ml-1 font-normal text-[#9AA3B5]">可选</span>
                </p>
                {canSaveAsTopic && !loading ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setSaveAsOpen(true)}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#4F5DFF] hover:opacity-90"
                  >
                    <Plus className="size-3.5" />
                    保存为专题
                  </button>
                ) : null}
              </div>
              <p className="mt-0.5 text-[11px] text-[#9AA3B5]">
                {canSaveAsTopic
                  ? "可加入当前专题，或把本次推荐「保存为专题」后再勾选；也可以只收藏"
                  : "可多选已有专题；专题是收藏的分类，不是另一套保存"}
              </p>

              {loading ? (
                <div className="mt-3 flex items-center gap-2 text-[12px] text-[#8B95A8]">
                  <Loader2 className="size-3.5 animate-spin" />
                  加载专题…
                </div>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {currentTopic ? (
                    <li>
                      <TopicPickRow
                        title={currentTopic.title}
                        selected={selected.includes(currentTopic.id)}
                        badge="当前专题"
                        disabled={saving}
                        onToggle={() => toggleTopic(currentTopic.id)}
                      />
                    </li>
                  ) : preselectedTopicId ? (
                    <li>
                      <p className="rounded-xl border border-dashed border-[#E6EAF2] px-3 py-2.5 text-[12px] text-[#8B95A8]">
                        当前专题暂不可用；仍可只收藏或保存为专题。
                      </p>
                    </li>
                  ) : null}

                  {otherTopics.map((topic) => (
                    <li key={topic.id}>
                      <TopicPickRow
                        title={topic.title}
                        selected={selected.includes(topic.id)}
                        disabled={saving}
                        onToggle={() => toggleTopic(topic.id)}
                      />
                    </li>
                  ))}

                  {!currentTopic && otherTopics.length === 0 ? (
                    <li>
                      <p className="rounded-xl border border-dashed border-[#E6EAF2] px-3 py-4 text-center text-[12px] text-[#8B95A8]">
                        {canSaveAsTopic
                          ? "还没有专题。可点「保存为专题」把本次推荐存成专题，或先只收藏。"
                          : "还没有专题。可先只收藏，之后在推荐结果里保存为专题。"}
                      </p>
                    </li>
                  ) : null}
                </ul>
              )}

              {!loading && selected.length === 0 ? (
                <p className="mt-2 text-[11px] text-[#9AA3B5]">
                  未选专题 → 仅加入「我的收藏」
                </p>
              ) : null}
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
                {selected.length > 0 ? "收藏并加入专题" : "仅收藏"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {canSaveAsTopic ? (
        <CreateTopicModal
          open={saveAsOpen}
          onClose={() => setSaveAsOpen(false)}
          prefill={saveAsTopicPrefill}
          onSaved={(id) => {
            void onSaveAsTopicDone(id);
          }}
        />
      ) : null}
    </>
  );
}

function TopicPickRow({
  title,
  selected,
  badge,
  disabled,
  onToggle,
}: {
  title: string;
  selected: boolean;
  badge?: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-[#C9D4FF] bg-[#F5F7FF]"
          : "border-[#E6EAF2] bg-white hover:bg-[#FAFBFD]",
      )}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md border text-white",
          selected
            ? "border-[#4F5DFF] bg-[#4F5DFF]"
            : "border-[#D1D5DB] bg-white",
        )}
      >
        {selected ? <Check className="size-3" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#1F2937]">
        {title}
      </span>
      {badge ? (
        <span className="shrink-0 rounded-md bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-semibold text-[#4F5DFF]">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
