"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Braces,
  ChevronRight,
  Gamepad2,
  Leaf,
  Plus,
  Sparkles,
  Trees,
  Users,
} from "lucide-react";

import { NewSearchButton } from "@/components/new-search-provider";
import { buttonVariants } from "@/components/ui/button";
import { BOOKMARKS_CHANGED, TOPICS_CHANGED } from "@/lib/data-events";
import { listTopics } from "@/lib/data";
import type { Topic } from "@/lib/types";
import { cn } from "@/lib/utils";

const topicIcons = {
  forest: Trees,
  myth: Sparkles,
  team: Users,
  loop: Gamepad2,
  art: Sparkles,
  game: Gamepad2,
  code: Braces,
  spark: Sparkles,
  growth: Leaf,
} as const;

export function HomeTopicsSection({
  initialTopics,
}: {
  initialTopics: Topic[];
}) {
  const [topics, setTopics] = useState(initialTopics);

  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      void listTopics().then((next) => {
        if (!cancelled) setTopics(next);
      });
    };
    reload();
    window.addEventListener(TOPICS_CHANGED, reload);
    window.addEventListener(BOOKMARKS_CHANGED, reload);
    return () => {
      cancelled = true;
      window.removeEventListener(TOPICS_CHANGED, reload);
      window.removeEventListener(BOOKMARKS_CHANGED, reload);
    };
  }, []);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">我的专题</h2>
          <p className="text-sm text-muted-foreground">
            跟踪你的主题阅读进度，持续积累与提升
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NewSearchButton
            className={cn(
              buttonVariants({ size: "sm" }),
              "rounded-xl gap-1 bg-primary",
            )}
          >
            <Plus className="size-3.5" />
            创建新专题
          </NewSearchButton>
          <Link
            href="/topics"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "gap-1 text-muted-foreground",
            )}
          >
            查看全部
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      {topics.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-muted-foreground">
          还没有专题。在推荐结果页点「保存为专题」即可创建。
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {topics.slice(0, 3).map((topic) => {
            const Icon = topicIcons[topic.icon ?? "loop"];
            return (
              <Link
                key={topic.id}
                href={`/topics/${topic.id}`}
                className="group rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition-all hover:border-primary/30 hover:bg-white"
              >
                <div className="mb-3 flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-600">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 group-hover:text-primary">
                      {topic.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {topic.context_text}
                    </p>
                  </div>
                </div>
                <div className="mb-3 flex gap-3 text-xs text-muted-foreground">
                  <span>已收藏 {topic.bookmarked_count ?? 0}</span>
                  <span>书单 {topic.book_count ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    最近更新: {topic.updated_label}
                  </span>
                  <div className="flex -space-x-2">
                    {(topic.cover_colors ?? []).map((color) => (
                      <span
                        key={color}
                        className="size-7 rounded-md border-2 border-white shadow-sm"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    {(topic.cover_colors ?? []).length > 0 ? (
                      <span className="flex size-7 items-center justify-center rounded-md border-2 border-white bg-slate-100 text-[10px] text-slate-500">
                        +
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
