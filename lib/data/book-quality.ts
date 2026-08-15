/**
 * 书目质量闸 + 书名作者去重（seed / prune / ingest 共用）。
 * 乱码检测为规则校验，不用 LLM 修复；LLM enrichment 只应处理通过本闸的数据。
 */

import { filterWhitelistTags } from "@/lib/data/book-tags";

export const CATALOG_TARGET = 100;

export type QualityBook = {
  id?: string;
  external_id?: string | null;
  title: string;
  author: string | null | undefined;
  description: string | null | undefined;
  cover_url: string | null | undefined;
  tags?: string[] | null;
  rating?: number | null;
  ratings_count?: number | null;
  page_count?: number | null;
  language?: string | null;
};

const PLACEHOLDER_DESC =
  /暂无详细简介|可结合题材标签了解大致方向|内容简介暂缺/;

export function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

export function isRealAuthor(author: string | null | undefined): boolean {
  const a = author?.trim() ?? "";
  if (!a) return false;
  if (/^(佚名|未知|不详|unknown|n\/?a|anonymous)$/i.test(a)) return false;
  if (a.length < 2) return false;
  return true;
}

export function isRealDescription(
  description: string | null | undefined,
): boolean {
  const d = description?.trim() ?? "";
  if (d.length < 15) return false;
  if (PLACEHOLDER_DESC.test(d)) return false;
  // 中英文均可
  return true;
}

/** 标题可读：中文或拉丁字母均可 */
export function isAcceptableTitle(title: string | null | undefined): boolean {
  const t = title?.trim() ?? "";
  if (t.length < 2) return false;
  if (hasChinese(t)) return true;
  if (/[A-Za-z\u00C0-\u024F]/.test(t)) return true;
  return false;
}

/** 规范化书名，用于版本去重 */
export function normalizeTitleKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[：:·•\-—_（）()【】\[\]《》〈〉"""''',,.。、！!？?]/g, "")
    .replace(/第[0-9０-９一二三四五六七八九十两]+[版次卷册]/g, "")
    .replace(/(修订|增订|珍藏|完整|插图|图文|精装|平装|典藏)版?/g, "")
    .replace(/\(.*?\)|（.*?）/g, "");
}

export function normalizeAuthorKey(author: string): string {
  return author
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000,，、;；]+/g, "")
    .replace(/等$|著$|编$/, "");
}

export function workKey(title: string, author: string): string {
  return `${normalizeTitleKey(title)}::${normalizeAuthorKey(author)}`;
}

// ---------------------------------------------------------------------------
// Metadata readability（乱码 / ? / _ 占位 / 替换字符等）
// 原则：宁可误杀脏数据，也不把「字中间一堆符号」的书放进代表版或入库。
// ---------------------------------------------------------------------------

type FieldKind = "title" | "author" | "description";

/** 中文语境下被当成「缺字占位」的符号 */
const PLACEHOLDER_RUN =
  /(?:\?|\uFFFD|_|\*|■|□|○|●|◇|◆|△|▲|※|�){2,}/;

/** 汉字夹 ASCII 问号/下划线：游___概_、入行??、李? */
const CJK_WRAPS_JUNK =
  /[\u4e00-\u9fff][\s]*[?_\uFFFD*■□]{1,}[\s]*[\u4e00-\u9fff\w]?|[?_\uFFFD]{1,}[\u4e00-\u9fff]/;

/**
 * 估算文本「损坏」程度。正常中英文近 0；含大量 ? / _ 占位则很高。
 */
export function metadataCorruptionScore(text: string): number {
  const t = text.trim();
  if (!t) return 0;

  const replacement = (t.match(/\uFFFD/g) ?? []).length;
  const asciiQ = (t.match(/\?/g) ?? []).length;
  const underscores = (t.match(/_/g) ?? []).length;
  const controls = (
    t.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g) ?? []
  ).length;
  const privateUse = (t.match(/[\uE000-\uF8FF]/g) ?? []).length;
  const specials = (t.match(/[\uFFF0-\uFFFF]/g) ?? []).length;
  const placeholderRuns = (t.match(PLACEHOLDER_RUN) ?? []).length;
  const mojibakeLatin = (t.match(/[\u00C0-\u00FF]{4,}/g) ?? []).length;
  const boxChars = (t.match(/[■□○●◇◆△▲※]/g) ?? []).length;

  let score =
    replacement * 10 +
    controls * 4 +
    privateUse * 3 +
    specials * 3 +
    placeholderRuns * 10 +
    mojibakeLatin * 5 +
    boxChars * 4;

  const chinese = hasChinese(t);

  // 问号
  if (chinese && asciiQ > 0) {
    score += asciiQ * (asciiQ >= 2 ? 8 : 5);
  } else if (asciiQ >= 4) {
    score += asciiQ * 2;
  } else if (asciiQ === 1 && /^.+\?$/.test(t) && !chinese) {
    // 纯英文标题末尾单个 ?
  } else {
    score += asciiQ;
  }

  // 下划线占位（游___概_、___:新模式）
  if (chinese && underscores > 0) {
    score += underscores * (underscores >= 2 ? 6 : 3);
  } else if (underscores >= 3) {
    score += underscores * 3;
  }

  if (CJK_WRAPS_JUNK.test(t)) score += 15;
  if (/^[_?]{2,}/.test(t)) score += 12;

  return score;
}

/** 明显占位/乱码：直接不合格（比打分更硬） */
export function hasObviousGarbledPlaceholders(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\uFFFD/.test(t)) return true;
  if (PLACEHOLDER_RUN.test(t)) return true;
  if (CJK_WRAPS_JUNK.test(t)) return true;
  if (/^[_?]{2,}/.test(t)) return true;
  // 标题/作者里任意 ASCII ?（中文语境）
  if (hasChinese(t) && /\?/.test(t)) return true;
  // 中文里出现 2 个及以上 _
  if (hasChinese(t) && (t.match(/_/g) ?? []).length >= 2) return true;
  return false;
}

/** 单字段是否可读（规则闸，非 LLM） */
export function isReadableMetadataField(
  text: string | null | undefined,
  kind: FieldKind = "title",
): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;

  if (hasObviousGarbledPlaceholders(t)) return false;

  const corrupt = metadataCorruptionScore(t);
  const ratio = corrupt / Math.max(t.length, 1);

  if (kind === "title") {
    if (corrupt >= 5) return false;
    if (ratio > 0.08) return false;
    if ((t.match(/\?/g) ?? []).length >= 1 && hasChinese(t)) return false;
    if ((t.match(/_/g) ?? []).length >= 2) return false;
  } else if (kind === "author") {
    if (corrupt >= 4) return false;
    if (ratio > 0.12) return false;
    if ((t.match(/\?/g) ?? []).length >= 1) return false;
    if ((t.match(/_/g) ?? []).length >= 2) return false;
  } else {
    if (corrupt >= 10) return false;
    if (ratio > 0.08) return false;
    if ((t.match(/\?/g) ?? []).length >= 5) return false;
    if ((t.match(/_/g) ?? []).length >= 6) return false;
  }

  const meaningful = t.replace(/[\s\p{P}\p{S}_]/gu, "");
  if (meaningful.length < (kind === "description" ? 8 : 2)) return false;

  return true;
}

/** 标题 + 作者 + 简介均通过乱码检测 */
export function passesMetadataQuality(
  book: Pick<QualityBook, "title" | "author" | "description">,
): boolean {
  if (!isReadableMetadataField(book.title, "title")) return false;
  if (!isReadableMetadataField(book.author, "author")) return false;
  if (!isReadableMetadataField(book.description, "description")) return false;
  return true;
}

/**
 * 可被选为 representative：须过元数据可读闸。
 * （封面/标签等由上层 ingest / passesQualityGate 另行约束）
 */
export function isRepresentativeEligible(book: QualityBook): boolean {
  return passesMetadataQuality(book);
}

export function passesQualityGate(book: QualityBook): boolean {
  if (!isAcceptableTitle(book.title)) return false;
  // 封面可选：无封面用 UI placeholder
  if (!isRealAuthor(book.author)) return false;
  if (!isRealDescription(book.description)) return false;
  if (!passesMetadataQuality(book)) return false;
  if (filterWhitelistTags(book.tags).length === 0) return false;
  return true;
}

/** 越高越优先作为代表版 / 保留；乱码版大幅降分且不应被 pick 选中 */
export function qualityScore(book: QualityBook): number {
  if (!passesMetadataQuality(book)) {
    return (
      -10_000 -
      metadataCorruptionScore(
        `${book.title}\n${book.author ?? ""}\n${book.description ?? ""}`,
      )
    );
  }

  let score = 0;
  const lang = (book.language ?? "").toLowerCase();
  if (lang === "zh" || lang.startsWith("zh")) score += 120;
  const desc = book.description?.trim() ?? "";
  score += Math.min(desc.length, 2000) / 20;
  if (book.cover_url?.trim()) score += 25;
  if (book.rating != null) score += Number(book.rating) * 8;
  if (book.ratings_count != null && book.ratings_count > 0) {
    score += Math.min(book.ratings_count, 2000) / 20;
  }
  if (book.page_count != null && book.page_count > 50) score += 10;
  score += filterWhitelistTags(book.tags).length * 5;
  if (book.cover_url?.includes("books.google")) score += 3;
  score -= metadataCorruptionScore(`${book.title}\n${book.description ?? ""}`);
  return score;
}

/** 同作品多版本中选代表版：仅干净元数据版本可入选；全不合格 → null */
export function pickRepresentativeEdition<T extends QualityBook>(
  editions: T[],
): T | null {
  const eligible = editions.filter(isRepresentativeEligible);
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => qualityScore(b) - qualityScore(a))[0];
}

/**
 * 质量过滤 → 书名+作者去重 → 按分排序截断到 limit
 */
export function selectCatalogBooks<T extends QualityBook>(
  books: T[],
  limit = CATALOG_TARGET,
): { kept: T[]; rejected: number; deduped: number } {
  const quality = books.filter(passesQualityGate);
  const rejected = books.length - quality.length;

  const bestByWork = new Map<string, T>();
  for (const book of quality) {
    const key = workKey(book.title, book.author!.trim());
    const prev = bestByWork.get(key);
    if (!prev || qualityScore(book) > qualityScore(prev)) {
      bestByWork.set(key, book);
    }
  }
  const deduped = quality.length - bestByWork.size;

  const kept = [...bestByWork.values()]
    .sort((a, b) => qualityScore(b) - qualityScore(a))
    .slice(0, limit);

  return { kept, rejected, deduped };
}
