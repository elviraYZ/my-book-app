"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

const ROTATING_LABELS = [
  "正在理解你的需求…",
  "正在匹配书库…",
  "正在整理推荐结果…",
];

/** 停在 100% 的可见时间，确保用户能看到 */
const FINISH_HOLD_MS = 1100;
const LABEL_ROTATE_MS = 2600;
const TICK_MS = 80;
/** 假进度软顶：请求未完成时最高停在这里 */
const SOFT_CAP = 98;

/**
 * 越久越慢的假进度（秒 → 0–98）。
 * 约 10s 到 ~90%，再约 4s 贴到 98%，之后长时间卡在 98。
 */
function estimatedPercent(elapsedMs: number): number {
  const t = Math.max(0, elapsedMs) / 1000;
  if (t >= 14) return SOFT_CAP;
  if (t <= 10) {
    const u = t / 10;
    return 90 * (1 - Math.pow(1 - u, 2.1));
  }
  const u = (t - 10) / 4;
  return Math.min(SOFT_CAP, 90 + 8 * (1 - Math.pow(1 - u, 1.8)));
}

function labelForPercent(p: number, finishing: boolean, rotateIndex: number) {
  if (finishing || p >= 100) return "推荐完成";
  if (p >= 92) return "即将完成，再稍等一下…";
  return ROTATING_LABELS[rotateIndex % ROTATING_LABELS.length]!;
}

/**
 * 推荐 loading：百分比读条 + 越久越慢；未完成时卡在 98%。
 * finish() 停表并冲到 100%，停留可见后再 resolve。
 */
export function useEstimatedRecommendProgress(active: boolean): {
  percent: number;
  label: string;
  overlayOpen: boolean;
  finish: () => Promise<void>;
  dismiss: () => void;
} {
  const [percent, setPercent] = useState(0);
  const [labelIndex, setLabelIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const finishResolver = useRef<(() => void) | null>(null);
  const finishTimer = useRef<number | null>(null);
  const activeRef = useRef(active);
  const finishingRef = useRef(false);
  const startedAt = useRef<number>(0);
  activeRef.current = active;

  const clearFinishTimer = () => {
    if (finishTimer.current != null) {
      window.clearTimeout(finishTimer.current);
      finishTimer.current = null;
    }
  };

  const resetVisual = () => {
    finishingRef.current = false;
    setFinishing(false);
    setOverlayOpen(false);
    setPercent(0);
    setLabelIndex(0);
  };

  const dismiss = useCallback(() => {
    clearFinishTimer();
    if (finishResolver.current) {
      finishResolver.current();
      finishResolver.current = null;
    }
    resetVisual();
  }, []);

  const finish = useCallback((): Promise<void> => {
    clearFinishTimer();
    finishingRef.current = true;
    setFinishing(true);
    setOverlayOpen(true);
    setPercent(100);
    return new Promise((resolve) => {
      finishResolver.current = resolve;
      finishTimer.current = window.setTimeout(() => {
        finishTimer.current = null;
        finishResolver.current = null;
        // 保持 100% / finishing，直到 active 结束或 dismiss，避免又跳回 98
        resolve();
      }, FINISH_HOLD_MS);
    });
  }, []);

  useEffect(() => {
    if (active) {
      clearFinishTimer();
      finishingRef.current = false;
      setFinishing(false);
      setOverlayOpen(true);
      setPercent(0);
      setLabelIndex(0);
      startedAt.current = performance.now();

      const tick = window.setInterval(() => {
        if (finishingRef.current) return;
        const elapsed = performance.now() - startedAt.current;
        setPercent(estimatedPercent(elapsed));
      }, TICK_MS);

      const rotate = window.setInterval(() => {
        if (finishingRef.current) return;
        setLabelIndex((i) => i + 1);
      }, LABEL_ROTATE_MS);

      return () => {
        window.clearInterval(tick);
        window.clearInterval(rotate);
      };
    }

    // active 结束：若刚 finish 完，短暂保留 100 再关（已在 finish hold 内展示过）
    clearFinishTimer();
    if (finishResolver.current) {
      finishResolver.current();
      finishResolver.current = null;
    }
    resetVisual();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅跟 active
  }, [active]);

  useEffect(() => {
    return () => {
      clearFinishTimer();
    };
  }, []);

  const displayPercent = finishing || finishingRef.current ? 100 : percent;
  const label = labelForPercent(displayPercent, finishing, labelIndex);

  return {
    percent: Math.round(displayPercent),
    label,
    overlayOpen: overlayOpen || finishing,
    finish,
    dismiss,
  };
}

type RecommendLoadingOverlayProps = {
  open: boolean;
  percent?: number;
  label: string;
  onCancel: () => void;
  hint?: string;
};

/**
 * 全屏推荐 loading：百分比读条 + 文案 + 取消。
 */
export function RecommendLoadingOverlay({
  open,
  percent = 0,
  label,
  onCancel,
  hint = "通常几秒到十几秒。可随时取消，取消后不会跳转。",
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

  const clamped = Math.max(0, Math.min(100, percent));
  const isDone = clamped >= 100 || label === "推荐完成";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0F172A]/45 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recommend-progress-title"
      aria-busy={!isDone}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/80 bg-white p-6 shadow-[0_24px_64px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              id="recommend-progress-title"
              className="text-sm font-medium text-[#312E81]"
              aria-live="polite"
            >
              {label}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#64748B]">
              {hint}
            </p>
          </div>
          <span className="tabular-nums text-lg font-semibold tracking-tight text-[#4F46E5]">
            {clamped}%
          </span>
        </div>

        <div
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#EEF2FF]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clamped}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#6366F1] to-[#4F46E5] transition-[width] duration-300 ease-out"
            style={{ width: `${clamped}%` }}
          />
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

/** onboarding → 首页：保存/跳转过程的全屏状态，避免空白等待 */
export function OnboardingRedirectOverlay({ open }: { open: boolean }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0F172A]/45 px-4 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/80 bg-white p-6 text-center shadow-[0_24px_64px_rgba(15,23,42,0.18)]">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal-50">
          <Loader2 className="size-6 animate-spin text-teal-600" />
        </span>
        <p className="mt-4 text-sm font-medium text-slate-900">
          正在开启你的专属推荐…
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">
          画像已保存，正在进入首页，请稍候
        </p>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-teal-500 to-sky-500" />
        </div>
      </div>
    </div>
  );
}
