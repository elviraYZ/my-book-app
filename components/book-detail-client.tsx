"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  ExternalLink,
  Gift,
  ListOrdered,
  Loader2,
  MessageCircle,
  Copy,
  Star,
  Target,
  UserRound,
  Building2,
  Calendar,
  BookMarked,
  Hash,
  Languages,
} from "lucide-react";

import { BookmarkButton } from "@/components/bookmark-button";
import { BookCover } from "@/components/book-cover";
import {
  createTopicPrefillFromRecommend,
  type CreateTopicPrefill,
} from "@/components/create-topic-modal";
import { SiteHeader } from "@/components/site-header";
import { bookDetailHref } from "@/lib/book-links";
import {
  getBookSourceUrl,
  tryOpenExternalUrl,
} from "@/lib/book-external-links";
import {
  getBookAction,
  getLastRecommend,
  hideBookFromLastRecommend,
  setBookAction,
} from "@/lib/data";
import { emitDislikedChanged } from "@/lib/data-events";
import type { BookDetail, UserBookStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Crumb = { label: string; href?: string };

function Cover({ book }: { book: BookDetail }) {
  return (
    <BookCover
      title={book.title}
      coverUrl={book.cover_url}
      color={book.cover_color}
      className="w-full rounded-xl text-sm shadow-md"
      titleChars={12}
    />
  );
}

function InfoCard({
  icon,
  title,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-[0_1px_2px_rgba(31,41,55,0.04)]",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F5DFF]">
          {icon}
        </span>
        <h2 className="text-[15px] font-bold text-[#111827]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

const INTRO_COLLAPSE_CHARS = 180;

/** 主卡片内简介：过长可展开/收起 */
function CollapsibleIntro({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsCollapse = text.length > INTRO_COLLAPSE_CHARS;
  const shown =
    !needsCollapse || expanded
      ? text
      : `${text.slice(0, INTRO_COLLAPSE_CHARS).trimEnd()}…`;

  return (
    <div className="mt-4">
      <p className="text-[12px] font-semibold text-[#6B7280]">内容简介</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#4B5568]">{shown}</p>
      {needsCollapse ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[12px] font-semibold text-[#4F5DFF] hover:underline"
        >
          {expanded ? "收起" : "展开全部"}
        </button>
      ) : null}
    </div>
  );
}

/** 左侧「外部获取」：打开来源链接；底部一键复制来源链接（不是 ISBN） */
function ExternalGetMenu({ book }: { book: BookDetail }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const sourceUrl = getBookSourceUrl(book);

  const copySource = async () => {
    if (!sourceUrl) return;
    try {
      await navigator.clipboard.writeText(sourceUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setOpenFailed(true);
    }
  };

  const openSource = () => {
    if (!sourceUrl) return;
    const ok = tryOpenExternalUrl(sourceUrl);
    setOpenFailed(!ok);
    setOpen(true);
  };

  if (!sourceUrl) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex h-10 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[13px] font-semibold text-[#9CA3AF]"
        title="暂无来源链接"
      >
        <ExternalLink className="size-4" />
        暂无来源链接
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open) openSource();
          else {
            setOpen(false);
            setOpenFailed(false);
          }
        }}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#C9D4FF] bg-white text-[13px] font-semibold text-[#4F5DFF] hover:bg-[#F5F7FF]"
      >
        <ExternalLink className="size-4" />
        外部获取
        <ChevronDown
          className={cn(
            "size-3.5 opacity-70 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 space-y-2 rounded-xl border border-[#E6EAF2] bg-white p-3 shadow-lg">
          <button
            type="button"
            onClick={openSource}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#C9D4FF] bg-[#F5F7FF] text-[12px] font-semibold text-[#4F5DFF] hover:bg-[#EEF2FF]"
          >
            <ExternalLink className="size-3.5" />
            打开来源页面
          </button>

          {openFailed ? (
            <p className="text-[11px] font-medium text-amber-700">
              未能自动打开（可能需 VPN）。请复制下方来源链接。
            </p>
          ) : (
            <p className="text-[11px] text-[#64748B]">
              打不开时，复制来源链接，开 VPN 后粘贴到地址栏。
            </p>
          )}

          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-2">
            <p className="mb-1 text-[10px] font-semibold tracking-wide text-[#94A3B8] uppercase">
              来源链接
            </p>
            <p className="break-all font-mono text-[11px] leading-snug text-[#475569]">
              {sourceUrl}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void copySource()}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#4F5DFF] text-[12px] font-semibold text-white hover:bg-[#4338CA]"
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? "已复制来源链接" : "一键复制来源链接"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function BookDetailClient({
  book,
  related,
  crumbs,
  backHref = "/",
  backLabel = "返回",
  from,
  topicId,
  initialStatus = null,
}: {
  book: BookDetail;
  related: BookDetail[];
  crumbs: Crumb[];
  backHref?: string;
  backLabel?: string;
  from?: string;
  topicId?: string;
  initialStatus?: UserBookStatus | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<UserBookStatus | null>(initialStatus);
  const [dislikePending, setDislikePending] = useState(false);
  const [showAllToc, setShowAllToc] = useState(false);
  const [dislikeError, setDislikeError] = useState<string | null>(null);
  const [saveAsTopicPrefill, setSaveAsTopicPrefill] =
    useState<CreateTopicPrefill | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getBookAction(book.id)
      .then((action) => {
        if (!cancelled && action?.status === "disliked") {
          setStatus("disliked");
        }
      })
      .catch(() => {
        /* 未登录等忽略 */
      });
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  /** 仅从推荐入口进详情时，可用上次推荐 Context「保存为专题」 */
  useEffect(() => {
    if (from !== "recommend") {
      setSaveAsTopicPrefill(null);
      return;
    }
    let cancelled = false;
    void getLastRecommend()
      .then((data) => {
        if (cancelled) return;
        setSaveAsTopicPrefill(
          data ? createTopicPrefillFromRecommend(data) : null,
        );
      })
      .catch(() => {
        if (!cancelled) setSaveAsTopicPrefill(null);
      });
    return () => {
      cancelled = true;
    };
  }, [from]);

  const toc = book.toc ?? [];
  const visibleToc = showAllToc ? toc : toc.slice(0, 5);
  const introText = (book.content_intro ?? book.description ?? "").trim();

  const onDislike = async () => {
    if (dislikePending || status === "disliked") return;
    const ok = window.confirm(
      "标记后，这本书会从当前推荐里移除，并记入你的偏好；之后推荐会尽量避开它。个人偏好与相似降权还在完善中。确定标记为不感兴趣？",
    );
    if (!ok) return;

    setDislikePending(true);
    setDislikeError(null);
    try {
      await setBookAction(book.id, "disliked", topicId);
      setStatus("disliked");
      hideBookFromLastRecommend(book.id);
      emitDislikedChanged(book.id);
      router.push(backHref);
    } catch (e) {
      setDislikeError(
        e instanceof Error ? e.message : "记录失败，请登录后重试",
      );
    } finally {
      setDislikePending(false);
    }
  };

  const rating = book.rating ?? 0;
  const ratingCount = book.rating_count ?? 0;

  const meta = [
    { icon: UserRound, label: "作者", value: book.author ?? "—" },
    { icon: Languages, label: "译者", value: book.translator ?? "—" },
    { icon: Building2, label: "出版社", value: book.publisher ?? "—" },
    { icon: Calendar, label: "出版", value: book.published_date ?? "—" },
    {
      icon: BookMarked,
      label: "页数",
      value: book.pages != null ? `${book.pages}` : "—",
    },
    { icon: Hash, label: "ISBN", value: book.isbn ?? "—" },
  ];

  return (
    <div className="min-h-dvh bg-[#F4F6FA]">
      <SiteHeader />
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <nav className="flex min-w-0 flex-wrap items-center gap-1 text-[12px] text-[#8B95A8]">
            {crumbs.map((c, i) => (
              <span
                key={`${c.label}-${i}`}
                className="inline-flex items-center gap-1"
              >
                {i > 0 ? <ChevronRight className="size-3 opacity-60" /> : null}
                {c.href ? (
                  <Link href={c.href} className="hover:text-[#4F5DFF]">
                    {c.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-[#4B5568]">
                    {c.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
          <Link
            href={backHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#E6EAF2] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#374151] hover:border-[#C9D4FF] hover:text-[#4F5DFF]"
          >
            <ArrowLeft className="size-3.5" />
            {backLabel}
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
          {/* 左侧：封面 + 操作 */}
          <aside className="rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-[0_1px_2px_rgba(31,41,55,0.04)] lg:sticky lg:top-20">
            <Cover book={book} />
            <div className="mt-3 flex items-center gap-1.5">
              <Star className="size-4 fill-[#4F5DFF] text-[#4F5DFF]" />
              <span className="text-[18px] font-bold text-[#111827]">
                {rating.toFixed(1)}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[#9AA3B5]">
              基于 {ratingCount} 位读者评分
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <BookmarkButton
                bookId={book.id}
                bookTitle={book.title}
                topicId={topicId}
                saveAsTopicPrefill={saveAsTopicPrefill}
                variant="button"
                className="w-full"
              />
              <button
                type="button"
                disabled={dislikePending || status === "disliked"}
                onClick={() => void onDislike()}
                className={cn(
                  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border text-[13px] font-semibold transition-colors",
                  status === "disliked"
                    ? "border-[#D1D5DB] bg-[#F3F4F6] text-[#6B7280]"
                    : "border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F9FAFB]",
                )}
              >
                {dislikePending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CircleSlash className="size-4" />
                )}
                {status === "disliked" ? "已标记不感兴趣" : "不感兴趣"}
              </button>
              {dislikeError ? (
                <p className="text-center text-[11px] font-medium text-[#DC2626]">
                  {dislikeError}
                </p>
              ) : null}
              <ExternalGetMenu book={book} />
            </div>

            <p className="mt-4 text-center text-[11px] text-[#9AA3B5]">
              最近更新：{book.updated_label ?? "—"}
            </p>
          </aside>

          {/* 右侧：详情 */}
          <div className="space-y-4">
            <section className="rounded-2xl border border-[#E6EAF2] bg-white p-5 shadow-[0_1px_2px_rgba(31,41,55,0.04)] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-[26px] font-bold tracking-tight text-[#111827] sm:text-[30px]">
                    {book.title}
                  </h1>
                  {book.subtitle ? (
                    <p className="mt-2 text-[14px] leading-relaxed text-[#6B7280]">
                      {book.subtitle}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {book.badge ? (
                    <span className="rounded-full bg-[#FFF7ED] px-2.5 py-1 text-[11px] font-semibold text-[#EA580C]">
                      {book.badge}
                    </span>
                  ) : null}
                  <div className="text-right">
                    <p className="inline-flex items-center gap-1 text-[28px] font-bold leading-none text-[#4F5DFF]">
                      <Star className="size-5 fill-current" />
                      {rating.toFixed(1)}
                    </p>
                    <p className="mt-1 text-[11px] text-[#9AA3B5]">
                      {ratingCount} 人评分
                    </p>
                  </div>
                </div>
              </div>

              {book.tags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {book.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-[#DCE3F0] bg-[#F7F9FC] px-2.5 py-1 text-[11px] font-medium text-[#4B5568]"
                    >
                      {tag}
                    </span>
                  ))}
                  {book.reading_minutes != null ? (
                    <span className="rounded-full border border-[#DCE3F0] bg-[#F7F9FC] px-2.5 py-1 text-[11px] font-medium text-[#4B5568]">
                      约 {book.reading_minutes} 分钟/次
                    </span>
                  ) : null}
                </div>
              ) : null}

              {introText ? <CollapsibleIntro text={introText} /> : null}

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {meta.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-start gap-2 rounded-xl bg-[#F7F9FC] px-3 py-2.5"
                  >
                    <item.icon className="mt-0.5 size-3.5 shrink-0 text-[#4F5DFF]" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-[#9AA3B5]">{item.label}</p>
                      <p className="truncate text-[13px] font-medium text-[#374151]">
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-3 md:grid-cols-2">
              <InfoCard
                icon={<Target className="size-4" />}
                title="为什么适合你"
              >
                <ul className="space-y-2">
                  {(book.why_fit ?? []).map((line) => (
                    <li
                      key={line}
                      className="flex gap-2 text-[13px] leading-relaxed text-[#4B5568]"
                    >
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[#4F5DFF]" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </InfoCard>

              <InfoCard
                icon={<MessageCircle className="size-4" />}
                title="适合场景"
              >
                <div className="flex flex-wrap gap-2">
                  {(book.scenarios ?? []).map((s) => (
                    <span
                      key={s}
                      className="rounded-lg bg-[#F3F5F9] px-2.5 py-1.5 text-[12px] font-medium text-[#4B5568]"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </InfoCard>

              <InfoCard
                icon={<Gift className="size-4" />}
                title="你将获得"
              >
                <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-[#4B5568]">
                  {(book.takeaways ?? []).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </InfoCard>

              <InfoCard
                icon={<ListOrdered className="size-4" />}
                title="目录概览"
              >
                {toc.length === 0 ? (
                  <p className="text-[13px] leading-relaxed text-[#9AA3B5]">
                    暂无目录信息
                  </p>
                ) : (
                  <>
                    <ol className="space-y-1.5 text-[13px] text-[#4B5568]">
                      {visibleToc.map((chapter, i) => (
                        <li key={`${i}-${chapter}`} className="flex gap-2">
                          <span className="w-4 shrink-0 text-[#9AA3B5]">
                            {i + 1}.
                          </span>
                          <span>{chapter}</span>
                        </li>
                      ))}
                    </ol>
                    {toc.length > 5 ? (
                      <button
                        type="button"
                        onClick={() => setShowAllToc((v) => !v)}
                        className="mt-3 text-[12px] font-semibold text-[#4F5DFF] hover:underline"
                      >
                        {showAllToc
                          ? "收起目录"
                          : `查看完整目录（共 ${toc.length} 章）`}
                      </button>
                    ) : null}
                  </>
                )}
              </InfoCard>
            </div>

            {related.length > 0 ? (
              <section className="rounded-2xl border border-[#E6EAF2] bg-white p-5 shadow-[0_1px_2px_rgba(31,41,55,0.04)]">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-[16px] font-bold text-[#111827]">
                    相关推荐
                  </h2>
                  <Link
                    href="/explore"
                    className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#4F5DFF] hover:underline"
                  >
                    查看全部相关书籍
                    <ChevronRight className="size-3.5" />
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {related.map((item) => (
                    <Link
                      key={item.id}
                      href={bookDetailHref(item.id, {
                        from: from ?? "book",
                        topic: topicId,
                      })}
                      className="flex gap-2.5 rounded-xl border border-[#E6EAF2] bg-[#FAFBFD] p-2.5 transition-colors hover:border-[#C9D4FF]"
                    >
                      <BookCover
                        title={item.title}
                        coverUrl={item.cover_url}
                        color={item.cover_color}
                        className="w-12 rounded-md text-[8px]"
                        titleChars={6}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[13px] font-semibold text-[#111827]">
                          {item.title}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-[#8B95A8]">
                          {item.author}
                        </p>
                        {item.rating != null ? (
                          <p className="mt-1 inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#4F5DFF]">
                            <Star className="size-3 fill-current" />
                            {item.rating.toFixed(1)}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
