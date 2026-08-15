"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookMarked,
  Braces,
  Clock3,
  FolderOpen,
  Gamepad2,
  LayoutGrid,
  Leaf,
  List,
  MoreHorizontal,
  Plus,
  Sparkles,
  Star,
  Trees,
} from "lucide-react";

import { NewSearchButton } from "@/components/new-search-provider";
import { SiteHeader } from "@/components/site-header";
import {
  DEPTH_OPTIONS,
  FILTER_SECTION_LABELS,
  listTopics,
  SESSION_OPTIONS,
  sessionOptionLabel,
} from "@/lib/data";
import { BOOKMARKS_CHANGED, TOPICS_CHANGED } from "@/lib/data-events";
import { TOPIC_ICONS } from "@/lib/topic-icons";
import type { ReadingDepth, Topic } from "@/lib/types";
import { cn } from "@/lib/utils";

type ViewMode = "list" | "grid";
type SortKey = "default" | "updated" | "bookmarked";
type DepthFilter = "all" | ReadingDepth;
type SessionFilter = "all" | "15" | "30" | "60" | "90";
type UpdatedFilter = "all" | "today" | "week" | "month";

const CATEGORIES = [
  { id: "all", label: "全部专题", icon: FolderOpen },
  { id: "游戏设计", label: "游戏设计", icon: Gamepad2 },
  { id: "关卡设计", label: "关卡设计", icon: Trees },
  { id: "引擎开发", label: "引擎开发", icon: Braces },
  { id: "AI与技术", label: "AI与技术", icon: Sparkles },
  { id: "个人成长", label: "个人成长", icon: Leaf },
] as const;

function sessionLabel(topic: Topic) {
  if (topic.context.session_bucket) {
    return sessionOptionLabel(topic.context.session_bucket);
  }
  const min = topic.context.session_minutes_min;
  const max = topic.context.session_minutes_max;
  const mid = topic.context.session_minutes;
  if (min != null && max != null) return `${min}–${max} 分钟`;
  if (mid != null) {
    return sessionOptionLabel(
      mid <= 15 ? "15" : mid <= 30 ? "30" : mid <= 60 ? "60" : "90",
    );
  }
  return "不限";
}

function preferenceLabel(topic: Topic) {
  const prefs = topic.context.preferences ?? [];
  if (prefs.length === 0) return "偏好：综合";
  return `偏好：${prefs.slice(0, 2).join("/")}`;
}

function matchesSession(topic: Topic, filter: SessionFilter) {
  if (filter === "all") return true;
  if (topic.context.session_bucket) {
    return topic.context.session_bucket === filter;
  }
  const m = topic.context.session_minutes ?? 30;
  if (filter === "15") return m <= 15;
  if (filter === "30") return m > 15 && m <= 30;
  if (filter === "60") return m > 30 && m <= 60;
  if (filter === "90") return m > 60;
  return true;
}

function matchesUpdated(topic: Topic, filter: UpdatedFilter) {
  if (filter === "all") return true;
  const t = new Date(topic.updated_at ?? topic.created_at).getTime();
  const now = Date.now();
  const day = 86400000;
  if (filter === "today") return now - t <= day;
  if (filter === "week") return now - t <= 7 * day;
  return now - t <= 30 * day;
}

function CoverStack({ colors }: { colors: string[] }) {
  const palette = colors.length
    ? colors.slice(0, 3)
    : ["#3B82F6", "#10B981", "#F59E0B"];
  return (
    <div className="flex shrink-0 items-end gap-1.5">
      {palette.map((color, i) => (
        <div
          key={`${color}-${i}`}
          className="aspect-[2/3] w-9 rounded-md shadow-sm ring-1 ring-black/5 sm:w-10"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function TopicListCard({ topic }: { topic: Topic }) {
  const Icon = TOPIC_ICONS[topic.icon ?? "loop"];
  const tags = topic.context.themes?.slice(0, 3) ?? [];

  return (
    <Link
      href={`/topics/${topic.id}`}
      className="group flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-primary/25 hover:shadow-md sm:flex-row sm:items-stretch sm:gap-5 sm:p-5"
    >
      <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100 sm:size-14">
          <Icon className="size-6" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start gap-2">
            <h3 className="text-base font-semibold text-slate-900 group-hover:text-primary sm:text-lg">
              {topic.title}
            </h3>
            <Star className="mt-0.5 size-4 shrink-0 text-slate-300" />
          </div>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <p className="line-clamp-1 text-sm text-muted-foreground">
            {topic.context_text}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3.5" />
              {sessionLabel(topic)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="size-3.5" />
              {preferenceLabel(topic)}
            </span>
          </div>
        </div>
      </div>

      <div className="hidden items-center lg:flex">
        <CoverStack colors={topic.cover_colors ?? []} />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-100 pt-3 sm:w-36 sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
        <div className="text-center sm:w-full">
          <p className="inline-flex items-center justify-center gap-1 text-sm font-semibold text-slate-800">
            <BookMarked className="size-3.5 text-sky-500" />
            {topic.bookmarked_count ?? 0}
          </p>
          <p className="text-[11px] text-muted-foreground">收藏</p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-muted-foreground">
            {topic.updated_label ?? "最近更新"}
          </p>
          <span
            className="inline-flex size-7 items-center justify-center rounded-lg text-slate-400"
            aria-hidden
          >
            <MoreHorizontal className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function TopicGridCard({ topic }: { topic: Topic }) {
  const Icon = TOPIC_ICONS[topic.icon ?? "loop"];
  const tags = topic.context.themes?.slice(0, 2) ?? [];

  return (
    <Link
      href={`/topics/${topic.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-primary/25 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-semibold text-slate-900 group-hover:text-primary">
            {topic.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {topic.context_text}
          </p>
        </div>
      </div>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-muted-foreground">
        <span>收藏 {topic.bookmarked_count ?? 0}</span>
        <span>{topic.book_count ?? 0} 本</span>
      </div>
    </Link>
  );
}

export function TopicsPageClient({ topics: initialTopics }: { topics: Topic[] }) {
  const [topics, setTopics] = useState<Topic[]>(initialTopics);
  const [category, setCategory] = useState<string>("all");
  const [depth, setDepth] = useState<DepthFilter>("all");
  const [session, setSession] = useState<SessionFilter>("all");
  const [updated, setUpdated] = useState<UpdatedFilter>("all");
  const [sort, setSort] = useState<SortKey>("default");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: topics.length };
    for (const c of CATEGORIES) {
      if (c.id === "all") continue;
      counts[c.id] = topics.filter((t) => t.category === c.id).length;
    }
    return counts;
  }, [topics]);

  const filtered = useMemo(() => {
    let list = topics.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (depth !== "all" && t.context.depth !== depth) return false;
      if (!matchesSession(t, session)) return false;
      if (!matchesUpdated(t, updated)) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === "bookmarked") {
        return (b.bookmarked_count ?? 0) - (a.bookmarked_count ?? 0);
      }
      if (sort === "updated") {
        return (
          new Date(b.updated_at ?? b.created_at).getTime() -
          new Date(a.updated_at ?? a.created_at).getTime()
        );
      }
      return 0;
    });
    return list;
  }, [topics, category, depth, session, updated, sort]);

  const stats = useMemo(() => {
    const topicCount = topics.length;
    const bookmarked = topics.reduce(
      (sum, t) => sum + (t.bookmarked_count ?? 0),
      0,
    );
    const books = topics.reduce((sum, t) => sum + (t.book_count ?? 0), 0);
    return { topicCount, bookmarked, books };
  }, [topics]);

  const clearFilters = () => {
    setDepth("all");
    setSession("all");
    setUpdated("all");
  };

  const hasFilters = depth !== "all" || session !== "all" || updated !== "all";

  const sidebar = (
    <div className="flex h-full flex-col gap-5 p-4 sm:p-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          我的专题
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          由推荐结果保存生成；可编辑原需求并重新推荐，已收藏书籍会保留。
        </p>
      </div>

      <NewSearchButton className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 text-sm font-semibold text-white shadow-sm shadow-sky-200/60 transition-opacity hover:opacity-95">
        <Plus className="size-4" />
        创建新专题
      </NewSearchButton>

      <nav className="space-y-0.5">
        {CATEGORIES.map((item) => {
          const Icon = item.icon;
          const active = category === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setCategory(item.id);
                setMobileNavOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                active
                  ? "bg-sky-50 font-medium text-sky-700"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              <Icon className="size-4 shrink-0 opacity-80" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[11px] tabular-nums",
                  active ? "bg-white text-sky-700" : "bg-slate-100 text-slate-500",
                )}
              >
                {categoryCounts[item.id] ?? 0}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-800">筛选</p>
          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-primary hover:underline"
            >
              清空
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">可选</span>
          )}
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs text-muted-foreground">
            {FILTER_SECTION_LABELS.difficulties}
          </span>
          <select
            value={depth}
            onChange={(e) => setDepth(e.target.value as DepthFilter)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-primary/40"
          >
            <option value="all">全部</option>
            {DEPTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-muted-foreground">
            {FILTER_SECTION_LABELS.times}
          </span>
          <select
            value={session}
            onChange={(e) => setSession(e.target.value as SessionFilter)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-primary/40"
          >
            <option value="all">全部</option>
            {SESSION_OPTIONS.filter((o) => o.value !== "").map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-muted-foreground">更新时间</span>
          <select
            value={updated}
            onChange={(e) => setUpdated(e.target.value as UpdatedFilter)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-primary/40"
          >
            <option value="all">全部</option>
            <option value="today">今天</option>
            <option value="week">近 7 天</option>
            <option value="month">近 30 天</option>
          </select>
        </label>
      </div>

      <div className="mt-auto rounded-xl border border-sky-100 bg-sky-50/80 p-3.5">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-800">
          <Sparkles className="size-3.5" />
          AI 助手小贴士
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-sky-800/80">
          专题来自推荐结果的「保存为专题」。可在专题内编辑原需求并重新推荐；全新需求可直接开始新搜索。
        </p>
        <NewSearchButton className="mt-2 inline-block text-left text-xs font-medium text-primary hover:underline">
          描述新需求 →
        </NewSearchButton>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <SiteHeader active="topics" />
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
        <div className="grid min-h-0 flex-1 gap-4 py-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 lg:block">
            <div className="h-full overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white">
              {sidebar}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
              <div>
                <h1 className="text-xl font-bold text-slate-900">我的专题</h1>
                <p className="text-xs text-muted-foreground">
                  {filtered.length} 个专题
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen((v) => !v)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600"
              >
                {mobileNavOpen ? "收起分类" : "分类与筛选"}
              </button>
            </div>

            {mobileNavOpen ? (
              <div className="mb-3 max-h-[50vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white lg:hidden">
                {sidebar}
              </div>
            ) : null}

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-6">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    label: "我的专题",
                    value: `${stats.topicCount} 个`,
                    hint: "持续探索中",
                    icon: FolderOpen,
                    tone: "text-sky-600 bg-sky-50",
                  },
                  {
                    label: "收藏总数",
                    value: `${stats.bookmarked} 本`,
                    hint: "沉淀你的兴趣图谱",
                    icon: Star,
                    tone: "text-amber-600 bg-amber-50",
                  },
                  {
                    label: "书单总量",
                    value: `${stats.books} 本`,
                    hint: "各专题推荐与收藏",
                    icon: BookMarked,
                    tone: "text-violet-600 bg-violet-50",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {item.label}
                          </p>
                          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                            {item.value}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {item.hint}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex size-9 items-center justify-center rounded-xl",
                            item.tone,
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-primary/40"
                >
                  <option value="default">默认排序</option>
                  <option value="updated">最近更新</option>
                  <option value="bookmarked">收藏最多</option>
                </select>
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "inline-flex size-8 items-center justify-center rounded-md transition-colors",
                      viewMode === "list"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-label="列表视图"
                    title="列表"
                  >
                    <List className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "inline-flex size-8 items-center justify-center rounded-md transition-colors",
                      viewMode === "grid"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-label="网格视图"
                    title="网格"
                  >
                    <LayoutGrid className="size-3.5" />
                  </button>
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-muted-foreground">
                  没有符合条件的专题。可清空筛选，或
                  <NewSearchButton className="text-primary underline">
                    创建新专题
                  </NewSearchButton>
                  （先完成推荐再保存）。
                </div>
              ) : viewMode === "list" ? (
                <div className="flex flex-col gap-3">
                  {filtered.map((topic) => (
                    <TopicListCard key={topic.id} topic={topic} />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filtered.map((topic) => (
                    <TopicGridCard key={topic.id} topic={topic} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
