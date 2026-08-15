"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

const ROTATING_LABELS = [
  "正在理解你的需求…",
  "正在匹配书库…",
  "正在整理推荐结果…",
];

const FINISH_HOLD_MS = 320;
const LABEL_ROTATE_MS = 2200;

/**
 * 推荐 loading：无假百分比，仅转圈 + 轮换文案。
 * finish() 短暂显示「推荐完成」后 resolve。
 */
export function useEstimatedRecommendProgress(active: boolean): {
  percent: number;
  label: string;
  overlayOpen: boolean;
  finish: () => Promise<void>;
  dismiss: () => void;
} {
  const [labelIndex, setLabelIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const finishResolver = useRef<(() => void) | null>(null);
  const finishTimer = useRef<number | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const clearFinishTimer = () => {
    if (finishTimer.current != null) {
      window.clearTimeout(finishTimer.current);
      finishTimer.current = null;
    }
  };

  const dismiss = useCallback(() => {
    clearFinishTimer();
    if (finishResolver.current) {
      finishResolver.current();
      finishResolver.current = null;
    }
    setFinishing(false);
    setOverlayOpen(false);
    setLabelIndex(0);
  }, []);

  const finish = useCallback((): Promise<void> => {
    clearFinishTimer();
    setFinishing(true);
    setOverlayOpen(true);
    return new Promise((resolve) => {
      finishResolver.current = resolve;
      finishTimer.current = window.setTimeout(() => {
        finishTimer.current = null;
        finishResolver.current = null;
        setFinishing(false);
        if (!activeRef.current) {
          setOverlayOpen(false);
          setLabelIndex(0);
        }
        resolve();
      }, FINISH_HOLD_MS);
    });
  }, []);

  useEffect(() => {
    if (active) {
      clearFinishTimer();
      setFinishing(false);
      setOverlayOpen(true);
      setLabelIndex(0);
      const id = window.setInterval(() => {
        setLabelIndex((i) => (i + 1) % ROTATING_LABELS.length);
      }, LABEL_ROTATE_MS);
      return () => window.clearInterval(id);
    }

    if (!finishing) {
      setOverlayOpen(false);
      setLabelIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅跟 active
  }, [active]);

  useEffect(() => {
    return () => {
      clearFinishTimer();
    };
  }, []);

  const label = finishing
    ? "推荐完成"
    : ROTATING_LABELS[labelIndex] ?? ROTATING_LABELS[0]!;

  return {
    /** 兼容旧调用方；转圈模式不表示真实进度 */
    percent: finishing ? 100 : 0,
    label,
    overlayOpen: overlayOpen || finishing,
    finish,
    dismiss,
  };
}

type RecommendLoadingOverlayProps = {
  open: boolean;
  /** @deprecated 转圈模式忽略 */
  percent?: number;
  label: string;
  onCancel: () => void;
  hint?: string;
};

/**
 * 全屏推荐 loading：转圈 + 文案 + 取消（无假百分比）。
 */
export function RecommendLoadingOverlay({
  open,
  label,
  onCancel,
  hint = "可随时取消。取消后不会跳转或覆盖当前结果。",
}: RecommendLoadingOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const isDone = label === "推荐完成";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0F172A]/45 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recommend-progress-title"
      aria-busy={!isDone}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/80 bg-white p-6 shadow-[0_24px_64px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-[#EEF2FF]">
            <Loader2
              className={
                isDone
                  ? "size-6 text-[#4F46E5]"
                  : "size-6 animate-spin text-[#4F46E5]"
              }
            />
          </span>
          <p
            id="recommend-progress-title"
            className="mt-4 text-sm font-medium text-[#312E81]"
            aria-live="polite"
          >
            {label}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-[#64748B]">
            {hint}
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={isDone}
          className="mt-5 flex h-10 w-full items-center justify-center rounded-xl border border-[#E4E4E7] bg-white text-sm font-medium text-[#3F3F46] transition-colors hover:bg-[#F4F4F5] disabled:cursor-default disabled:opacity-50"
        >
          取消
        </button>
      </div>
    </div>
  );
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: string }).name) : "";
  if (name === "AbortError") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /aborted|AbortError/i.test(msg);
}
