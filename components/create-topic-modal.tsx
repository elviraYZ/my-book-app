"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";

import { createTopic } from "@/lib/data";
import { emitTopicsChanged } from "@/lib/data-events";
import type { RecommendContext, TopicBook } from "@/lib/types";

export type CreateTopicPrefill = {
  title?: string;
  description?: string;
  purposes?: string[];
  timeHorizon?: string | null;
  preferences?: string[];
  context?: RecommendContext;
  books?: TopicBook[];
};

function suggestTitleFromText(text: string) {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  const first = cleaned.split(/[。！？\n]/)[0] ?? cleaned;
  return first.length > 20 ? `${first.slice(0, 20)}…` : first;
}

/** 仅从推荐结果保存为专题（不再支持独立创建） */
export function CreateTopicModal({
  open,
  onClose,
  prefill,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** @deprecated 已移除 create；保留字段以免旧调用报错 */
  mode?: "create" | "save";
  prefill?: CreateTopicPrefill | null;
  onSaved?: (topicId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const description = prefill?.description?.trim() ?? "";
  const context = prefill?.context;

  useEffect(() => {
    if (!open) return;
    setTitle(prefill?.title ?? "");
    setError(null);
    setSubmitting(false);
  }, [open, prefill]);

  const preview = useMemo(() => {
    if (!context && !description) return null;
    return {
      goal:
        title.trim() ||
        prefill?.title ||
        suggestTitleFromText(description) ||
        "未命名专题",
      themes: context?.themes ?? [],
      preferences: context?.preferences ?? [],
      depth: context?.depth,
      session: context?.session_bucket,
      time: context?.time_horizon || prefill?.timeHorizon || "不限",
    };
  }, [context, description, prefill, title]);

  if (!open) return null;

  const onSubmit = async () => {
    if (!description || !context) {
      setError("缺少推荐结果，请先在首页完成一次推荐");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const finalTitle =
        title.trim() ||
        context.goal ||
        suggestTitleFromText(description) ||
        "未命名专题";

      const topic = await createTopic({
        title: finalTitle,
        context_text: description,
        context: {
          ...context,
          raw_prompt: description,
          goal: finalTitle,
          source: "ai_input",
        },
        books: prefill?.books,
      });

      emitTopicsChanged();
      onSaved?.(topic.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-topic-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[#E6EAF2] bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#EEF1F6] px-4 py-3 sm:px-5">
          <h2
            id="create-topic-title"
            className="text-[16px] font-bold text-[#111827]"
          >
            保存为专题
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-lg text-[#8B95A8] hover:bg-[#F3F5F9]"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <p className="text-[13px] leading-relaxed text-[#6B7280]">
            将把当前需求、推荐条件与书单一并保存。之后可在专题内编辑原需求并重新推荐；全新需求可随时开启新搜索。
          </p>

          <div>
            <label className="text-[13px] font-semibold text-[#111827]">
              专题名称
              <span className="ml-1 font-normal text-[#9AA3B5]">可选</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：森林关卡空间引导（可留空由需求生成）"
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E6EAF2] bg-[#FAFBFD] px-3 text-[13px] text-[#111827] outline-none placeholder:text-[#C5CAD6] focus:border-[#C9D4FF] focus:bg-white"
            />
          </div>

          <div className="rounded-xl border border-[#E6EAF2] bg-[#F7F9FC] px-3 py-2.5 text-[12px] leading-relaxed text-[#4B5568]">
            <p className="font-semibold text-[#374151]">将保存的 Context</p>
            <p className="mt-1.5 whitespace-pre-wrap text-[#374151]">
              {description || "—"}
            </p>
            {preview ? (
              <div className="mt-2 space-y-0.5 border-t border-[#E6EAF2] pt-2">
                <p>
                  <span className="text-[#9AA3B5]">主题：</span>
                  {preview.themes.join(" / ") || "—"}
                </p>
                <p>
                  <span className="text-[#9AA3B5]">偏好：</span>
                  {preview.preferences.join(" / ") || "—"}
                </p>
                <p>
                  <span className="text-[#9AA3B5]">时间：</span>
                  {preview.time}
                </p>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="text-[12px] font-medium text-[#DC2626]">{error}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#EEF1F6] px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-[13px] font-semibold text-[#6B7280] hover:bg-[#F3F5F9]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void onSubmit()}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4F5DFF] px-4 text-[13px] font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
            保存为专题
          </button>
        </div>
      </div>
    </div>
  );
}
