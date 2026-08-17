"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FolderPlus,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  Search,
  Star,
} from "lucide-react";

import { BookmarkButton } from "@/components/bookmark-button";
import { BookCover } from "@/components/book-cover";
import {
  CreateTopicModal,
  type CreateTopicPrefill,
} from "@/components/create-topic-modal";
import { DemandEditorBar } from "@/components/demand-editor-bar";
import {
  isAbortError,
  RecommendLoadingOverlay,
  useEstimatedRecommendProgress,
} from "@/components/recommend-loading-overlay";
import { useNewSearchOptional } from "@/components/new-search-provider";
import { SiteHeader } from "@/components/site-header";
import { bookDetailHref } from "@/lib/book-links";
import {
  clampKeywords,
  clampPreferences,
  clampThemes,
  ensureContextTurns,
  getLastRecommend,
  getTopic,
  MAX_KEYWORDS,
  MAX_PREFERENCES,
  MAX_THEMES,
  MAX_GOALS,
  normalizeGoalsSelection,
  recommend,
  syncTopicRecommendations,
  updateTopic,
} from "@/lib/data";
import { DISLIKED_CHANGED } from "@/lib/data-events";
import {
  shouldWarnTopicDrift,
  TOPIC_DRIFT_HINT,
} from "@/lib/data/recommend/topic-drift";
import type { ReadingDepth, RecommendResponse, TopicBook } from "@/lib/types";
import { cn } from "@/lib/utils";
import { COVERAGE_TIP, REFINEMENT_TIP } from "@/lib/data/recommend/weights";

type ViewMode = "grid" | "list";

function goalsFromRecommend(data: RecommendResponse): string[] {
  const fromDemand = data.demand?.goals;
  if (fromDemand && fromDemand.length > 0) {
    return normalizeGoalsSelection(fromDemand);
  }
  const fromContext = data.context.goals;
  if (fromContext && fromContext.length > 0) {
    return normalizeGoalsSelection(fromContext);
  }
  return normalizeGoalsSelection(data.demand?.goal ?? data.context.goal);
}

const BAND_LABEL: Record<"strong" | "medium" | "weak", string> = {
  strong: "强相关",
  medium: "较相关",
  weak: "弱相关",
};

const BAND_COLOR: Record<"strong" | "medium" | "weak", string> = {
  strong: "text-[#0D9488]",
  medium: "text-[#2563EB]",
  weak: "text-[#9CA3AF]",
};

function MatchPercent({ item }: { item: TopicBook }) {
  if (item.match_score == null) return null;
  const band = item.relevance_band ?? "weak";
  return (
    <span
      className={cn("text-[12px] font-semibold", BAND_COLOR[band])}
      title={BAND_LABEL[band]}
    >
      匹配度 {item.match_score}%
      <span className="ml-1 font-medium opacity-80">{BAND_LABEL[band]}</span>
    </span>
  );
}

/** 前 3 本用 LLM/模板推荐理由；其余用简介预览 */
const EXPLAIN_TOP_N = 3;

function bookSummaryText(item: TopicBook): string {
  const summary = item.book?.display_summary?.trim();
  if (summary) return summary;
  const desc = item.book?.description?.trim();
  if (desc) return desc;
  return "";
}

function bookHref(item: TopicBook) {
  const id = item.book?.id ?? item.book_id;
  return bookDetailHref(id, { from: "recommend" });
}

function FeaturedCard({
  item,
  index,
  blurbMode = "auto",
  topicId,
  saveAsTopicPrefill,
  onTopicCreated,
}: {
  item: TopicBook;
  index: number;
  /** auto：grid 前三推荐理由，其余简介；reason / summary 可强制 */
  blurbMode?: "auto" | "reason" | "summary";
  topicId?: string | null;
  saveAsTopicPrefill?: CreateTopicPrefill | null;
  onTopicCreated?: (topicId: string) => void;
}) {
  const book = item.book;
  const title = book?.title ?? "未知书名";
  const href = bookHref(item);
  const tags =
    item.matched_tags.length > 0
      ? item.matched_tags
      : (book?.tags ?? []).slice(0, 3);
  const useReason =
    blurbMode === "reason" || (blurbMode === "auto" && index < EXPLAIN_TOP_N);
  const blurb = useReason
    ? (item.match_reason?.trim() ?? "")
    : bookSummaryText(item);
  const blurbLabel = useReason ? "为什么推荐" : "简介";

  return (
    <article className="flex flex-col rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-[0_1px_2px_rgba(31,41,55,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="rounded-md bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-semibold text-[#4F5DFF]">
          推荐 {index + 1}
        </span>
        <MatchPercent item={item} />
      </div>

      <Link href={href}>
        <BookCover
          title={title}
          coverUrl={book?.cover_url}
          color={book?.cover_color}
          className="mx-auto w-[7.5rem] text-[11px] sm:w-32"
        />
      </Link>

      <div className="mt-3 min-w-0 space-y-2">
        <div>
          <Link href={href}>
            <h3 className="line-clamp-2 text-[15px] font-bold text-[#111827] hover:text-[#4F5DFF]">
              {title}
            </h3>
          </Link>
          <p className="mt-0.5 text-[12px] text-[#8B95A8]">{book?.author}</p>
          {book?.rating != null ? (
            <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-[#F59E0B]">
              <Star className="size-3 fill-current" />
              {book.rating.toFixed(1)}
            </p>
          ) : null}
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-[#F3F5F9] px-1.5 py-0.5 text-[10px] text-[#5F6B7C]"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {blurb ? (
          <div className="rounded-xl bg-[#F7F9FC] p-2.5">
            <p className="text-[11px] font-semibold text-[#4F5DFF]">
              {blurbLabel}
            </p>
            <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-[#4B5568]">
              {blurb}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <BookmarkButton
          bookId={book?.id ?? item.book_id}
          bookTitle={title}
          topicId={topicId}
          saveAsTopicPrefill={saveAsTopicPrefill}
          onTopicCreated={onTopicCreated}
          className="inline-flex size-9 items-center justify-center rounded-xl border border-[#E6EAF2]"
        />
        <Link
          href={href}
          className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-[#C9D4FF] text-[13px] font-semibold text-[#4F5DFF] transition-colors hover:bg-[#F5F7FF]"
        >
          查看详情
        </Link>
      </div>
    </article>
  );
}

function AltRow({
  item,
  topicId,
  saveAsTopicPrefill,
  onTopicCreated,
}: {
  item: TopicBook;
  topicId?: string | null;
  saveAsTopicPrefill?: CreateTopicPrefill | null;
  onTopicCreated?: (topicId: string) => void;
}) {
  const book = item.book;
  const title = book?.title ?? "未知书名";
  const href = bookHref(item);
  const bookId = book?.id ?? item.book_id;
  const summary = bookSummaryText(item);

  return (
    <div className="flex gap-2.5 rounded-xl border border-[#E6EAF2] bg-[#FAFBFD] p-2.5 transition-colors hover:border-[#C9D4FF]">
      <Link href={href} className="flex min-w-0 flex-1 gap-2.5">
        <BookCover
          title={title}
          coverUrl={book?.cover_url}
          color={book?.cover_color}
          className="w-11 text-[8px]"
        />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-[13px] font-semibold text-[#1F2937]">
            {title}
          </h4>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#8B95A8]">
            {book?.rating != null ? (
              <span className="inline-flex items-center gap-0.5 text-[#F59E0B]">
                <Star className="size-2.5 fill-current" />
                {book.rating.toFixed(1)}
              </span>
            ) : null}
            {item.matched_tags.slice(0, 2).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          {summary ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#6B7280]">
              {summary}
            </p>
          ) : null}
        </div>
      </Link>
      {bookId ? (
        <BookmarkButton
          bookId={bookId}
          bookTitle={title}
          topicId={topicId}
          saveAsTopicPrefill={saveAsTopicPrefill}
          onTopicCreated={onTopicCreated}
          className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#E6EAF2] bg-white"
          iconClassName="size-3.5"
        />
      ) : null}
    </div>
  );
}

function ListCard({
  item,
  index,
  topicId,
  saveAsTopicPrefill,
  onTopicCreated,
}: {
  item: TopicBook;
  index: number;
  topicId?: string | null;
  saveAsTopicPrefill?: CreateTopicPrefill | null;
  onTopicCreated?: (topicId: string) => void;
}) {
  const book = item.book;
  const title = book?.title ?? "未知书名";
  const href = bookHref(item);
  const bookId = book?.id ?? item.book_id;
  // 列表视图一律简介；推荐理由仅 grid 前三
  const blurb = bookSummaryText(item);

  return (
    <article className="flex gap-4 rounded-2xl border border-[#E6EAF2] bg-white p-4 transition-colors hover:border-[#C9D4FF]">
      <Link href={href} className="shrink-0">
        <BookCover
          title={title}
          coverUrl={book?.cover_url}
          color={book?.cover_color}
          className="w-16 text-[9px] sm:w-[4.5rem]"
        />
      </Link>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Link href={href} className="min-w-0">
            <p className="text-[11px] font-semibold text-[#4F5DFF]">
              推荐 {index + 1}
            </p>
            <h3 className="text-[16px] font-bold text-[#111827] hover:text-[#4F5DFF]">
              {title}
            </h3>
            <p className="text-[13px] text-[#8B95A8]">{book?.author}</p>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <MatchPercent item={item} />
            {bookId ? (
              <BookmarkButton
                bookId={bookId}
                bookTitle={title}
                topicId={topicId}
                saveAsTopicPrefill={saveAsTopicPrefill}
                onTopicCreated={onTopicCreated}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-[#E6EAF2]"
                iconClassName="size-3.5"
              />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {item.matched_tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-[#F3F5F9] px-1.5 py-0.5 text-[10px] text-[#5F6B7C]"
            >
              {tag}
            </span>
          ))}
        </div>
        {blurb ? (
          <p className="text-[13px] leading-relaxed text-[#4B5568]">
            <span className="font-semibold text-[#374151]">简介：</span>
            {blurb}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function sessionBucketFromContext(data: RecommendResponse) {
  if (data.context.session_bucket) return data.context.session_bucket;
  const m = data.context.session_minutes;
  if (m == null) return "";
  if (m <= 15) return "15";
  if (m <= 30) return "30";
  if (m <= 60) return "60";
  return "90";
}

function demandTextFromResult(data: RecommendResponse) {
  const turns = ensureContextTurns(data.context);
  const joined = turns
    .map((t) => t.text.trim())
    .filter(Boolean)
    .join("\n");
  return joined || data.context.raw_prompt?.trim() || "";
}

export function RecommendPageClient() {
  const { openNewSearch } = useNewSearchOptional();
  const router = useRouter();
  const searchParams = useSearchParams();
  const abortRef = useRef<AbortController | null>(null);
  /** 首次搜索主题快照（UI 偏离提示）；不随重新推荐覆盖 */
  const initialTopicsRef = useRef<string[] | null>(null);
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedTopicId, setSavedTopicId] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const {
    percent: rerunPercent,
    label: rerunLabel,
    overlayOpen: rerunOverlayOpen,
    finish: finishRerunProgress,
    dismiss: dismissRerunProgress,
  } = useEstimatedRecommendProgress(rerunning);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showAllAlts, setShowAllAlts] = useState(false);
  const [listVisible, setListVisible] = useState(8);
  const [demandText, setDemandText] = useState("");
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>([]);
  const [selectedDepth, setSelectedDepth] = useState<ReadingDepth | "">("");
  const [selectedSession, setSelectedSession] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [newSearchOpen, setNewSearchOpen] = useState(false);
  const [demandExpanded, setDemandExpanded] = useState(false);
  const [saveTopicOpen, setSaveTopicOpen] = useState(false);

  const syncFromResult = (data: RecommendResponse) => {
    setDemandText(demandTextFromResult(data));
    setSelectedThemes(clampThemes(data.context.themes ?? []));
    setSelectedKeywords(
      clampKeywords(data.demand?.keywords ?? data.context.keywords ?? []),
    );
    setSelectedPreferences(clampPreferences(data.context.preferences ?? []));
    setSelectedGoals(goalsFromRecommend(data));
    setSelectedDepth(data.context.depth ?? "");
    const bucket = sessionBucketFromContext(data);
    setSelectedSession(bucket === "30" || bucket === "60" ? bucket : "");
  };

  useEffect(() => {
    const topicFromQuery = searchParams.get("topic");
    void (async () => {
      // 首页 / 新搜索已写入缓存；此处只读缓存，避免重复打 /api/recommend。
      // searchParams（含 ?v=）变化时重读，以便同页「开启新搜索」后立刻换结果。
      const data = await getLastRecommend();
      if (!data) {
        setSavedTopicId(topicFromQuery);
        setResult(null);
        initialTopicsRef.current = null;
        setLoading(false);
        return;
      }
      initialTopicsRef.current = clampThemes(
        data.context.initialTopics?.length
          ? data.context.initialTopics
          : (data.context.themes ?? []),
      );
      setResult(data);
      syncFromResult(data);
      setSavedTopicId(data.context.topic_id ?? topicFromQuery);
      setShowAllAlts(false);
      setAdjustOpen(false);
      setDemandExpanded(false);
      setLoading(false);
    })();
  }, [searchParams]);

  useEffect(() => {
    const onDisliked = (event: Event) => {
      const bookId = (event as CustomEvent<{ bookId: string }>).detail?.bookId;
      if (!bookId) return;
      setResult((prev) => {
        if (!prev) return prev;
        const books = prev.books.filter(
          (b) => b.book_id !== bookId && b.book?.id !== bookId,
        );
        if (books.length === prev.books.length) return prev;
        return {
          ...prev,
          books: books.map((b, i) => ({ ...b, rank: i + 1 })),
          total_count: books.length,
        };
      });
    };
    window.addEventListener(DISLIKED_CHANGED, onDisliked);
    return () => window.removeEventListener(DISLIKED_CHANGED, onDisliked);
  }, []);

  const featured = useMemo(() => result?.books.slice(0, 3) ?? [], [result]);
  const alternatives = useMemo(() => result?.books.slice(3) ?? [], [result]);
  const totalCount = result?.total_count ?? result?.books.length ?? 0;

  const bookmarkTopicId =
    savedTopicId ?? result?.context.topic_id ?? null;

  const bindCreatedTopic = (id: string) => {
    setSavedTopicId(id);
    setResult((prev) =>
      prev
        ? {
            ...prev,
            context: { ...prev.context, topic_id: id },
          }
        : prev,
    );
  };

  const tagsDirty = useMemo(() => {
    if (!result) return false;
    const ot = clampThemes(result.context.themes ?? []).sort();
    const ok = clampKeywords(
      result.demand?.keywords ?? result.context.keywords ?? [],
    ).sort();
    const op = clampPreferences(result.context.preferences ?? []).sort();
    const og = goalsFromRecommend(result);
    return (
      JSON.stringify(ot) !== JSON.stringify([...selectedThemes].sort()) ||
      JSON.stringify(ok) !== JSON.stringify([...selectedKeywords].sort()) ||
      JSON.stringify(op) !== JSON.stringify([...selectedPreferences].sort()) ||
      JSON.stringify(og) !== JSON.stringify([...selectedGoals].sort())
    );
  }, [
    result,
    selectedThemes,
    selectedKeywords,
    selectedPreferences,
    selectedGoals,
  ]);

  const constraintsDirty = useMemo(() => {
    if (!result) return false;
    const origDepth = result.context.depth ?? "";
    const bucket = sessionBucketFromContext(result);
    const origSession = bucket === "30" || bucket === "60" ? bucket : "";
    return selectedDepth !== origDepth || selectedSession !== origSession;
  }, [result, selectedDepth, selectedSession]);

  const conditionsDirty = tagsDirty || constraintsDirty;
  const canApply = conditionsDirty;

  const topicDriftHint = useMemo(() => {
    const initial =
      initialTopicsRef.current ??
      clampThemes(result?.context.initialTopics ?? []);
    if (
      shouldWarnTopicDrift(initial, selectedThemes)
    ) {
      return TOPIC_DRIFT_HINT;
    }
    return null;
  }, [result, selectedThemes]);

  const discardConditions = () => {
    if (!result) return;
    setSelectedThemes(clampThemes(result.context.themes ?? []));
    setSelectedKeywords(
      clampKeywords(result.demand?.keywords ?? result.context.keywords ?? []),
    );
    setSelectedPreferences(clampPreferences(result.context.preferences ?? []));
    setSelectedGoals(goalsFromRecommend(result));
    setSelectedDepth(result.context.depth ?? "");
    const bucket = sessionBucketFromContext(result);
    setSelectedSession(bucket === "30" || bucket === "60" ? bucket : "");
    setAdjustOpen(false);
  };

  const toggleTheme = (tag: string) => {
    setSelectedThemes((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= MAX_THEMES) return prev;
      return [...prev, tag];
    });
  };

  const addKeyword = (tag: string) => {
    const t = tag.trim();
    if (!t) return;
    setSelectedKeywords((prev) => {
      if (prev.includes(t) || selectedThemes.includes(t)) return prev;
      if (prev.length >= MAX_KEYWORDS) return prev;
      return [...prev, t];
    });
  };

  const removeKeyword = (tag: string) => {
    setSelectedKeywords((prev) => prev.filter((t) => t !== tag));
  };

  const toggleGoal = (tag: string) => {
    setSelectedGoals((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= MAX_GOALS) return prev;
      return [...prev, tag];
    });
  };

  const togglePreference = (tag: string) => {
    setSelectedPreferences((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      let next = [...prev];
      if (tag === "少理论") next = next.filter((t) => t !== "理论优先");
      if (tag === "理论优先") next = next.filter((t) => t !== "少理论");
      if (next.length >= MAX_PREFERENCES) return prev;
      return [...next, tag];
    });
  };

  const saveTopicPrefill = useMemo((): CreateTopicPrefill | null => {
    if (!result) return null;
    const text = demandText.trim() || demandTextFromResult(result);
    const prefChips = [
      ...selectedPreferences,
      ...(selectedDepth === "light" ? ["轻理论", "快速入门"] : []),
      ...(selectedDepth === "medium" ? ["系统学习"] : []),
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    return {
      title: result.context.goal ?? "",
      description: text,
      timeHorizon: result.context.time_horizon ?? undefined,
      preferences: prefChips.slice(0, 4),
      context: {
        ...result.context,
        raw_prompt: text,
        themes: selectedThemes,
        keywords: selectedKeywords,
        preferences: selectedPreferences,
        goal: selectedGoals[0] ?? "",
        goals: selectedGoals,
        depth: selectedDepth || undefined,
        session_bucket: selectedSession || null,
      },
      books: result.books,
    };
  }, [
    result,
    demandText,
    selectedThemes,
    selectedKeywords,
    selectedPreferences,
    selectedGoals,
    selectedDepth,
    selectedSession,
  ]);

  const openSaveTopic = () => {
    if (!result || savedTopicId) return;
    setSaveTopicOpen(true);
  };

  const onSavedTopicClick = () => {
    if (savedTopicId) {
      router.push(`/topics/${savedTopicId}`);
      return;
    }
    openSaveTopic();
  };

  const rerun = async () => {
    if (!result || rerunning || !canApply) return;
    const text = demandText.trim();
    if (!text && selectedThemes.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRerunning(true);
    try {
      const topicId = savedTopicId ?? result.context.topic_id ?? undefined;
      const data = await recommend(
        {
          prompt: text || selectedThemes.join("、"),
          themes: selectedThemes,
          keywords: selectedKeywords,
          preferences: selectedPreferences,
          goals: selectedGoals,
          goal: selectedGoals[0] || undefined,
          depth: selectedDepth || null,
          session_bucket: selectedSession || null,
          topic_id: topicId,
          initial_topics:
            initialTopicsRef.current ??
            result.context.initialTopics ??
            [],
        },
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return;

      const snapshot =
        initialTopicsRef.current ??
        clampThemes(result.context.initialTopics ?? []);
      if (!initialTopicsRef.current) {
        initialTopicsRef.current = snapshot;
      }
      const dataWithSnapshot: RecommendResponse = {
        ...data,
        context: {
          ...data.context,
          initialTopics: snapshot.length
            ? snapshot
            : data.context.initialTopics,
        },
      };

      if (topicId) {
        const existing = await getTopic(topicId);
        await updateTopic(topicId, {
          context_text: text || selectedThemes.join("、"),
          context: {
            ...dataWithSnapshot.context,
            goal: existing?.title ?? dataWithSnapshot.context.goal,
            topic_id: topicId,
          },
          title: existing?.title,
        });
        await syncTopicRecommendations(topicId, dataWithSnapshot.books);
      }

      setResult(dataWithSnapshot);
      syncFromResult(dataWithSnapshot);
      setShowAllAlts(false);
      setAdjustOpen(false);
      setDemandExpanded(false);
      await finishRerunProgress();
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) {
        dismissRerunProgress();
        return;
      }
      console.error("[recommend] rerun failed:", err);
      dismissRerunProgress();
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRerunning(false);
    }
  };

  const cancelRerun = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    dismissRerunProgress();
    setRerunning(false);
  };

  const confirmNewSearch = () => {
    setNewSearchOpen(false);
    openNewSearch();
  };

  return (
    <div className="min-h-dvh bg-[#F4F6FA]">
      <SiteHeader />
      <RecommendLoadingOverlay
        open={rerunOverlayOpen}
        percent={rerunPercent}
        label={rerunLabel}
        onCancel={cancelRerun}
        hint="正在按当前条件重新推荐。取消后保留上一版结果。"
      />
      <CreateTopicModal
        open={saveTopicOpen}
        onClose={() => setSaveTopicOpen(false)}
        prefill={saveTopicPrefill}
        onSaved={bindCreatedTopic}
      />
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[#111827]">
            推荐结果
          </h1>
          <p className="mt-1 text-[14px] text-[#8B95A8]">
            基于你的需求，我们为你精选了以下书籍
          </p>
        </div>

        {savedTopicId ? (
          <p className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">
            已保存为专题。
            <Link href={`/topics/${savedTopicId}`} className="ml-1 underline">
              查看专题
            </Link>
          </p>
        ) : null}

        {result &&
        !loading &&
        result.books.length > 0 &&
        result.ui_tip === "refinement" ? (
          <p className="rounded-xl border border-[#DCE3F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#475569]">
            {REFINEMENT_TIP.message}
          </p>
        ) : null}

        {result &&
        !loading &&
        result.books.length > 0 &&
        (result.ui_tip === "coverage_gap" ||
          (result.ui_tip == null && result.show_coverage_tip)) ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {COVERAGE_TIP.message}
          </p>
        ) : null}

        {result && !loading && result.books.length === 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {COVERAGE_TIP.message}
          </p>
        ) : null}

        {loading ? (
          <div
            className="rounded-2xl border border-[#E8ECF4] bg-white px-6 py-16"
            role="status"
            aria-live="polite"
          >
            <div className="mx-auto flex max-w-sm flex-col items-center gap-4 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-[#EEF2FF]">
                <Loader2 className="size-5 animate-spin text-[#4F5DFF]" />
              </span>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-[#1F2937]">
                  正在加载推荐结果…
                </p>
                <p className="text-[13px] text-[#8B95A8]">马上就好，请稍候</p>
              </div>
              <div className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-[#EEF2FF]">
                <div className="h-full w-1/3 rounded-full bg-[#4F5DFF] motion-safe:animate-[recommend-progress_2.8s_ease-in-out_infinite]" />
              </div>
            </div>
          </div>
        ) : !result ? (
          <div className="rounded-2xl border border-dashed border-[#DCE3F0] bg-white px-6 py-16 text-center">
            <p className="text-sm text-[#8B95A8]">
              还没有推荐结果。请先在首页输入需求。
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex h-9 items-center justify-center rounded-xl bg-[#4F5DFF] px-4 text-sm font-semibold text-white"
            >
              去首页提问
            </Link>
          </div>
        ) : (
          <>
            <DemandEditorBar
              demandText={demandText}
              demandExpanded={demandExpanded}
              onToggleDemandExpanded={() => setDemandExpanded((v) => !v)}
              selectedThemes={selectedThemes}
              selectedKeywords={selectedKeywords}
              selectedGoals={selectedGoals}
              selectedPreferences={selectedPreferences}
              selectedDepth={selectedDepth}
              selectedSession={selectedSession}
              onToggleTheme={toggleTheme}
              onAddKeyword={addKeyword}
              onRemoveKeyword={removeKeyword}
              onToggleGoal={toggleGoal}
              onTogglePreference={togglePreference}
              onDepthChange={setSelectedDepth}
              onSessionChange={setSelectedSession}
              conditionsDirty={conditionsDirty}
              onDiscardConditions={discardConditions}
              adjustOpen={adjustOpen}
              onAdjustOpenChange={setAdjustOpen}
              topicDriftHint={topicDriftHint}
              totalCount={totalCount}
              disabled={rerunning}
              actions={
                <>
                  <button
                    type="button"
                    onClick={onSavedTopicClick}
                    disabled={rerunning}
                    className={cn(
                      "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors",
                      savedTopicId
                        ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857] hover:border-[#6EE7B7]"
                        : "border-[#DCE3F0] bg-white text-[#374151] hover:border-[#C9D4FF] hover:text-[#4F5DFF]",
                      rerunning && "pointer-events-none opacity-60",
                    )}
                  >
                    <FolderPlus
                      className={cn(
                        "size-3.5",
                        savedTopicId ? "text-[#047857]" : "text-[#4F5DFF]",
                      )}
                    />
                    {savedTopicId ? "已保存 · 查看专题" : "保存为专题"}
                  </button>
                  <button
                    type="button"
                    disabled={rerunning || !canApply}
                    onClick={() => void rerun()}
                    title={
                      canApply
                        ? "按当前需求与条件重新推荐"
                        : "内容未变化，无需重新推荐"
                    }
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#4F5DFF] px-2.5 text-[12px] font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:bg-[#C5CAD6]"
                  >
                    {rerunning ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    重新推荐
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSearchOpen(true)}
                    disabled={rerunning}
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#DCE3F0] bg-white px-2.5 text-[12px] font-semibold text-[#374151] hover:border-[#C9D4FF] hover:text-[#4F5DFF] disabled:opacity-60"
                  >
                    <Search className="size-3.5 text-[#4F5DFF]" />
                    开启新搜索
                  </button>
                </>
              }
            />

            {/* 提示 / 视图 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] text-[#8B95A8]">
                {canApply
                  ? "有未应用改动；可在「调整条件」中撤销，或点「重新推荐」"
                  : "可通过「调整条件」改标签；改整段需求请「开启新搜索」"}
              </p>
              <div className="inline-flex rounded-lg border border-[#E6EAF2] bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-md",
                    viewMode === "grid"
                      ? "bg-[#4F5DFF] text-white"
                      : "text-[#8B95A8]",
                  )}
                  aria-label="网格视图"
                >
                  <LayoutGrid className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-md",
                    viewMode === "list"
                      ? "bg-[#4F5DFF] text-white"
                      : "text-[#8B95A8]",
                  )}
                  aria-label="列表视图"
                >
                  <List className="size-3.5" />
                </button>
              </div>
            </div>

            {/* 主内容 */}
            {result.books.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#DCE3F0] bg-white px-6 py-16 text-center">
                <p className="text-sm font-medium text-[#374151]">
                  没有足够自信的相关结果
                </p>
                <p className="mt-2 text-[13px] text-[#8B95A8]">
                  可补充正式题材或更具体的关键词后点「重新推荐」，或「开启新搜索」。
                </p>
              </div>
            ) : viewMode === "list" ? (
              <div className="space-y-3">
                {result.books.slice(0, listVisible).map((item, index) => (
                  <ListCard
                    key={item.id}
                    item={item}
                    index={index}
                    topicId={bookmarkTopicId}
                    saveAsTopicPrefill={saveTopicPrefill}
                    onTopicCreated={bindCreatedTopic}
                  />
                ))}
                <div className="flex flex-col items-center gap-2 py-4">
                  <p className="text-[12px] text-[#8B95A8]">
                    已显示 {Math.min(listVisible, result.books.length)} /{" "}
                    {result.books.length}
                  </p>
                  {listVisible < result.books.length ? (
                    <button
                      type="button"
                      onClick={() =>
                        setListVisible((n) =>
                          Math.min(n + 8, result.books.length),
                        )
                      }
                      className="rounded-full border border-[#E6EAF2] bg-white px-4 py-2 text-[13px] font-medium text-[#111827] hover:border-[#4F5DFF]/40"
                    >
                      加载更多
                    </button>
                  ) : (
                    <p className="text-[12px] text-[#9AA3B5]">
                      已到本次结果末尾（MVP 暂不继续拉取新书）
                    </p>
                  )}
                </div>
              </div>
            ) : showAllAlts ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] text-[#8B95A8]">
                    推荐与全部备选 · 共 {result.books.length} 本
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAllAlts(false)}
                    className="text-[12px] font-semibold text-[#4F5DFF] hover:underline"
                  >
                    收起备选
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {result.books.map((item, index) => (
                    <FeaturedCard
                      key={item.id}
                      item={item}
                      index={index}
                      topicId={bookmarkTopicId}
                      saveAsTopicPrefill={saveTopicPrefill}
                      onTopicCreated={bindCreatedTopic}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {featured.map((item, index) => (
                    <FeaturedCard
                      key={item.id}
                      item={item}
                      index={index}
                      topicId={bookmarkTopicId}
                      saveAsTopicPrefill={saveTopicPrefill}
                      onTopicCreated={bindCreatedTopic}
                    />
                  ))}
                </div>

                <aside className="flex min-h-0 flex-col rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-[0_1px_2px_rgba(31,41,55,0.04)]">
                  <h2 className="text-[14px] font-bold text-[#111827]">
                    更多优质备选
                  </h2>
                  <div className="mt-3 flex flex-1 flex-col gap-2.5">
                    {alternatives.slice(0, 4).map((item) => (
                      <AltRow
                        key={item.id}
                        item={item}
                        topicId={bookmarkTopicId}
                        saveAsTopicPrefill={saveTopicPrefill}
                        onTopicCreated={bindCreatedTopic}
                      />
                    ))}
                    {alternatives.length === 0 ? (
                      <p className="py-8 text-center text-[12px] text-[#8B95A8]">
                        暂无更多备选
                      </p>
                    ) : null}
                  </div>
                  {alternatives.length > 4 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllAlts(true)}
                      className="mt-3 text-left text-[12px] font-semibold text-[#4F5DFF] hover:underline"
                    >
                      {`查看全部 ${Math.max(totalCount - 3, alternatives.length)} 本 >`}
                    </button>
                  ) : totalCount > featured.length ? (
                    <p className="mt-3 text-[12px] text-[#9AA3B5]">
                      共找到 {totalCount} 本相关书籍
                    </p>
                  ) : null}
                </aside>
              </div>
            )}
          </>
        )}
      </div>

      {newSearchOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-search-title"
          onClick={() => setNewSearchOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[#E6EAF2] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="new-search-title"
              className="text-[16px] font-bold text-[#111827]"
            >
              开启新搜索？
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#6B7280]">
              {savedTopicId
                ? "将开始一次全新提问。本次结果已保存为专题。"
                : "当前会话不会保留。若还想以后查看，请先「存专题」，再开启新搜索。"}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {!savedTopicId ? (
                <button
                  type="button"
                  disabled={!result}
                  onClick={() => {
                    setNewSearchOpen(false);
                    openSaveTopic();
                  }}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#C9D4FF] bg-[#F8F9FF] text-[13px] font-semibold text-[#4F5DFF] hover:bg-[#EEF2FF] disabled:opacity-60"
                >
                  <FolderPlus className="size-3.5" />
                  先保存为专题
                </button>
              ) : null}
              <button
                type="button"
                onClick={confirmNewSearch}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4F5DFF] text-[13px] font-semibold text-white hover:opacity-95"
              >
                <Search className="size-3.5" />
                {savedTopicId ? "开始新搜索" : "不保存，直接新搜索"}
              </button>
              <button
                type="button"
                onClick={() => setNewSearchOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl text-[13px] font-semibold text-[#6B7280] hover:bg-[#F3F5F9]"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
