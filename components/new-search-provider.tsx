"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Search, Sparkles, X } from "lucide-react";

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

type NewSearchContextValue = {
  openNewSearch: () => void;
  closeNewSearch: () => void;
};

const NewSearchContext = createContext<NewSearchContextValue | null>(null);

export function useNewSearch(): NewSearchContextValue {
  const ctx = useContext(NewSearchContext);
  if (!ctx) {
    throw new Error("useNewSearch must be used within NewSearchProvider");
  }
  return ctx;
}

/** 安全版：无 Provider 时 no-op（避免个别页漏包） */
export function useNewSearchOptional(): NewSearchContextValue {
  const ctx = useContext(NewSearchContext);
  return (
    ctx ?? {
      openNewSearch: () => {
        if (typeof window !== "undefined") {
          window.location.href = "/?focus=ai";
        }
      },
      closeNewSearch: () => {},
    }
  );
}

function NewSearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placeholder = useRotatingPlaceholder("说说你想看什么…");
  const { percent, label, overlayOpen, finish, dismiss } =
    useEstimatedRecommendProgress(loading);

  useEffect(() => {
    if (!open) return;
    setPrompt("");
    setError(null);
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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
      onClose();
      router.push("/recommend");
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
  };

  if (!open) return null;

  return (
    <>
      <RecommendLoadingOverlay
        open={overlayOpen}
        percent={percent}
        label={label}
        onCancel={cancelRecommend}
        hint="通常几秒到十几秒。可随时取消。"
      />
      <div
        className="fixed inset-0 z-[70] flex items-start justify-center bg-[#0F172A]/45 px-4 pt-[12vh] backdrop-blur-[2px] sm:pt-[16vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-search-overlay-title"
        onClick={() => {
          if (!loading) onClose();
        }}
      >
        <div
          className="w-full max-w-lg rounded-2xl border border-white/80 bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.2)] sm:p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2
                id="new-search-overlay-title"
                className="text-[16px] font-bold text-[#111827]"
              >
                新的阅读需求
              </h2>
              <p className="mt-1 text-[13px] text-[#8B95A8]">
                输入你想了解的方向，马上开始推荐
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="inline-flex size-8 items-center justify-center rounded-lg text-[#8B95A8] hover:bg-[#F3F5F9] hover:text-[#374151] disabled:opacity-50"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          </div>

          <form onSubmit={(e) => void onSubmit(e)}>
            <div
              className={cn(
                "flex items-center gap-2.5 rounded-full border border-[#E6EAF2] bg-[#F8FAFC] py-2 pr-2 pl-4",
                loading && "opacity-90",
              )}
            >
              <Sparkles className="size-[1.125rem] shrink-0 text-[#6366F1]" />
              <input
                ref={inputRef}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setError(null);
                }}
                disabled={loading}
                placeholder={placeholder}
                className="h-11 w-full min-w-0 bg-transparent text-[15px] text-[#111827] outline-none placeholder:text-[#A1A1AA] disabled:cursor-wait"
              />
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#3F3F46] text-white transition-transform hover:scale-[1.03] hover:bg-[#27272A] active:scale-95 disabled:opacity-60"
                aria-label="开始推荐"
              >
                <ArrowRight className="size-5" />
              </button>
            </div>
          </form>

          <SuggestPromptRotator
            className="mt-3"
            label="试试这样问"
            disabled={loading}
            onPick={(text) => {
              setPrompt(text);
              setError(null);
              inputRef.current?.focus();
            }}
          />

          {error ? (
            <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

export function NewSearchProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const closeNewSearch = useCallback(() => setOpen(false), []);

  const openNewSearch = useCallback(() => {
    // 已在首页：聚焦首页输入，不另开 overlay
    if (pathname === "/") {
      router.push("/?focus=ai");
      return;
    }
    setOpen(true);
  }, [pathname, router]);

  return (
    <NewSearchContext.Provider value={{ openNewSearch, closeNewSearch }}>
      {children}
      <NewSearchModal open={open} onClose={closeNewSearch} />
    </NewSearchContext.Provider>
  );
}

/** 按钮：非首页弹 overlay，首页则 focus 输入 */
export function NewSearchButton({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const { openNewSearch } = useNewSearchOptional();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        onClick?.();
        openNewSearch();
      }}
    >
      {children ?? (
        <>
          <Search className="size-3.5" />
          新搜索
        </>
      )}
    </button>
  );
}
