"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";

import { ExploreBookCard } from "@/components/explore-book-card";
import {
  emptyExploreFilters,
  filterExploreBooks,
  getProfile,
  mapInterestsToBookTags,
  rankByInterestTags,
  takeRotatedSlice,
} from "@/lib/data";
import type { ExploreBook } from "@/lib/types";

type HomeExploreSectionProps = {
  books: ExploreBook[];
  /** 首页预览数量（横向卡约 2–3 列） */
  previewCount?: number;
};

/** 首页只做预览；完整多选筛选在 /explore */
export function HomeExploreSection({
  books,
  previewCount = 6,
}: HomeExploreSectionProps) {
  const [batch, setBatch] = useState(0);
  const [interestTags, setInterestTags] = useState<string[]>([]);
  const [profileReady, setProfileReady] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    void getProfile()
      .then((p) => setInterestTags(mapInterestsToBookTags(p.interests ?? [])))
      .catch(() => setInterestTags([]))
      .finally(() => setProfileReady(true));
  }, []);

  const ranked = useMemo(() => {
    const list = filterExploreBooks(books, emptyExploreFilters());
    return rankByInterestTags(list, interestTags);
  }, [books, interestTags]);

  const topMatches = useMemo(
    () => takeRotatedSlice(ranked, batch * previewCount, previewCount),
    [ranked, batch, previewCount],
  );

  const canRotate = ranked.length > previewCount;

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">探索</h2>
          <p className="text-sm text-muted-foreground">
            {!profileReady
              ? "正在加载…"
              : "按创作方向逛一逛 · 去完整筛选看更多"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!profileReady || !canRotate}
            onClick={() => startTransition(() => setBatch((b) => b + 1))}
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

      {!profileReady ? (
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topMatches.map((book) => (
            <ExploreBookCard
              key={`${book.id}-${batch}`}
              book={book}
              mode="grid"
              from="home"
            />
          ))}
        </div>
      )}
    </section>
  );
}
