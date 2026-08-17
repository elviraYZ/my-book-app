"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";

import {
  isAbortError,
  RecommendLoadingOverlay,
  useEstimatedRecommendProgress,
} from "@/components/recommend-loading-overlay";
import {
  SuggestPromptRotator,
  useRotatingPlaceholder,
} from "@/components/suggest-prompt-rotator";
import { recommend } from "@/lib/data";
import { cn } from "@/lib/utils";

/** 创建新专题 / 开启新搜索：导向首页并聚焦此输入 */
export const HOME_AI_FOCUS_HREF = "/?focus=ai";

export function HomeAiInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState(false);
  const placeholder = useRotatingPlaceholder("说说你想看什么…");
  const { percent, label, overlayOpen, finish, dismiss } =
    useEstimatedRecommendProgress(loading);

  useEffect(() => {
    if (searchParams.get("focus") !== "ai") return;

    document.getElementById("home-ai")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setSpotlight(true);
    inputRef.current?.focus({ preventScroll: true });

    const t = window.setTimeout(() => {
      setSpotlight(false);
      router.replace("/", { scroll: false });
    }, 500);

    return () => window.clearTimeout(t);
  }, [searchParams, router]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const cancelRecommend = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    dismiss();
    setLoading(false);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || loading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      await recommend({ prompt: prompt.trim() }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      await finish();
      if (controller.signal.aborted) return;
      router.push(`/recommend?v=${Date.now()}`);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) {
        dismiss();
        setLoading(false);
        return;
      }
      setError("推荐失败，请稍后重试");
      dismiss();
      setLoading(false);
    }
    // 成功跳转后不必 setLoading(false)，避免闪一下再离开
  };

  return (
    <div
      id="home-ai"
      className={cn(
        "scroll-mt-24 space-y-3 rounded-2xl transition-shadow duration-500",
        spotlight &&
          "ring-2 ring-sky-300/80 ring-offset-4 ring-offset-sky-50/80",
      )}
      aria-busy={loading}
    >
      <RecommendLoadingOverlay
        open={overlayOpen}
        percent={percent}
        label={label}
        onCancel={cancelRecommend}
        hint="通常几秒到十几秒。可随时取消，取消后不会跳转。"
      />

      <form onSubmit={onSubmit} className="relative">
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-full border border-white bg-white py-2 pr-2 pl-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-[box-shadow,opacity]",
            loading && "opacity-90 shadow-[0_8px_28px_rgba(79,70,229,0.12)]",
          )}
        >
          <Sparkles
            className={cn(
              "size-[1.125rem] shrink-0 text-[#6366F1] transition-transform",
              loading && "animate-pulse",
            )}
          />
          <input
            ref={inputRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setError(null);
            }}
            disabled={loading}
            placeholder={placeholder}
            className="h-11 w-full min-w-0 bg-transparent text-[15px] text-[#111827] outline-none placeholder:text-[#A1A1AA] disabled:cursor-wait disabled:text-[#52525B] sm:text-base"
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#3F3F46] text-white transition-transform hover:scale-[1.03] hover:bg-[#27272A] active:scale-95 disabled:opacity-60"
            aria-label={loading ? "正在推荐" : "开始推荐"}
          >
            <ArrowRight className="size-5" />
          </button>
        </div>
      </form>

      <SuggestPromptRotator
        disabled={loading}
        onPick={(text) => {
          setPrompt(text);
          setError(null);
          inputRef.current?.focus();
        }}
      />

      {error ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
