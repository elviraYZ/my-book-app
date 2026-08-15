import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { HomeAiInput } from "@/components/home-ai-input";
import { HomeExploreSection } from "@/components/home-explore-section";
import { HomeTopicsSection } from "@/components/home-topics-section";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { listExploreBooks } from "@/lib/data";
import type { Topic } from "@/lib/types";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  // 专题在客户端 hydrate（避免 SSR 引入 supabase/server → next/headers）
  const exploreBooks = await listExploreBooks();
  const topics: Topic[] = [];

  return (
    <>
      <SiteHeader active="home" />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 px-6 py-10 sm:px-10 sm:py-12">
          <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-10 size-48 rounded-full bg-blue-200/30 blur-3xl" />

          <div className="relative grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-7">
              <div className="space-y-3.5">
                <h1 className="text-[1.75rem] font-bold tracking-tight text-[#111827] sm:text-[2.25rem] sm:leading-tight">
                  今天想看什么书？
                </h1>
                <p className="max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base">
                  从一个想法开始，帮你找到合适的书，也把思路留下来。
                </p>
              </div>
              <Suspense
                fallback={
                  <div className="h-14 animate-pulse rounded-full bg-white/70" />
                }
              >
                <HomeAiInput />
              </Suspense>
            </div>

            <div className="relative mx-auto hidden h-52 w-full max-w-xs lg:block">
              <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-sky-400/20 to-blue-600/10" />
              <div className="absolute top-6 right-8 left-8 flex h-40 items-end justify-center">
                <div className="relative h-32 w-40 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 shadow-xl shadow-sky-300/50">
                  <div className="absolute inset-x-4 top-4 h-16 rounded-lg bg-white/20" />
                  <div className="absolute right-3 bottom-3 left-3 h-8 rounded-md bg-white/25" />
                  <Sparkles className="absolute -top-3 -right-2 size-6 text-sky-300" />
                  <Sparkles className="absolute top-8 -left-3 size-4 text-blue-200" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <HomeExploreSection books={exploreBooks} />

        <HomeTopicsSection initialTopics={topics} />

        {/* Bottom tip */}
        <section className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-sky-50 to-blue-50 px-5 py-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-600">
              <Sparkles className="size-4" />
            </span>
            <p className="text-sm text-slate-700">
              在推荐结果页「保存为专题」，会一并保存需求、条件与书单。专题内可编辑原需求并重新推荐；全新需求请从首页
              AI 输入开始。
            </p>
          </div>
          <Link
            href="/topics"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "shrink-0 rounded-xl gap-1 border-slate-200 bg-white",
            )}
          >
            了解更多
            <ArrowRight className="size-3.5" />
          </Link>
        </section>
      </div>
    </>
  );
}
