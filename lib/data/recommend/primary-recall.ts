/**
 * Explicit primary topic 精确召回。
 * 强命中不因 lexical/semantic 的统一 Top-K 被丢掉；
 * 主题下书很多时在本路内部排序后取 PRIMARY_RECALL_CAP（可随 K 放大）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchWorksOverlappingTopics,
  fetchWorksPaged,
} from "@/lib/data/recommend/recall-fetch";
import { PRIMARY_RECALL_CAP } from "@/lib/data/recommend/weights";
import type { Book, StructuredDemandContext } from "@/lib/types";

function explicitTopicRoots(demand: StructuredDemandContext): string[] {
  const roots =
    demand.explicitTopics?.length
      ? demand.explicitTopics
      : demand.topics;
  return [...new Set((roots ?? []).map((t) => t.trim()).filter(Boolean))];
}

function primaryBlob(book: Book): string {
  return [
    book.title,
    book.description ?? "",
    (book.concepts ?? []).join(" "),
    (book.display_summary ?? ""),
  ]
    .join("\n")
    .toLowerCase();
}

/** 精确 primary（或 topics 回退）命中强度 */
export function primaryHitStrength(
  book: Book,
  roots: string[],
  demand: StructuredDemandContext,
): number {
  if (roots.length === 0) return 0;
  const primary = book.primary_topics ?? [];
  const tags = book.tags ?? [];
  let score = 0;

  for (const r of roots) {
    if (primary.includes(r)) score += 100;
    else if (tags.includes(r)) score += 55;
  }
  if (score === 0) return 0;

  const blob = primaryBlob(book);
  for (const k of demand.keywords ?? []) {
    const kl = k.toLowerCase();
    if (kl.length >= 2 && blob.includes(kl)) score += 8;
  }
  for (const c of book.concepts ?? []) {
    const cl = c.toLowerCase();
    if ((demand.keywords ?? []).some((k) => cl.includes(k.toLowerCase()))) {
      score += 6;
    }
  }
  if (book.rating != null) score += Number(book.rating) * 0.5;
  return score;
}

export function isStrongPrimaryHit(book: Book, roots: string[]): boolean {
  if (roots.length === 0) return false;
  const primary = book.primary_topics ?? [];
  if (primary.some((t) => roots.includes(t))) return true;
  // primary 为空时 topics 精确命中仍算强命中（enrichment 未填 primary 的兜底）
  if (primary.length === 0) {
    return (book.tags ?? []).some((t) => roots.includes(t));
  }
  return false;
}

function rankAndCap(
  books: Book[],
  demand: StructuredDemandContext,
  roots: string[],
  cap: number,
): Book[] {
  const ranked = books
    .map((book) => ({
      book,
      score: primaryHitStrength(book, roots, demand),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // 强命中优先保留；cap 内尽量多留强命中
  const strong: Book[] = [];
  const weak: Book[] = [];
  for (const { book } of ranked) {
    if (isStrongPrimaryHit(book, roots)) strong.push(book);
    else weak.push(book);
  }
  const out = [...strong];
  for (const b of weak) {
    if (out.length >= cap) break;
    out.push(b);
  }
  // 强命中也受 cap（大主题防 2000 本灌池），但 cap 随 expand 变大
  return out.slice(0, cap);
}

/**
 * @param cap 本路上限；默认 PRIMARY_RECALL_CAP，expand 时可传入更大值
 */
export async function recallByPrimaryTopics(
  demand: StructuredDemandContext,
  options: {
    supabase?: SupabaseClient;
    /** mock / 已有全量书目 */
    catalog?: Book[];
    cap?: number;
  } = {},
): Promise<Book[]> {
  const roots = explicitTopicRoots(demand);
  if (roots.length === 0) return [];

  const cap = options.cap ?? PRIMARY_RECALL_CAP;

  let candidates: Book[] = [];
  if (options.catalog && options.catalog.length > 0) {
    candidates = options.catalog.filter((b) => primaryHitStrength(b, roots, demand) > 0);
  } else if (options.supabase) {
    const byPrimary = await fetchWorksOverlappingTopics(
      options.supabase,
      roots,
      { column: "primary_topics", max: Math.max(cap * 3, 400) },
    );
    const byTopics = await fetchWorksOverlappingTopics(
      options.supabase,
      roots,
      { column: "topics", max: Math.max(cap * 3, 400) },
    );
    const seen = new Set<string>();
    for (const b of [...byPrimary, ...byTopics]) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      candidates.push(b);
    }
    // 若 overlaps 几乎为空（列未填），扫全库兜底
    if (candidates.length < 8) {
      const all = await fetchWorksPaged(options.supabase);
      for (const b of all) {
        if (seen.has(b.id)) continue;
        if (primaryHitStrength(b, roots, demand) > 0) {
          seen.add(b.id);
          candidates.push(b);
        }
      }
    }
  }

  return rankAndCap(candidates, demand, roots, cap);
}
