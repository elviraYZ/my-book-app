"use client";

import { getSuggestPrompts } from "@/lib/data";
import { cn } from "@/lib/utils";

const VISIBLE = 2;

/**
 * 输入框下方：固定 2 条示例，一句话一行；弱提示、不抢输入框。
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
  const prompts = getSuggestPrompts().slice(0, VISIBLE);
  if (prompts.length === 0) return null;

  return (
    <div className={cn("pl-1", className)}>
      <p className="mb-1 text-[11px] tracking-wide text-slate-400">{label}</p>
      <ul className="flex flex-col gap-1">
        {prompts.map((text) => (
          <li key={text}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(text)}
              className={cn(
                "w-full text-left text-[13px] leading-5 text-slate-500 transition-colors sm:text-sm sm:leading-5",
                "hover:text-sky-700",
                "disabled:opacity-40",
              )}
            >
              {text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 输入框 placeholder：短提示，不与备选长句重复 */
export function useRotatingPlaceholder(fallback: string): string {
  return fallback;
}
