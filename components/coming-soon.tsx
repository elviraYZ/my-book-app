"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

const EVENT = "yoyan:coming-soon";

export function showComingSoon(message = "收藏功能开发中，敬请期待") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { message } }),
  );
}

/** 挂在布局或站点头，用于展示轻提示 */
export function ComingSoonHost() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onShow = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      setMessage(detail?.message ?? "该功能开发中，敬请期待");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 2200);
    };
    window.addEventListener(EVENT, onShow);
    return () => {
      window.removeEventListener(EVENT, onShow);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4"
    >
      <div className="rounded-xl border border-[#E6EAF2] bg-[#111827]/92 px-4 py-2.5 text-[13px] font-medium text-white shadow-lg backdrop-blur-sm">
        {message}
      </div>
    </div>
  );
}

/** 收藏等未上线能力的占位按钮 */
export function ComingSoonButton({
  children,
  className,
  message = "收藏功能开发中，敬请期待",
  ...rest
}: {
  children: ReactNode;
  message?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type">) {
  const onClick = useCallback(() => {
    showComingSoon(message);
  }, [message]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("cursor-pointer", className)}
      {...rest}
    >
      {children}
    </button>
  );
}
