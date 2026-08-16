"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Loader2, RefreshCw, X } from "lucide-react";

import {
  ExploreBookCard,
  type ExploreViewMode,
} from "@/components/explore-book-card";
import { ExploreSidebar } from "@/components/explore-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
  emptyExploreFilters,
  filterExploreBooks,
  filtersFromSearchParams,
  filtersToSearchParams,
  getActiveFilterChips,
  getProfile,
  mapInterestsToBookTags,
  rankByInterestTags,
  removeFilterValue,
  takeRotatedSlice,
} from "@/lib/data";
import type { ExploreBook, ExploreFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 本地目录分页：滚动触底再加载，不点按钮 */
const PAGE_SIZE = 6;

export function ExplorePageClient({ books }: { books: ExploreBook[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ExploreFilters>(() =>
    filtersFromSearchParams(searchParams),
  );
  /** 换一批：批次下标，配合 PAGE_SIZE 做窗口轮换 */
  const [batch, setBatch] = useState(0);
  const [interestTags, setInterestTags] = useState<string[]>([]);
  const [profileReady, setProfileReady] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [viewMode, setViewMode] = useState<ExploreViewMode>("stack");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void getProfile()
      .then((p) => {
        setInterestTags(mapInterestsToBookTags(p.interests ?? []));
      })
      .catch(() => {
        setInterestTags([]);
      })
      .finally(() => setProfileReady(true));
  }, []);

  const ranked = useMemo(() => {
    const filtered = filterExploreBooks(books, filters);
    return rankByInterestTags(filtered, interestTags);
  }, [books, filters, interestTags]);

  const feed = useMemo(
    () => takeRotatedSlice(ranked, batch * PAGE_SIZE, visibleCount),
    [ranked, batch, visibleCount],
  );
  const hasMore = visibleCount < ranked.length;
  const canRotate = ranked.length > PAGE_SIZE;
  const chips = useMemo(() => getActiveFilterChips(filters), [filters]);

  const updateFilters = (next: ExploreFilters) => {
    startTransition(() => {
      setFilters(next);
      setBatch(0);
      setVisibleCount(PAGE_SIZE);
      const qs = filtersToSearchParams(next);
      const path = qs.toString() ? `/explore?${qs}` : "/explore";
      router.replace(path, { scroll: false });
      scrollRef.current?.scrollTo({ top: 0 });
    });
  };

  // 列表滚动触底 → 自动加载下一批
  useEffect(() => {
    const root = scrollRef.current;
    const target = loadMoreRef.current;
    if (!root || !target || !hasMore || !profileReady) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((n) => Math.min(n + PAGE_SIZE, ranked.length));
      },
      { root, rootMargin: "120px 0px", threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, profileReady, ranked.length, feed.length]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <SiteHeader active="explore" />

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
        <div className="flex items-end justify-between gap-3 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              探索
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {profileReady
                ? `共 ${ranked.length} 本 · 可按题材方向筛选`
                : "加载书目…"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!profileReady || !canRotate}
              onClick={() =>
                startTransition(() => {
                  setBatch((b) => b + 1);
                  setVisibleCount(PAGE_SIZE);
                  scrollRef.current?.scrollTo({ top: 0 });
                })
              }
              className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-muted-foreground hover:border-primary/30 hover:text-foreground disabled:opacity-40"
              aria-label="换一批"
              title={canRotate ? "换一批" : "书目不足，暂无下一批"}
            >
              <RefreshCw className="size-3.5" />
            </button>
            <div className="hidden items-center rounded-full border border-slate-200 p-0.5 sm:flex">
              <button
                type="button"
                onClick={() => setViewMode("stack")}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full",
                  viewMode === "stack"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
                aria-label="列表"
              >
                <List className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full",
                  viewMode === "grid"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
                aria-label="网格"
              >
                <LayoutGrid className="size-3.5" />
              </button>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium sm:hidden"
              onClick={() => setMobileFiltersOpen(true)}
            >
              筛选
            </button>
          </div>
        </div>

        {chips.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <button
                key={`${chip.key}-${chip.value}`}
                type="button"
                onClick={() =>
                  updateFilters(
                    removeFilterValue(filters, chip.key, chip.value),
                  )
                }
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
              >
                {chip.label}
                <X className="size-3" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => updateFilters(emptyExploreFilters())}
              className="text-xs text-primary"
            >
              清空
            </button>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 gap-6 pb-4">
          <ExploreSidebar
            value={filters}
            onChange={updateFilters}
            className="hidden h-full min-h-0 w-56 shrink-0 lg:flex"
          />

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            {!profileReady ? (
              <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                加载书目…
              </div>
            ) : ranked.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-16 text-center text-sm text-muted-foreground">
                没有符合筛选的书，试试放宽条件
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {feed.map((book) => (
                  <ExploreBookCard
                    key={`${book.id}-${batch}`}
                    book={book}
                    mode="grid"
                    from="explore"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {feed.map((book) => (
                  <ExploreBookCard
                    key={`${book.id}-${batch}`}
                    book={book}
                    mode="stack"
                    from="explore"
                  />
                ))}
              </div>
            )}

            {ranked.length > 0 ? (
              <div className="flex flex-col items-center gap-2 py-6">
                <p className="text-xs text-muted-foreground">
                  已显示 {feed.length} / {ranked.length}
                </p>
                {hasMore ? (
                  <div
                    ref={loadMoreRef}
                    className="flex items-center gap-2 py-1 text-xs text-muted-foreground"
                    aria-hidden
                  >
                    <Loader2 className="size-3.5 animate-spin" />
                    继续下滑加载
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    已到本地目录末尾
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="关闭筛选"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-background p-3 shadow-xl">
            <ExploreSidebar
              value={filters}
              onChange={(next) => {
                updateFilters(next);
                setMobileFiltersOpen(false);
              }}
              className="h-full min-h-0"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
