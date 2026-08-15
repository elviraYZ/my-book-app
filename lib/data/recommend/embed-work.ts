import type { SupabaseClient } from "@supabase/supabase-js";

import { embedText, toPgVectorLiteral } from "@/lib/ai/embedding";
import {
  bumpNewBookEmbeddingCall,
  isRecommendTimingEnabled,
} from "@/lib/data/recommend/dev-timing";
import {
  buildWorkEmbeddingText,
  type WorkEmbeddingSource,
} from "@/lib/data/recommend/embedding-text";
import type { ContentStyle } from "@/lib/types";

/**
 * 读取 work + 代表版简介，拼 embedding 文本并写回 embedding。
 * 假定 enrichment 字段已落库；此处不做二次推断，避免污染。
 * 失败返回 false，不抛错（入库路径可忽略）。
 */
export async function embedAndSaveWork(
  supabase: SupabaseClient,
  workId: string,
): Promise<boolean> {
  const timingOn = isRecommendTimingEnabled();
  const t0 = timingOn ? performance.now() : 0;
  try {
    const ok = await embedAndSaveWorkInner(supabase, workId);
    return ok;
  } finally {
    if (timingOn) {
      bumpNewBookEmbeddingCall(performance.now() - t0);
    }
  }
}

async function embedAndSaveWorkInner(
  supabase: SupabaseClient,
  workId: string,
): Promise<boolean> {
  try {
    const { data: work, error } = await supabase
      .from("works")
      .select(
        "id, canonical_title, topics, primary_topics, content_style, display_summary, use_cases, concepts, representative_edition_id, book_editions!book_editions_work_id_fkey(id, description)",
      )
      .eq("id", workId)
      .maybeSingle();

    if (error || !work) {
      console.warn("[embed-work] load failed:", error?.message);
      return false;
    }

    const editions = (work.book_editions ?? []) as {
      id: string;
      description?: string | null;
    }[];
    const repId = work.representative_edition_id as string | null;
    const rep =
      (repId && editions.find((e) => e.id === repId)) || editions[0];

    const topics = (work.topics as string[] | null) ?? [];
    const primary_topics = (work.primary_topics as string[] | null) ?? [];
    const content_style =
      (work.content_style as ContentStyle[] | null) ?? [];
    const display_summary =
      (work.display_summary as string | null)?.trim() ||
      (rep?.description ?? "").replace(/\s+/g, " ").trim().slice(0, 220) ||
      null;
    const use_cases = (work.use_cases as string[] | null) ?? [];
    const concepts = (work.concepts as string[] | null) ?? [];

    const source: WorkEmbeddingSource = {
      canonical_title: String(work.canonical_title),
      display_summary,
      topics,
      primary_topics,
      content_style,
      use_cases,
      concepts,
      description: rep?.description ?? null,
    };

    const text = buildWorkEmbeddingText(source);
    const vector = await embedText(text);
    if (!vector) return false;

    const { error: upErr } = await supabase
      .from("works")
      .update({ embedding: toPgVectorLiteral(vector) })
      .eq("id", workId);

    if (upErr) {
      console.warn("[embed-work] update failed:", upErr.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[embed-work] failed:", err);
    return false;
  }
}
