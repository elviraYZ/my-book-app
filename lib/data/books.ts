import { getCatalogBook, listCatalogBooks } from "@/lib/data/catalog";
import type { Book, BookDetail } from "@/lib/types";

function buildDetail(
  base: Book,
  extras?: {
    published_date?: string | null;
    pages?: number | null;
    publisher?: string | null;
    isbn?: string | null;
    isbn_10?: string | null;
    language?: string | null;
    preview_url?: string | null;
    info_url?: string | null;
    edition_count?: number | null;
    rating_count?: number | null;
  },
): BookDetail {
  const minutes = base.reading_minutes;
  const sessionLabel =
    minutes != null
      ? minutes <= 20
        ? "单次约 15–20 分钟"
        : minutes <= 35
          ? "单次约 20–30 分钟"
          : "单次约 30–45 分钟"
      : null;

  return {
    ...base,
    // 副标题不再复用简介，避免详情页主卡片与「内容简介」重复
    subtitle: null,
    translator: null,
    publisher: extras?.publisher ?? null,
    published_date: extras?.published_date ?? null,
    pages: extras?.pages ?? null,
    isbn: extras?.isbn ?? null,
    isbn_10: extras?.isbn_10 ?? null,
    language: extras?.language ?? null,
    preview_url: extras?.preview_url ?? null,
    info_url: extras?.info_url ?? null,
    edition_count: extras?.edition_count ?? 1,
    rating_count: extras?.rating_count ?? undefined,
    badge: base.rating != null && base.rating >= 4.5 ? "高分推荐" : null,
    why_fit: [
      `主题标签（${base.tags.slice(0, 2).join("、") || "综合"}）与当前阅读目标匹配`,
      base.difficulty === "light"
        ? "阅读负担较轻，适合快速建立直觉"
        : "内容有一定深度，适合系统补齐认知",
      sessionLabel
        ? `${sessionLabel}，方便碎片化完成`
        : "可按章节拆读，灵活安排时间",
    ],
    content_intro: base.description ?? null,
    takeaways: base.tags.slice(0, 4).map((tag) => `围绕「${tag}」的可迁移要点`),
    // 库内暂无真实目录字段，勿注入占位章节
    toc: [],
    scenarios: [
      ...base.tags.slice(0, 2).map((t) => `${t}相关项目`),
      sessionLabel ?? "碎片阅读时段",
    ],
    updated_label: "目录书目",
  };
}

export async function getBook(id: string): Promise<BookDetail | null> {
  const found = await getCatalogBook(id);
  if (!found) return null;
  return buildDetail(found.book, {
    published_date: found.row?.published_date ?? null,
    pages: found.row?.page_count ?? null,
    publisher: found.row?.publisher ?? null,
    isbn: found.row?.isbn_13 ?? null,
    isbn_10: found.row?.isbn_10 ?? null,
    language: found.row?.language ?? null,
    preview_url: found.row?.preview_url ?? null,
    info_url: found.row?.info_url ?? null,
    edition_count: found.row?.edition_count ?? 1,
    rating_count: found.row?.ratings_count ?? null,
  });
}

export async function getRelatedBooks(
  id: string,
  limit = 4,
): Promise<BookDetail[]> {
  const found = await getCatalogBook(id);
  if (!found) return [];

  const pool = await listCatalogBooks();
  const current = found.book;

  const scored = pool
    .filter((book) => book.id !== current.id)
    .map((book) => {
      const overlap = book.tags.filter((t) => current.tags.includes(t)).length;
      return { book, overlap };
    })
    .sort(
      (a, b) =>
        b.overlap - a.overlap || (b.book.rating ?? 0) - (a.book.rating ?? 0),
    );

  return scored.slice(0, limit).map(({ book }) => buildDetail(book));
}
