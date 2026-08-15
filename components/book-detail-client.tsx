"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
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
import { showComingSoon } from "@/components/coming-soon";
import { SiteHeader } from "@/components/site-header";
import { bookDetailHref } from "@/lib/book-links";
import { setBookAction } from "@/lib/data";
import type { BookDetail, UserBookStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Crumb = { label: string; href?: string };

function Cover({ book }: { book: BookDetail }) {
  if (book.cover_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={book.cover_url}
        alt={book.title}
        className="aspect-[2/3] w-full rounded-xl object-cover shadow-md"
      />
    );
  }
  return (
    <div
      className="flex aspect-[2/3] w-full items-end justify-center rounded-xl px-3 pb-4 text-center text-sm font-semibold leading-snug text-white shadow-md"
      style={{ backgroundColor: book.cover_color ?? "#64748b" }}
    >
      {book.title}
    </div>
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

/** 左侧「外部获取」：试读 / 来源；无链接时 coming soon */
function ExternalGetMenu({ book }: { book: BookDetail }) {
  const [open, setOpen] = useState(false);
  const links = [
    book.preview_url
      ? { href: book.preview_url, label: "试读预览" }
      : null,
    book.info_url ? { href: book.info_url, label: "来源页面" } : null,
  ].filter(Boolean) as { href: string; label: string }[];

  if (links.length === 0) {
    return (
      <button
        type="button"
        onClick={() =>
          showComingSoon("外部获取入口开发中，后续将支持购买 / 借阅链接")
        }
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#C9D4FF] bg-white text-[13px] font-semibold text-[#4F5DFF] hover:bg-[#F5F7FF]"
      >
        <ExternalLink className="size-4" />
        外部获取
        <ChevronDown className="size-3.5 opacity-70" />
      </button>
    );
  }

  if (links.length === 1) {
    return (
      <a
        href={links[0].href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#C9D4FF] bg-white text-[13px] font-semibold text-[#4F5DFF] hover:bg-[#F5F7FF]"
      >
        <ExternalLink className="size-4" />
        {links[0].label}
      </a>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#C9D4FF] bg-white text-[13px] font-semibold text-[#4F5DFF] hover:bg-[#F5F7FF]"
      >
        <ExternalLink className="size-4" />
        外部获取
        <ChevronDown
          className={cn("size-3.5 opacity-70 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl border border-[#E6EAF2] bg-white shadow-lg">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-[#374151] hover:bg-[#F5F7FF] hover:text-[#4F5DFF]"
            >
              <ExternalLink className="size-3.5 shrink-0" />
              {link.label}
            </a>
          ))}
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
  const [status, setStatus] = useState<UserBookStatus | null>(initialStatus);
  const [dislikePending, setDislikePending] = useState(false);
  const [showAllToc, setShowAllToc] = useState(false);

  const toc = book.toc ?? [];
  const visibleToc = showAllToc ? toc : toc.slice(0, 5);
  const introText = (book.content_intro ?? book.description ?? "").trim();

  const onDislike = async () => {
    if (dislikePending) return;
    setDislikePending(true);
    try {
      await setBookAction(book.id, "disliked", topicId);
      setStatus("disliked");
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
                variant="button"
                className="w-full"
              />
              <button
                type="button"
                disabled={dislikePending}
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
                不感兴趣
              </button>
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
                <ol className="space-y-1.5 text-[13px] text-[#4B5568]">
                  {visibleToc.map((chapter, i) => (
                    <li key={chapter} className="flex gap-2">
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
                      <div
                        className="flex aspect-[2/3] w-12 shrink-0 items-end justify-center rounded-md px-1 pb-1.5 text-center text-[8px] font-semibold text-white"
                        style={{
                          backgroundColor: item.cover_color ?? "#64748b",
                        }}
                      >
                        {item.title.slice(0, 6)}
                      </div>
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
