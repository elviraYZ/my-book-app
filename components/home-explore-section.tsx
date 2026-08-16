"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";

import { ExploreBookCard } from "@/components/explore-book-card";
import {
  EXPLORE_PAGE_SIZE,
  emptyExploreFilters,
  filtersToSearchParams,
  getProfile,
  mapInterestsToBookTags,
  rankByInterestTags,
  takeRotatedSlice,
} from "@/lib/data";
import type { ExploreBook } from "@/lib/types";

type HomeExploreSectionProps = {
  /** @deprecated 画像就绪后会按兴趣重新拉取；可留空 */
  books?: ExploreBook[];
  previewCount?: number;
};

type ExplorePageResponse = {
  books: ExploreBook[];
  nextOffset: number;
  hasMore: boolean;
};

/** 首页只做预览；完整多选筛选在 /explore */
export function HomeExploreSection({
  books: _unusedBooks = [],
  previewCount = 6,
}: HomeExploreSectionProps) {
  const [pool, setPool] = useState<ExploreBook[]>([]);
  const [batch, setBatch] = useState(0);
  const [interestTags, setInterestTags] = useState<string[]>([]);
  const [profileReady, setProfileReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const profile = await getProfile();
        const tags = mapInterestsToBookTags(profile.interests ?? []);
        if (cancelled) return;
        setInterestTags(tags);

        const qs = filtersToSearchParams(emptyExploreFilters());
        qs.set("offset", "0");
        qs.set("limit", String(Math.max(previewCount * 4, EXPLORE_PAGE_SIZE)));
        if (tags.length > 0) qs.set("interestTags", tags.join(","));

        const res = await fetch(`/api/explore?${qs}`);
        const data = (await res.json()) as ExplorePageResponse;
        if (!res.ok || cancelled) return;
        setPool(data.books);
        offsetRef.current = data.nextOffset;
        hasMoreRef.current = data.hasMore;
        setBatch(0);
      } catch {
        if (!cancelled) setPool([]);
      } finally {
        if (!cancelled) {
          setProfileReady(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewCount]);

  const ranked = useMemo(
    () => rankByInterestTags(pool, interestTags),
    [pool, interestTags],
  );

  const topMatches = useMemo(
    () => takeRotatedSlice(ranked, batch * previewCount, previewCount),
    [ranked, batch, previewCount],
  );

  const canRotate = ranked.length > previewCount || hasMoreRef.current;

  const onRotate = () => {
    startTransition(() => {
      const nextBatch = batch + 1;
      const need = (nextBatch + 1) * previewCount;
      if (need <= ranked.length) {
        setBatch(nextBatch);
        return;
      }
      if (!hasMoreRef.current) {
        setBatch(0);
        return;
      }
      void (async () => {
        const qs = filtersToSearchParams(emptyExploreFilters());
        qs.set("offset", String(offsetRef.current));
        qs.set("limit", String(EXPLORE_PAGE_SIZE));
        if (interestTags.length > 0) {
          qs.set("interestTags", interestTags.join(","));
        }
        const res = await fetch(`/api/explore?${qs}`);
        const data = (await res.json()) as ExplorePageResponse;
        if (!res.ok) return;
        setPool((prev) => {
          const seen = new Set(prev.map((b) => b.id));
          return [...prev, ...data.books.filter((b) => !seen.has(b.id))];
        });
        offsetRef.current = data.nextOffset;
        hasMoreRef.current = data.hasMore;
        setBatch(nextBatch);
      })();
    });
  };

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">探索</h2>
          <p className="text-sm text-muted-foreground">
            {loading || !profileReady
              ? "正在按你的兴趣加载…"
              : interestTags.length > 0
                ? "按你的兴趣方向推荐 · 去完整筛选看更多"
                : "按创作方向逛一逛 · 去完整筛选看更多"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={loading || !profileReady || !canRotate}
            onClick={onRotate}
            className="inline-flex size-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-muted-foreground hover:border-primary/30 hover:text-foreground disabled:opacity-40"
            aria-label="换一批"
            title={canRotate ? "换一批" : "书目不足，暂无下一批"}
          >
            <RefreshCw className="size-3.5" />
          </button>
          <Link
            href="/explore"
            className="inline-flex h-8 items-center gap-0.5 rounded-full px-2 text-xs font-medium text-primary hover:bg-primary/5"
          >
            查看更多
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </div>

      {loading || !profileReady ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          加载推荐…
        </div>
      ) : topMatches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-muted-foreground">
          <Link href="/explore" className="text-primary underline">
            去探索页逛逛
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topMatches.map((book) => (
            <ExploreBookCard
              key={`${book.id}-${batch}`}
              book={book}
              mode="grid"
              from="home"
              className="h-full"
            />
          ))}
        </div>
      )}
    </section>
  );
}
