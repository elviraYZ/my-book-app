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
  EXPLORE_PAGE_SIZE,
  emptyExploreFilters,
  filtersFromSearchParams,
  filtersToSearchParams,
  getActiveFilterChips,
  getProfile,
  mapInterestsToBookTags,
  rankByInterestTags,
  removeFilterValue,
} from "@/lib/data";
import type { ExploreBook, ExploreFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

type ExplorePageResponse = {
  books: ExploreBook[];
  nextOffset: number;
  hasMore: boolean;
  error?: string;
};

async function fetchExplorePage(
  filters: ExploreFilters,
  offset: number,
  options?: {
    limit?: number;
    interestTags?: string[];
    signal?: AbortSignal;
  },
): Promise<ExplorePageResponse> {
  const qs = filtersToSearchParams(filters);
  qs.set("offset", String(offset));
  qs.set("limit", String(options?.limit ?? EXPLORE_PAGE_SIZE));
  if (options?.interestTags?.length) {
    qs.set("interestTags", options.interestTags.join(","));
  }
  const res = await fetch(`/api/explore?${qs}`, { signal: options?.signal });
  const data = (await res.json()) as ExplorePageResponse;
  if (!res.ok) {
    throw new Error(data.error ?? "加载失败");
  }
  return data;
}

export function ExplorePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ExploreFilters>(() =>
    filtersFromSearchParams(searchParams),
  );
  const [books, setBooks] = useState<ExploreBook[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloading, setReloading] = useState(true);
  const [interestTags, setInterestTags] = useState<string[]>([]);
  const [profileReady, setProfileReady] = useState(false);
  const [viewMode, setViewMode] = useState<ExploreViewMode>("stack");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadLockRef = useRef(false);
  const interestTagsRef = useRef<string[]>([]);
  interestTagsRef.current = interestTags;

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

  const feed = useMemo(
    () => rankByInterestTags(books, interestTags),
    [books, interestTags],
  );
  const chips = useMemo(() => getActiveFilterChips(filters), [filters]);

  const reloadFromStart = async (
    nextFilters: ExploreFilters,
    tags: string[] = interestTagsRef.current,
  ) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setReloading(true);
    try {
      const page = await fetchExplorePage(nextFilters, 0, {
        limit: EXPLORE_PAGE_SIZE,
        interestTags: tags,
        signal: ac.signal,
      });
      setBooks(page.books);
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setBooks([]);
      setNextOffset(0);
      setHasMore(false);
    } finally {
      setReloading(false);
    }
  };

  // 画像就绪后再拉：无侧栏题材时按兴趣标签收窄，避免首屏「最新入库」跑偏
  useEffect(() => {
    if (!profileReady) return;
    void reloadFromStart(filters);
    // 仅在画像首次就绪时拉；改筛选走 updateFilters
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once
  }, [profileReady]);

  const updateFilters = (next: ExploreFilters) => {
    startTransition(() => {
      setFilters(next);
      const qs = filtersToSearchParams(next);
      const path = qs.toString() ? `/explore?${qs}` : "/explore";
      router.replace(path, { scroll: false });
      scrollRef.current?.scrollTo({ top: 0 });
      void reloadFromStart(next);
    });
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore || reloading || loadLockRef.current) return;
    loadLockRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchExplorePage(filters, nextOffset, {
        interestTags: interestTagsRef.current,
      });
      setBooks((prev) => {
        const seen = new Set(prev.map((b) => b.id));
        const appended = page.books.filter((b) => !seen.has(b.id));
        return [...prev, ...appended];
      });
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch {
      // keep current list
    } finally {
      setLoadingMore(false);
      loadLockRef.current = false;
    }
  };

  const rotateBatch = async () => {
    if (reloading || loadingMore) return;
    scrollRef.current?.scrollTo({ top: 0 });
    if (!hasMore) {
      void reloadFromStart(filters);
      return;
    }
    setReloading(true);
    try {
      const page = await fetchExplorePage(filters, nextOffset, {
        interestTags: interestTagsRef.current,
      });
      if (page.books.length === 0) {
        await reloadFromStart(filters);
        return;
      }
      setBooks(page.books);
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch {
      // keep current
    } finally {
      setReloading(false);
    }
  };

  useEffect(() => {
    const root = scrollRef.current;
    const target = loadMoreRef.current;
    if (!root || !target || !hasMore || !profileReady || reloading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void loadMore();
      },
      { root, rootMargin: "160px 0px", threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMore closes over latest offset/filters
  }, [hasMore, profileReady, reloading, nextOffset, feed.length, filters]);

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
              {!profileReady || reloading
                ? "按你的兴趣加载书目…"
                : interestTags.length > 0 && filters.genres.length === 0
                  ? `已加载 ${feed.length} 本（按兴趣）${hasMore ? " · 下滑继续" : ""}`
                  : `已加载 ${feed.length} 本${hasMore ? " · 下滑继续" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!profileReady || reloading || feed.length === 0}
              onClick={() => void rotateBatch()}
              className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-muted-foreground hover:border-primary/30 hover:text-foreground disabled:opacity-40"
              aria-label="换一批"
              title="换一批"
            >
              <RefreshCw
                className={cn("size-3.5", reloading && "animate-spin")}
              />
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
            {!profileReady || reloading ? (
              <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                加载书目…
              </div>
            ) : feed.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-16 text-center text-sm text-muted-foreground">
                没有符合筛选的书，试试放宽条件
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {feed.map((book) => (
                  <ExploreBookCard
                    key={book.id}
                    book={book}
                    mode="grid"
                    from="explore"
                    className="h-full"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {feed.map((book) => (
                  <ExploreBookCard
                    key={book.id}
                    book={book}
                    mode="stack"
                    from="explore"
                  />
                ))}
              </div>
            )}

            {feed.length > 0 && !reloading ? (
              <div className="flex flex-col items-center gap-2 py-6">
                <p className="text-xs text-muted-foreground">
                  已显示 {feed.length} 本
                </p>
                {hasMore ? (
                  <div
                    ref={loadMoreRef}
                    className="flex items-center gap-2 py-1 text-xs text-muted-foreground"
                    aria-hidden
                  >
                    <Loader2
                      className={cn(
                        "size-3.5",
                        loadingMore ? "animate-spin" : "opacity-40",
                      )}
                    />
                    {loadingMore ? "加载中…" : "继续下滑加载"}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">已到目录末尾</p>
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
