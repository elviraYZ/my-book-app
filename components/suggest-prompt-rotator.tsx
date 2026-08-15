"use client";

import { getSuggestPrompts } from "@/lib/data";
import { cn } from "@/lib/utils";

const VISIBLE = 2;

/**
 * 固定展示 2 条典型示例（截断），点击填入完整短句；高度固定。
 */
export function SuggestPromptRotator({
  onPick,
  disabled,
  className,
  label = "试试这样问",
}: {
  onPick: (prompt: string) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const visible = getSuggestPrompts().slice(0, VISIBLE);
  if (visible.length === 0) return null;

  return (
    <div
      className={cn(
        "flex h-8 items-center gap-2 overflow-hidden",
        className,
      )}
    >
      <span className="shrink-0 text-[12px] text-[#71717A] sm:text-[13px]">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {visible.map((text) => (
          <button
            key={text}
            type="button"
            disabled={disabled}
            onClick={() => onPick(text)}
            title={text}
            className={cn(
              "h-7 min-w-0 flex-1 truncate rounded-full border border-[#E4E4E7]/80 bg-white/70 px-2.5 text-left text-[11px] text-[#52525B] transition-colors sm:text-[12px]",
              "hover:border-[#C7D2FE] hover:bg-white hover:text-[#4F46E5]",
              "disabled:opacity-50",
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 输入框 placeholder：固定取第一条示例 */
export function useRotatingPlaceholder(fallback: string): string {
  const prompts = getSuggestPrompts();
  const text = prompts[0];
  return text ? `例如：${text}` : fallback;
}
