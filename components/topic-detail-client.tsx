"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookMarked,
  FolderOpen,
  GitBranch,
  Loader2,
  PencilLine,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { BookmarkButton } from "@/components/bookmark-button";
import { BookCover } from "@/components/book-cover";
import { NewSearchButton } from "@/components/new-search-provider";
import {
  isAbortError,
  RecommendLoadingOverlay,
  useEstimatedRecommendProgress,
} from "@/components/recommend-loading-overlay";
import { SiteHeader } from "@/components/site-header";
import { bookDetailHref } from "@/lib/book-links";
import {
  clampKeywords,
  clampPreferences,
  clampThemes,
  deleteTopic,
  DEPTH_OPTIONS,
  ensureContextTurns,
  FILTER_SECTION_LABELS,
  getTopic,
  MAX_KEYWORDS,
  MAX_PREFERENCES,
  MAX_THEMES,
  PREFERENCE_OPTIONS,
  recommend,
  SESSION_OPTIONS,
  sessionOptionLabel,
  syncTopicRecommendations,
  THEME_OPTIONS,
  updateTopic,
} from "@/lib/data";
import { emitTopicsChanged } from "@/lib/data-events";
import {
  shouldWarnTopicDrift,
  TOPIC_DRIFT_HINT,
} from "@/lib/data/recommend/topic-drift";
import { TOPIC_ICONS } from "@/lib/topic-icons";
import type { ReadingDepth, Topic, TopicBook } from "@/lib/types";
import { cn } from "@/lib/utils";

type SectionId = "overview" | "bookmarked" | "recommend" | "related";

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

function BookmarkedCard({
  item,
  topicId,
  onBookmarkChange,
}: {
  item: TopicBook;
  topicId: string;
  onBookmarkChange?: () => void;
}) {
  const router = useRouter();
  const book = item.book;
  const title = book?.title ?? "未知书名";
  const bookId = item.book_id || book?.id;
  const href = bookId
    ? bookDetailHref(bookId, { from: "topics", topic: topicId })
    : null;
  const tags = (book?.tags ?? []).slice(0, 3);

  return (
    <div className="relative flex w-full flex-col gap-2 rounded-xl border border-[#E6EAF2] bg-white p-2.5 transition-colors hover:border-[#C9D4FF]">
      <button
        type="button"
        disabled={!href}
        onClick={() => {
          if (href) router.push(href);
        }}
        className="flex w-full flex-col gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <BookCover
          title={title}
          coverUrl={book?.cover_url}
          color={book?.cover_color}
          className="w-full rounded-lg text-[9px] shadow-sm"
          titleChars={6}
        />
        <div className="min-w-0 space-y-1 px-0.5 pr-8">
          <h4 className="line-clamp-2 text-[13px] leading-snug font-semibold text-[#1F2937]">
            {title}
          </h4>
          <p className="truncate text-[11px] text-[#8B95A8]">{book?.author}</p>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-[#F3F5F9] px-1.5 py-0.5 text-[10px] text-[#5F6B7C]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </button>
      {bookId ? (
        <BookmarkButton
          bookId={bookId}
          bookTitle={title}
          topicId={topicId}
          onSaved={onBookmarkChange}
          className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-lg border border-[#E6EAF2] bg-white shadow-sm"
          iconClassName="size-3.5"
        />
      ) : null}
    </div>
  );
}

function RecommendRow({
  item,
  topicId,
  onBookmarkChange,
}: {
  item: TopicBook;
  topicId: string;
  onBookmarkChange?: () => void;
}) {
  const router = useRouter();
  const book = item.book;
  const title = book?.title ?? "未知书名";
  const tags =
    item.matched_tags.length > 0
      ? item.matched_tags
      : (book?.tags ?? []).slice(0, 3);
  const bookId = item.book_id || book?.id;
  const href = bookId
    ? bookDetailHref(bookId, { from: "topics", topic: topicId })
    : null;

  return (
    <div className="flex w-full gap-3 rounded-xl border border-[#E6EAF2] bg-[#FAFBFD] p-3 transition-colors hover:border-[#C9D4FF]">
      <button
        type="button"
        disabled={!href}
        onClick={() => {
          if (href) router.push(href);
        }}
        className="flex min-w-0 flex-1 gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <BookCover
          title={title}
          coverUrl={book?.cover_url}
          color={book?.cover_color}
          className="w-[3.25rem] rounded-lg text-[8px] shadow-sm sm:w-14"
          titleChars={6}
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="min-w-0">
            <h4 className="truncate text-[14px] font-semibold text-[#1F2937]">
              {title}
            </h4>
            <p className="truncate text-[12px] text-[#8B95A8]">
              {book?.author}
            </p>
          </div>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-white px-1.5 py-0.5 text-[10px] text-[#5F6B7C] ring-1 ring-[#E6EAF2]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {item.match_reason ? (
            <p className="line-clamp-2 text-[12px] leading-relaxed text-[#4B5568]">
              <span className="font-semibold text-[#374151]">为什么适合：</span>
              {item.match_reason}
            </p>
          ) : null}
        </div>
      </button>
      {bookId ? (
        <BookmarkButton
          bookId={bookId}
          bookTitle={title}
          topicId={topicId}
          onSaved={onBookmarkChange}
          className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#E6EAF2] bg-white"
          iconClassName="size-3.5"
        />
      ) : null}
    </div>
  );
}

function demandTextFromTopic(topic: Topic) {
  const turns = ensureContextTurns(topic.context);
  const joined = turns
    .map((t) => t.text.trim())
    .filter(Boolean)
    .join("\n");
  return joined || topic.context.raw_prompt?.trim() || topic.context_text || "";
}

function sessionBucketFromTopic(topic: Topic) {
  if (topic.context.session_bucket) return topic.context.session_bucket;
  const m = topic.context.session_minutes;
  if (m == null) return "";
  if (m <= 15) return "15";
  if (m <= 30) return "30";
  if (m <= 60) return "60";
  return "90";
}

export function TopicDetailClient({
  topic: initialTopic,
  items: initialItems,
  relatedTopics,
  onBookmarkChange,
}: {
  topic: Topic;
  items: TopicBook[];
  relatedTopics: Topic[];
  onBookmarkChange?: () => void;
}) {
  const router = useRouter();
  const recommendPanelRef = useRef<HTMLElement | null>(null);
  const shouldScrollToRecommend = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const [topic, setTopic] = useState(initialTopic);
  const [items, setItems] = useState(initialItems);
  const [section, setSection] = useState<SectionId>("overview");
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const {
    percent: regenPercent,
    label: regenLabel,
    overlayOpen: regenOverlayOpen,
    finish: finishRegenProgress,
    dismiss: dismissRegenProgress,
  } = useEstimatedRecommendProgress(saving);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeReady, setComposeReady] = useState(false);
  const [demandText, setDemandText] = useState(() =>
    demandTextFromTopic(initialTopic),
  );
  const [selectedThemes, setSelectedThemes] = useState(() =>
    clampThemes(initialTopic.context.themes ?? []),
  );
  const [selectedKeywords, setSelectedKeywords] = useState(() =>
    clampKeywords(initialTopic.context.keywords ?? []),
  );
  const [selectedPreferences, setSelectedPreferences] = useState(() =>
    clampPreferences(initialTopic.context.preferences ?? []),
  );
  const [selectedDepth, setSelectedDepth] = useState<ReadingDepth | "">(
    () => initialTopic.context.depth ?? "",
  );
  const [selectedSession, setSelectedSession] = useState(() => {
    const bucket = sessionBucketFromTopic(initialTopic);
    return bucket === "30" || bucket === "60" ? bucket : "";
  });
  const [keywordDraft, setKeywordDraft] = useState("");

  const syncEditorFromTopic = (t: Topic) => {
    setDemandText(demandTextFromTopic(t));
    setSelectedThemes(clampThemes(t.context.themes ?? []));
    setSelectedKeywords(clampKeywords(t.context.keywords ?? []));
    setSelectedPreferences(clampPreferences(t.context.preferences ?? []));
    setSelectedDepth(t.context.depth ?? "");
    const bucket = sessionBucketFromTopic(t);
    setSelectedSession(bucket === "30" || bucket === "60" ? bucket : "");
    setKeywordDraft("");
  };

  useEffect(() => {
    setTopic(initialTopic);
    setItems(initialItems);
    if (!composeOpen) syncEditorFromTopic(initialTopic);
  }, [initialTopic, initialItems, composeOpen]);

  useEffect(() => {
    if (!composeOpen) {
      setComposeReady(false);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => setComposeReady(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        syncEditorFromTopic(topic);
        setComposeOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [composeOpen, saving, topic]);

  useEffect(() => {
    if (section !== "recommend" || !shouldScrollToRecommend.current) return;
    shouldScrollToRecommend.current = false;
    const t = window.setTimeout(() => {
      recommendPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
    return () => window.clearTimeout(t);
  }, [section, items]);

  const Icon = TOPIC_ICONS[topic.icon ?? "loop"];

  const bookmarked = useMemo(
    () => items.filter((i) => i.user_status === "bookmarked"),
    [items],
  );
  const recommended = useMemo(
    () =>
      items.filter(
        (i) => i.user_status !== "bookmarked" && i.user_status !== "disliked",
      ),
    [items],
  );

  const bookmarkedCount = topic.bookmarked_count ?? bookmarked.length;
  const recommendCount = recommended.length;

  const tagsDirty = useMemo(() => {
    const ot = clampThemes(topic.context.themes ?? []).sort();
    const ok = clampKeywords(topic.context.keywords ?? []).sort();
    const op = clampPreferences(topic.context.preferences ?? []).sort();
    return (
      JSON.stringify(ot) !== JSON.stringify([...selectedThemes].sort()) ||
      JSON.stringify(ok) !== JSON.stringify([...selectedKeywords].sort()) ||
      JSON.stringify(op) !== JSON.stringify([...selectedPreferences].sort())
    );
  }, [topic, selectedThemes, selectedKeywords, selectedPreferences]);

  const constraintsDirty = useMemo(() => {
    const origDepth = topic.context.depth ?? "";
    const bucket = sessionBucketFromTopic(topic);
    const origSession = bucket === "30" || bucket === "60" ? bucket : "";
    return selectedDepth !== origDepth || selectedSession !== origSession;
  }, [topic, selectedDepth, selectedSession]);

  const canApply = tagsDirty || constraintsDirty;

  const topicDriftHint = useMemo(() => {
    const initial = clampThemes(
      topic.context.initialTopics?.length
        ? topic.context.initialTopics
        : (topic.context.themes ?? []),
    );
    return shouldWarnTopicDrift(initial, selectedThemes)
      ? TOPIC_DRIFT_HINT
      : null;
  }, [topic, selectedThemes]);

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

  const togglePreference = (tag: string) => {
    setSelectedPreferences((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= MAX_PREFERENCES) return prev;
      return [...prev, tag];
    });
  };

  const openCompose = () => {
    syncEditorFromTopic(topic);
    setComposeOpen(true);
  };

  const closeCompose = (discard = true) => {
    if (saving) return;
    if (discard) syncEditorFromTopic(topic);
    setComposeOpen(false);
  };

  const handleDelete = async () => {
    if (deleting) return;
    if (!window.confirm(`确定删除专题「${topic.title}」？删除后无法恢复。`)) {
      return;
    }
    setDeleting(true);
    try {
      await deleteTopic(topic.id);
      emitTopicsChanged();
      router.replace("/topics");
    } catch {
      setDeleting(false);
      window.alert("删除失败，请稍后重试");
    }
  };

  const regenerate = async () => {
    if (saving) return;
    const text = demandText.trim();
    if (!text && selectedThemes.length === 0) {
      window.alert("请先填写需求或选择主题");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 关掉编辑弹窗，改用可取消的推荐 loading
    setComposeOpen(false);
    setSaving(true);
    setJustUpdated(false);
    try {
      const prompt = text || selectedThemes.join("、");
      const data = await recommend(
        {
          prompt,
          themes: selectedThemes,
          keywords: selectedKeywords,
          preferences: selectedPreferences,
          depth: selectedDepth || null,
          session_bucket: selectedSession || null,
          topic_id: topic.id,
          initial_topics: clampThemes(
            topic.context.initialTopics?.length
              ? topic.context.initialTopics
              : (topic.context.themes ?? []),
          ),
        },
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return;

      const initialTopics = clampThemes(
        topic.context.initialTopics?.length
          ? topic.context.initialTopics
          : (topic.context.themes ?? []),
      );

      const updated = await updateTopic(topic.id, {
        context_text: prompt,
        context: {
          ...data.context,
          initialTopics,
          goal: topic.title,
          topic_id: topic.id,
        },
      });

      if (controller.signal.aborted) return;

      const nextItems = await syncTopicRecommendations(topic.id, data.books);
      if (controller.signal.aborted) return;

      const fresh = updated ?? (await getTopic(topic.id));
      if (fresh) {
        setTopic(fresh);
        syncEditorFromTopic(fresh);
      }
      setItems(nextItems);
      shouldScrollToRecommend.current = true;
      setSection("recommend");
      setJustUpdated(true);
      window.setTimeout(() => setJustUpdated(false), 2800);
      await finishRegenProgress();
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) {
        dismissRegenProgress();
        return;
      }
      dismissRegenProgress();
      window.alert("重新生成失败，请稍后重试");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSaving(false);
    }
  };

  const cancelRegenerate = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    dismissRegenProgress();
    setSaving(false);
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const navItems: {
    id: SectionId;
    label: string;
    icon: typeof FolderOpen;
    count?: number;
  }[] = [
    { id: "overview", label: "概览", icon: FolderOpen },
    {
      id: "bookmarked",
      label: "已收藏书籍",
      icon: BookMarked,
      count: bookmarkedCount,
    },
    {
      id: "recommend",
      label: "AI 新推荐",
      icon: Sparkles,
      count: recommendCount,
    },
    { id: "related", label: "相关专题", icon: GitBranch },
  ];

  const demandPreview = demandTextFromTopic(topic);
  const themeList = clampThemes(topic.context.themes ?? []);
  const preferenceList = clampPreferences(topic.context.preferences ?? []);
  const keywordList = clampKeywords(topic.context.keywords ?? []);
  const depthLabel =
    DEPTH_OPTIONS.find((o) => o.value === topic.context.depth)?.label ?? null;
  const timeLabel = sessionLabel(topic);

  const headerCard = (
    <section className="shrink-0 rounded-2xl border border-[#E6EAF2] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(31,41,55,0.04)] sm:px-6 sm:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[#5B4DFF] sm:size-14">
            <Icon className="size-6 sm:size-7" />
          </span>
          <div className="min-w-0 pt-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="truncate text-[20px] font-bold tracking-tight text-[#111827] sm:text-[22px]">
                {topic.title}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-md bg-[#F3F5F9] px-2 py-0.5 text-[11px] font-medium text-[#6B7280]">
                <BookMarked className="size-3 text-[#5B6CFF]" />
                收藏 {bookmarkedCount}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-[#9AA3B5]">
              最近更新：
              {(topic.updated_label ?? "最近").replace(/^更新于\s*/, "")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCompose}
          disabled={saving}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-stretch rounded-xl bg-gradient-to-r from-[#7C6CFF] via-[#5B7CFF] to-[#2BB8A8] px-3.5 text-[12px] font-semibold text-white shadow-sm shadow-[#7C6CFF]/25 transition-opacity hover:opacity-95 disabled:opacity-50 sm:self-start"
        >
          <PencilLine className="size-3.5" />
          编辑并重新生成
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <div className="rounded-xl border border-[#EEF1F6] bg-[#F8FAFC] px-3 py-2">
          <p className="text-[11px] font-semibold text-[#8B95A8]">当前需求</p>
          <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[13px] leading-snug text-[#1F2937]">
            {demandPreview || "（暂无需求原文）"}
          </p>
        </div>

        {/* 主题 + 关键词一行 */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-[#EEF1F6] px-3 py-2">
            <p className="text-[11px] font-semibold text-[#8B95A8]">主题</p>
            {themeList.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {themeList.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-[#EEF2FF] px-1.5 py-0.5 text-[11px] font-medium text-[#4F5DFF]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[12px] text-[#C5CAD6]">未选择</p>
            )}
          </div>
          <div className="rounded-xl border border-[#EEF1F6] px-3 py-2">
            <p className="text-[11px] font-semibold text-[#8B95A8]">关键词</p>
            {keywordList.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {keywordList.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-[#F3F5F9] px-1.5 py-0.5 text-[11px] font-medium text-[#5F6B7C]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[12px] text-[#C5CAD6]">未选择</p>
            )}
          </div>
        </div>

        {/* 其余条件一行 3 列 */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-[#EEF1F6] px-3 py-2">
            <p className="text-[11px] font-semibold text-[#8B95A8]">内容偏好</p>
            {preferenceList.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {preferenceList.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-[#ECFDF5] px-1.5 py-0.5 text-[11px] font-medium text-[#0D9488]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[12px] text-[#C5CAD6]">未选择</p>
            )}
          </div>
          <div className="rounded-xl border border-[#EEF1F6] px-3 py-2">
            <p className="text-[11px] font-semibold text-[#8B95A8]">阅读投入</p>
            <p className="mt-1.5 text-[13px] font-medium text-[#1F2937]">
              {depthLabel ?? "不限"}
            </p>
          </div>
          <div className="rounded-xl border border-[#EEF1F6] px-3 py-2">
            <p className="text-[11px] font-semibold text-[#8B95A8]">可用时间</p>
            <p className="mt-1.5 text-[13px] font-medium text-[#1F2937]">
              {timeLabel}
            </p>
          </div>
        </div>
      </div>
    </section>
  );

  const sidebar = (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-5">
      <Link
        href="/topics"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6B7280] transition-colors hover:text-[#5B6CFF]"
      >
        <ArrowLeft className="size-4" />
        返回我的专题
      </Link>

      <div className="flex items-center gap-3 rounded-2xl border border-[#DCE8FF] bg-[#F3F7FF] p-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7C6CFF] to-[#5B8CFF] text-white shadow-sm shadow-[#7C6CFF]/25">
          <Icon className="size-5" />
        </span>
        <p className="line-clamp-2 text-[13px] font-semibold text-[#1F2937]">
          {topic.title}
        </p>
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const NavIcon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors",
                active
                  ? "bg-[#EEF2FF] font-semibold text-[#4F5DFF]"
                  : "font-medium text-[#6B7280] hover:bg-[#F5F7FB] hover:text-[#374151]",
              )}
            >
              <NavIcon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-[#4F5DFF]" : "text-[#9AA3B5]",
                )}
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.count != null ? (
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[11px] tabular-nums",
                    active
                      ? "bg-white text-[#4F5DFF]"
                      : "bg-[#F0F2F7] text-[#8B95A8]",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2">
        <div className="rounded-2xl border border-[#DCE8FF] bg-[#F3F7FF] p-3.5">
          <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#3B5BDB]">
            <Sparkles className="size-3.5" />
            专题说明
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#5B6B8C]">
            在概览卡点「编辑并重新生成」更新书单；已收藏书籍会保留。全新需求可直接开始新搜索。
          </p>
          <NewSearchButton className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[#4F5DFF] hover:underline">
            <Search className="size-3" />
            开启新搜索 →
          </NewSearchButton>
        </div>
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={deleting}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#F1D5D5] bg-white text-[12px] font-medium text-[#C45C5C] transition-colors hover:bg-[#FFF5F5] disabled:opacity-60"
        >
          <Trash2 className="size-3.5" />
          {deleting ? "删除中…" : "删除专题"}
        </button>
      </div>
    </div>
  );

  const composeOverlay = composeOpen ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6">
      <button
        type="button"
        aria-label="关闭"
        onClick={() => closeCompose(true)}
        className={cn(
          "absolute inset-0 bg-[#0F172A]/45 backdrop-blur-[3px] transition-opacity duration-200",
          composeReady ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-compose-title"
        className={cn(
          "relative z-10 flex max-h-[min(92dvh,44rem)] w-full max-w-2xl origin-center flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] transition-all duration-200 ease-out",
          composeReady
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-3 scale-[0.92] opacity-0",
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EEF1F6] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[#8B95A8]">
              专题 · {topic.title}
            </p>
            <h2
              id="topic-compose-title"
              className="mt-0.5 text-[20px] font-bold tracking-tight text-[#111827] sm:text-[22px]"
            >
              编辑并重新生成
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[#6B7280]">
              调整标签和阅读约束后点「重新生成」。已收藏书籍不受影响。
            </p>
          </div>
          <button
            type="button"
            onClick={() => closeCompose(true)}
            disabled={saving}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[#E6EAF2] text-[#6B7280] hover:bg-[#F5F7FB] disabled:opacity-50"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-[#111827]">
              当前需求
            </p>
            <p className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-[#EEF1F6] bg-[#F8FAFC] px-3.5 py-3 text-[14px] leading-relaxed text-[#4B5568] sm:text-[15px]">
              {demandText.trim() || "（暂无需求原文）"}
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-[#111827]">
                推荐条件
                {tagsDirty || constraintsDirty ? (
                  <span className="ml-1.5 text-[11px] font-medium text-amber-600">
                    已修改
                  </span>
                ) : null}
              </p>
              {tagsDirty || constraintsDirty ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setSelectedThemes(clampThemes(topic.context.themes ?? []));
                    setSelectedKeywords(
                      clampKeywords(topic.context.keywords ?? []),
                    );
                    setSelectedPreferences(
                      clampPreferences(topic.context.preferences ?? []),
                    );
                    setSelectedDepth(topic.context.depth ?? "");
                    const bucket = sessionBucketFromTopic(topic);
                    setSelectedSession(
                      bucket === "30" || bucket === "60" ? bucket : "",
                    );
                    setKeywordDraft("");
                  }}
                  className="text-[11px] font-semibold text-[#6B7280] hover:text-[#DC2626]"
                >
                  撤销条件
                </button>
              ) : null}
            </div>

            {topicDriftHint ? (
              <p
                className="mb-2 rounded-lg border border-amber-200/80 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800"
                role="status"
              >
                {topicDriftHint}
              </p>
            ) : null}

            <div className="space-y-3 rounded-2xl border border-[#E6EAF2] bg-[#FAFBFD] p-3 sm:p-3.5">
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-[#8B95A8]">
                  主题 ({selectedThemes.length}/{MAX_THEMES})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {THEME_OPTIONS.map((tag) => {
                    const on = selectedThemes.includes(tag);
                    const blocked = !on && selectedThemes.length >= MAX_THEMES;
                    return (
                      <button
                        key={tag}
                        type="button"
                        disabled={blocked || saving}
                        onClick={() => toggleTheme(tag)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                          on
                            ? "bg-[#4F5DFF] text-white"
                            : "bg-white text-[#5F6B7C] ring-1 ring-[#E6EAF2] hover:bg-[#EEF2FF]",
                          blocked && "cursor-not-allowed opacity-40",
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-medium text-[#8B95A8]">
                  关键词 ({selectedKeywords.length}/{MAX_KEYWORDS})
                </p>
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {selectedKeywords.length === 0 ? (
                    <span className="text-[12px] text-[#C5CAD6]">未选择</span>
                  ) : (
                    selectedKeywords.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        disabled={saving}
                        onClick={() => removeKeyword(tag)}
                        className="inline-flex items-center gap-0.5 rounded-md bg-[#F3F5F9] px-2 py-1 text-[12px] font-medium text-[#5F6B7C] hover:bg-[#E8ECF4]"
                        title="移除"
                      >
                        {tag}
                        <X className="size-3 opacity-70" />
                      </button>
                    ))
                  )}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={keywordDraft}
                    disabled={
                      saving || selectedKeywords.length >= MAX_KEYWORDS
                    }
                    onChange={(e) => setKeywordDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addKeyword(keywordDraft);
                        setKeywordDraft("");
                      }
                    }}
                    placeholder="输入后回车添加"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-[#E6EAF2] bg-white px-2.5 text-[12px] text-[#374151] outline-none placeholder:text-[#C5CAD6] disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={
                      saving ||
                      !keywordDraft.trim() ||
                      selectedKeywords.length >= MAX_KEYWORDS
                    }
                    onClick={() => {
                      addKeyword(keywordDraft);
                      setKeywordDraft("");
                    }}
                    className="h-9 shrink-0 rounded-lg bg-[#4F5DFF] px-3 text-[12px] font-semibold text-white hover:opacity-95 disabled:opacity-40"
                  >
                    添加
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-medium text-[#8B95A8]">
                  内容偏好 ({selectedPreferences.length}/{MAX_PREFERENCES})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PREFERENCE_OPTIONS.map((tag) => {
                    const on = selectedPreferences.includes(tag);
                    const blocked =
                      !on && selectedPreferences.length >= MAX_PREFERENCES;
                    return (
                      <button
                        key={tag}
                        type="button"
                        disabled={blocked || saving}
                        onClick={() => togglePreference(tag)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                          on
                            ? "bg-[#15803D] text-white"
                            : "bg-white text-[#5F6B7C] ring-1 ring-[#E6EAF2] hover:bg-[#F0FDF4]",
                          blocked && "cursor-not-allowed opacity-40",
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <label className="space-y-1">
                  <span className="block text-[11px] font-medium text-[#8B95A8]">
                    {FILTER_SECTION_LABELS.difficulties}
                  </span>
                  <select
                    value={selectedDepth}
                    disabled={saving}
                    onChange={(e) =>
                      setSelectedDepth(e.target.value as ReadingDepth | "")
                    }
                    className="h-9 rounded-lg border border-[#E6EAF2] bg-white px-2.5 text-[12px] text-[#374151] outline-none"
                  >
                    <option value="">不限</option>
                    {DEPTH_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-[11px] font-medium text-[#8B95A8]">
                    {FILTER_SECTION_LABELS.times}
                  </span>
                  <select
                    value={selectedSession}
                    disabled={saving}
                    onChange={(e) => setSelectedSession(e.target.value)}
                    className="h-9 rounded-lg border border-[#E6EAF2] bg-white px-2.5 text-[12px] text-[#374151] outline-none"
                  >
                    {SESSION_OPTIONS.map((opt) => (
                      <option key={opt.label} value={opt.value}>
                        {opt.value === "" ? "不限" : opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#EEF1F6] bg-[#F7F9FF] px-5 py-3 sm:px-6">
          <p className="text-[11px] text-[#8B95A8]">
            {canApply
              ? "将更新专题 Context 并刷新 AI 新推荐"
              : "也可不改条件，直接按当前设定再生成"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => closeCompose(true)}
              className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-[13px] font-semibold text-[#6B7280] hover:bg-white"
            >
              取消
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void regenerate()}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4F5DFF] px-4 text-[13px] font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              重新生成
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  let body: ReactNode;
  if (section === "overview") {
    body = (
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pb-2">
        {headerCard}
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-2">
          <section className="flex min-h-0 flex-col rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-[0_1px_2px_rgba(31,41,55,0.04)] sm:p-5">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-[#111827]">
                已收藏书籍
                <span className="ml-1.5 font-medium text-[#8B95A8]">
                  {bookmarked.length}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setSection("bookmarked")}
                className="text-[12px] font-semibold text-[#4F5DFF] hover:underline"
              >
                查看全部 →
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
              {bookmarked.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-[#8B95A8]">
                  还没有收藏，去 AI 新推荐里看看
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {bookmarked.slice(0, 6).map((item) => (
                    <BookmarkedCard
                      key={item.id}
                      item={item}
                      topicId={topic.id}
                      onBookmarkChange={onBookmarkChange}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-[0_1px_2px_rgba(31,41,55,0.04)] sm:p-5">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-[#111827]">
                AI 新推荐
                <span className="ml-1.5 font-medium text-[#8B95A8]">
                  {recommended.length}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setSection("recommend")}
                className="text-[12px] font-semibold text-[#4F5DFF] hover:underline"
              >
                查看全部 →
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5">
              {recommended.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-[#8B95A8]">
                  暂无推荐，点「编辑并重新生成」更新书单
                </p>
              ) : (
                recommended
                  .slice(0, 4)
                  .map((item) => (
                    <RecommendRow
                      key={item.id}
                      item={item}
                      topicId={topic.id}
                      onBookmarkChange={onBookmarkChange}
                    />
                  ))
              )}
            </div>
          </section>
        </div>
      </div>
    );
  } else if (section === "bookmarked") {
    body = (
      <section className="h-full overflow-y-auto rounded-2xl border border-[#E6EAF2] bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-[#111827]">
            已收藏书籍
          </h2>
          <button
            type="button"
            onClick={openCompose}
            className="text-[12px] font-semibold text-[#4F5DFF] hover:underline"
          >
            编辑并重新生成
          </button>
        </div>
        {bookmarked.length === 0 ? (
          <p className="py-12 text-center text-sm text-[#8B95A8]">暂无收藏</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {bookmarked.map((item) => (
              <BookmarkedCard
                key={item.id}
                item={item}
                topicId={topic.id}
                onBookmarkChange={onBookmarkChange}
              />
            ))}
          </div>
        )}
      </section>
    );
  } else if (section === "recommend") {
    body = (
      <section
        ref={recommendPanelRef}
        id="topic-ai-recommend"
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-white transition-colors",
          justUpdated
            ? "border-[#A5B4FC] ring-2 ring-[#C7D2FE]"
            : "border-[#E6EAF2]",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#EEF1F6] px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-semibold text-[#111827]">
            AI 新推荐
            <span className="ml-1.5 font-medium text-[#8B95A8]">
              {recommended.length}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {justUpdated ? (
              <span className="rounded-md bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-semibold text-[#4F5DFF]">
                已按新条件刷新
              </span>
            ) : null}
            <button
              type="button"
              onClick={openCompose}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#C9D4FF] bg-white px-2.5 text-[11px] font-semibold text-[#4F5DFF] hover:bg-[#F5F7FF]"
            >
              <PencilLine className="size-3.5" />
              编辑并重新生成
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 sm:p-5">
          {recommended.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#8B95A8]">
              暂无推荐结果
            </p>
          ) : (
            recommended.map((item) => (
              <RecommendRow
                key={item.id}
                item={item}
                topicId={topic.id}
                onBookmarkChange={onBookmarkChange}
              />
            ))
          )}
        </div>
      </section>
    );
  } else {
    body = (
      <section className="h-full overflow-y-auto rounded-2xl border border-[#E6EAF2] bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-[15px] font-semibold text-[#111827]">
          相关专题
        </h2>
        {relatedTopics.length === 0 ? (
          <p className="py-12 text-center text-sm text-[#8B95A8]">
            暂无相关专题
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {relatedTopics.map((t) => {
              const RelIcon = TOPIC_ICONS[t.icon ?? "loop"];
              return (
                <Link
                  key={t.id}
                  href={`/topics/${t.id}`}
                  className="flex gap-3 rounded-xl border border-[#E6EAF2] bg-[#FAFBFD] p-3 transition-colors hover:border-[#5B6CFF]/35"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C6CFF] to-[#5B8CFF] text-white">
                    <RelIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#1F2937]">
                      {t.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[#8B95A8]">
                      {t.context_text}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#F4F6FA]">
      <SiteHeader active="topics" />
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
        <div className="grid min-h-0 flex-1 gap-3 py-3 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 lg:block">
            <div className="h-full overflow-y-auto overscroll-contain rounded-2xl border border-[#E6EAF2] bg-white shadow-[0_1px_2px_rgba(31,41,55,0.04)]">
              {sidebar}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 lg:hidden">
              <Link
                href="/topics"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-[#6B7280]"
              >
                <ArrowLeft className="size-4" />
                返回
              </Link>
              <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                      section === item.id
                        ? "border-[#D0D8FF] bg-[#EEF2FF] text-[#4F5DFF]"
                        : "border-[#E6EAF2] bg-white text-[#6B7280]",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
          </section>
        </div>
      </div>
      {composeOverlay}
      <RecommendLoadingOverlay
        open={regenOverlayOpen}
        percent={regenPercent}
        label={regenLabel}
        onCancel={cancelRegenerate}
        hint="正在按当前条件重新生成专题推荐。取消后保留上一版结果。"
      />
    </div>
  );
}
