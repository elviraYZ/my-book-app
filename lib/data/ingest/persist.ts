import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isRepresentativeEligible,
  passesMetadataQuality,
  pickRepresentativeEdition,
} from "@/lib/data/book-quality";
import { filterWhitelistTags, pickPrimaryTopics } from "@/lib/data/book-tags";
import {
  mergeStyles,
  mergeTopicSources,
  mergeTopics,
  pickDifficulty,
} from "@/lib/data/ingest/map-volume";
import type {
  EditionDraft,
  ExistingIndex,
} from "@/lib/data/ingest/types";
import {
  buildDisplaySummary,
  inferUseCases,
  mergeConcepts,
} from "@/lib/data/work-enrichment";
import type { ContentStyle, ReadingDepth } from "@/lib/types";

/** topics 只保留正式 taxonomy；自由 concepts 单独落库 */
function canonicalTopics(editions: EditionDraft[]): string[] {
  return filterWhitelistTags(mergeTopics(editions));
}

/** 只保留元数据可读的版本；全不合格则空数组（调用方应丢弃 work） */
export function filterCleanEditions(editions: EditionDraft[]): EditionDraft[] {
  return editions.filter((e) =>
    passesMetadataQuality({
      title: e.title,
      author: e.author,
      description: e.description,
    }),
  );
}

export async function loadExistingCatalog(
  supabase: SupabaseClient,
): Promise<ExistingIndex> {
  const workKeys = new Map<string, string>();
  const externalIds = new Set<string>();
  const isbn13s = new Set<string>();

  const { data: works, error: wErr } = await supabase
    .from("works")
    .select("id, work_key")
    .limit(5000);
  if (wErr) throw new Error(`读取 works 失败: ${wErr.message}`);
  for (const row of works ?? []) {
    workKeys.set(String(row.work_key), String(row.id));
  }

  const { data: editions, error: eErr } = await supabase
    .from("book_editions")
    .select("external_id, isbn_13")
    .limit(20000);
  if (eErr) throw new Error(`读取 book_editions 失败: ${eErr.message}`);
  for (const row of editions ?? []) {
    const eid = (row.external_id as string | null)?.trim();
    if (eid) externalIds.add(eid);
    const isbn = (row.isbn_13 as string | null)?.trim();
    if (isbn) isbn13s.add(isbn);
  }

  return { workKeys, externalIds, isbn13s };
}

export async function refreshRepresentativeEdition(
  supabase: SupabaseClient,
  workId: string,
) {
  const { data: work } = await supabase
    .from("works")
    .select("primary_author")
    .eq("id", workId)
    .maybeSingle();
  const author = (work?.primary_author as string | null) ?? "未知作者";

  const { data: editions, error } = await supabase
    .from("book_editions")
    .select("*")
    .eq("work_id", workId);
  if (error || !editions?.length) {
    await supabase
      .from("works")
      .update({ representative_edition_id: null })
      .eq("id", workId);
    return;
  }

  const scored = editions.map((e) => ({
    ...e,
    title: String(e.title ?? ""),
    author,
    description: (e.description as string | null) ?? "",
    tags: [] as string[],
  }));

  const rep = pickRepresentativeEdition(scored);
  if (!rep?.id) {
    // 全部不可读：清空代表版（不调用 LLM 修复）
    await supabase
      .from("works")
      .update({ representative_edition_id: null })
      .eq("id", workId);
    return;
  }
  await supabase
    .from("works")
    .update({ representative_edition_id: rep.id })
    .eq("id", workId);
}

function editionRows(
  workId: string,
  editions: EditionDraft[],
  existing: ExistingIndex,
) {
  return editions
    .filter((e) => {
      if (!isRepresentativeEligible(e)) return false;
      if (existing.externalIds.has(e.external_id)) return false;
      if (e.isbn_13 && existing.isbn13s.has(e.isbn_13)) return false;
      return true;
    })
    .map((e) => ({
      work_id: workId,
      external_id: e.external_id,
      source: "google_books",
      isbn_13: e.isbn_13,
      isbn_10: e.isbn_10,
      language: e.language,
      title: e.title,
      description: e.description,
      cover_url: e.cover_url,
      publisher: e.publisher,
      published_date: e.published_date,
      page_count: e.page_count,
      rating: e.rating,
      ratings_count: e.ratings_count,
      preview_url: e.preview_url,
      info_url: e.info_url,
    }));
}

function rememberInserted(
  existing: ExistingIndex,
  rows: { external_id?: string | null; isbn_13?: string | null }[],
) {
  for (const row of rows) {
    const eid = row.external_id?.trim();
    if (eid) existing.externalIds.add(eid);
    const isbn = row.isbn_13?.trim();
    if (isbn) existing.isbn13s.add(isbn);
  }
}

export type InsertWorkResult =
  | { status: "inserted"; workId: string; topics: string[] }
  | { status: "existed"; workId: string; editionsAdded: number }
  | { status: "failed" };

/** 新 work；若 work_key 已存在则只补版本。全版本乱码 → failed（丢弃） */
export async function upsertWorkGroup(
  supabase: SupabaseClient,
  key: string,
  editions: EditionDraft[],
  existing: ExistingIndex,
): Promise<InsertWorkResult> {
  const clean = filterCleanEditions(editions);
  if (clean.length === 0) return { status: "failed" };

  const existingId = existing.workKeys.get(key);
  if (existingId) {
    const added = await appendEditionsToWork(
      supabase,
      existingId,
      clean,
      existing,
    );
    return { status: "existed", workId: existingId, editionsAdded: added };
  }

  const rep = pickRepresentativeEdition(clean);
  if (!rep) return { status: "failed" };

  const topics = canonicalTopics(clean);
  const topic_sourcesRaw = mergeTopicSources(clean);
  const topic_sources: Record<string, string> = {};
  for (const t of topics) {
    if (topic_sourcesRaw[t]) topic_sources[t] = topic_sourcesRaw[t];
  }
  const concepts = mergeConcepts(
    ...clean.map((e) => e.concepts ?? []),
  );
  const primary_topics = pickPrimaryTopics(topics);
  const content_style = mergeStyles(clean) as ContentStyle[];
  const difficulty = pickDifficulty(clean) as ReadingDepth;
  const display_summary = buildDisplaySummary({
    title: rep.title,
    description: rep.description,
    topics,
  });
  const use_cases = inferUseCases({
    title: rep.title,
    description: rep.description,
    tags: topics,
    content_style,
    difficulty,
    display_summary,
    use_cases: [],
  });

  const { data: work, error: wErr } = await supabase
    .from("works")
    .insert({
      work_key: key,
      canonical_title: rep.title,
      primary_author: rep.author,
      topics,
      primary_topics,
      topic_sources,
      difficulty,
      content_style,
      display_summary,
      use_cases,
      concepts,
    })
    .select("id")
    .single();

  if (wErr || !work) {
    const { data: again } = await supabase
      .from("works")
      .select("id")
      .eq("work_key", key)
      .maybeSingle();
    if (again?.id) {
      existing.workKeys.set(key, again.id as string);
      const added = await appendEditionsToWork(
        supabase,
        again.id as string,
        clean,
        existing,
      );
      return {
        status: "existed",
        workId: again.id as string,
        editionsAdded: added,
      };
    }
    return { status: "failed" };
  }

  const workId = work.id as string;
  existing.workKeys.set(key, workId);

  const rows = editionRows(workId, clean, existing);
  if (rows.length === 0) {
    await supabase.from("works").delete().eq("id", workId);
    existing.workKeys.delete(key);
    return { status: "failed" };
  }

  const { data: inserted, error: eErr } = await supabase
    .from("book_editions")
    .insert(rows)
    .select("id, external_id, isbn_13");

  if (eErr) {
    await supabase.from("works").delete().eq("id", workId);
    existing.workKeys.delete(key);
    return { status: "failed" };
  }

  rememberInserted(existing, inserted ?? []);
  await refreshRepresentativeEdition(supabase, workId);
  return { status: "inserted", workId, topics };
}

export async function appendEditionsToWork(
  supabase: SupabaseClient,
  workId: string,
  editions: EditionDraft[],
  existing: ExistingIndex,
): Promise<number> {
  const clean = filterCleanEditions(editions);
  if (clean.length === 0) return 0;

  const rows = editionRows(workId, clean, existing);
  if (rows.length === 0) return 0;

  const { data: inserted, error } = await supabase
    .from("book_editions")
    .insert(rows)
    .select("id, external_id, isbn_13");
  if (error) return 0;

  rememberInserted(existing, inserted ?? []);
  await refreshRepresentativeEdition(supabase, workId);

  const topics = canonicalTopics(clean);
  const topic_sourcesRaw = mergeTopicSources(clean);
  if (topics.length > 0) {
    const { data: current } = await supabase
      .from("works")
      .select("topics, topic_sources")
      .eq("id", workId)
      .maybeSingle();
    const prevTopics = (current?.topics as string[] | null) ?? [];
    const prevSources =
      (current?.topic_sources as Record<string, string> | null) ?? {};
    const nextTopics = [...new Set([...prevTopics, ...topics])];
    const nextSources = { ...prevSources };
    for (const t of topics) {
      const kind = topic_sourcesRaw[t];
      if (!kind) continue;
      if (nextSources[t] === "evidence") continue;
      nextSources[t] = kind;
    }
    await supabase
      .from("works")
      .update({ topics: nextTopics, topic_sources: nextSources })
      .eq("id", workId);
  }

  return inserted?.length ?? rows.length;
}
