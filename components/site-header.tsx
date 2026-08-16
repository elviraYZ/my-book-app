"use client";

import Link from "next/link";
import { Bell, BookOpen, Search } from "lucide-react";

import { AuthNav } from "@/components/auth-nav";
import {
  ComingSoonHost,
  showComingSoon,
} from "@/components/coming-soon";
import { useNewSearchOptional } from "@/components/new-search-provider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const linkNavItems = [
  { href: "/", label: "首页" },
  { href: "/explore", label: "探索" },
  { href: "/topics", label: "我的专题" },
  { href: "/bookmarks", label: "收藏" },
] as const;

type SiteHeaderProps = {
  active?: "home" | "explore" | "topics" | "favorites" | "none";
  variant?: "default" | "minimal";
};

export function SiteHeader({
  active = "none",
  variant = "default",
}: SiteHeaderProps) {
  const { openNewSearch } = useNewSearchOptional();
  const activeHref =
    active === "home"
      ? "/"
      : active === "explore"
        ? "/explore"
        : active === "topics"
          ? "/topics"
          : active === "favorites"
            ? "/bookmarks"
            : null;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/25">
              <BookOpen className="size-4" aria-hidden />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-bold tracking-tight text-foreground sm:text-[15px]">
                游研书伴
              </span>
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                AI 推荐阅读
              </span>
            </span>
          </Link>

          {variant === "default" ? (
            <>
              <nav className="ml-2 hidden items-center gap-1 md:flex">
                {linkNavItems.map((item) => {
                  const isActive = activeHref === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "relative px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {item.label}
                      {isActive ? (
                        <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-primary" />
                      ) : null}
                    </Link>
                  );
                })}
              </nav>

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openNewSearch()}
                  className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                  aria-label="AI 搜索"
                  title="AI 搜索"
                >
                  <Search className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => showComingSoon("通知中心开发中，敬请期待")}
                  className="hidden size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
                  aria-label="通知（开发中）"
                  title="通知开发中"
                >
                  <Bell className="size-4" />
                </button>
                <AuthNav compact />
              </div>
            </>
          ) : (
            <div className="ml-auto">
              <AuthNav />
            </div>
          )}
        </div>

        {variant === "default" ? (
          <nav className="flex gap-1 overflow-x-auto border-t border-border/50 px-4 py-1.5 md:hidden">
            {linkNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "shrink-0",
                  activeHref === item.href && "bg-primary/10 text-primary",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <ComingSoonHost />
    </>
  );
}
