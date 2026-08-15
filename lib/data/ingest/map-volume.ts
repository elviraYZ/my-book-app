import {
  isAcceptableTitle,
  passesMetadataQuality,
} from "@/lib/data/book-quality";
import {
  classifyContentStyles,
  classifyGenreTags,
  filterWhitelistTags,
  tagHasEvidence,
} from "@/lib/data/book-tags";
import type {
  EditionDraft,
  GoogleVolume,
  IngestQuery,
  IngestRejectReason,
  TopicSources,
} from "@/lib/data/ingest/types";

/** 无封面时占位；UI 见空 cover 会用色块兜底 */
export const COVER_PLACEHOLDER = "";

function httpsCover(url: string): string {
  return url.replace(/^http:\/\//i, "https://");
}

function extractIsbns(
  ids: { type?: string; identifier?: string }[] | undefined,
): { isbn_13: string | null; isbn_10: string | null } {
  let isbn_13: string | null = null;
  let isbn_10: string | null = null;
  for (const row of ids ?? []) {
    const id = row.identifier?.trim();
    if (!id) continue;
    if (row.type === "ISBN_13") isbn_13 = id;
    if (row.type === "ISBN_10") isbn_10 = id;
  }
  return { isbn_13, isbn_10 };
}

/**
 * 入库标签：仅保留正文命中 evidence 的题材。
 * seed query 的 tag 只是检索候选；无相关性证据词则不得入库。
 */
export function resolveTopicsWithSources(
  title: string,
  description: string | null | undefined,
  seedTags: string[] | undefined,
  options?: { requireSeedTagEvidence?: boolean },
): { tags: string[]; topic_sources: TopicSources } | null {
  const evidence = classifyGenreTags(title, description);
  const seed = filterWhitelistTags(seedTags);
  const requireSeed = options?.requireSeedTagEvidence !== false;

  const topic_sources: TopicSources = {};

  if (requireSeed && seed.length > 0) {
    const seedRelevant = seed.filter(
      (t) => evidence.includes(t) || tagHasEvidence(t, title, description),
    );
    if (seedRelevant.length === 0) return null;
    for (const t of seedRelevant) {
      topic_sources[t] = "evidence";
    }
    for (const t of evidence) {
      topic_sources[t] = "evidence";
    }
  } else {
    for (const t of evidence) {
      topic_sources[t] = "evidence";
    }
  }

  const tags = Object.keys(topic_sources);
  if (tags.length === 0) return null;
  return { tags, topic_sources };
}

export type VolumeEvalResult =
  | { status: "ok"; draft: EditionDraft }
  | { status: "reject"; reason: IngestRejectReason };

/**
 * 逐步质量闸；返回明确 reject reason（不放宽规则，仅诊断）。
 */
export function evaluateVolumeForIngest(
  volume: GoogleVolume,
  seed: Pick<IngestQuery, "tags" | "styles">,
): VolumeEvalResult {
  const id = volume.id?.trim();
  const info = volume.volumeInfo;
  if (!id || !info) return { status: "reject", reason: "missing_volume" };

  const titleRaw = info.title?.trim();
  const author = info.authors?.map((a) => a.trim()).filter(Boolean).join(", ");
  const description = info.description?.trim();
  const coverRaw =
    info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
  const cover_url = coverRaw ? httpsCover(coverRaw.trim()) : COVER_PLACEHOLDER;

  // 中英文标题均可；仅拒空/过短
  if (!isAcceptableTitle(titleRaw)) {
    return { status: "reject", reason: "non_chinese_title" };
  }
  const title = titleRaw as string;
  // 封面不强制：无则 COVER_PLACEHOLDER，UI 色块兜底
  if (!author) return { status: "reject", reason: "no_author" };
  // 简介：够长即可，中英文均可
  if (!description || description.length < 15) {
    return { status: "reject", reason: "bad_description" };
  }
  if (!passesMetadataQuality({ title, author, description })) {
    return { status: "reject", reason: "garbled_metadata" };
  }

  const resolved = resolveTopicsWithSources(title, description, seed.tags);
  const seedWhitelist = filterWhitelistTags(seed.tags);
  if (!resolved) {
    // 有正式 seed 却无 evidence → 拒；纯 keyword 检索允许空 topics，后续 domain/context 准入
    if (seedWhitelist.length > 0) {
      return { status: "reject", reason: "no_evidence" };
    }
  }

  const tags = resolved?.tags ?? [];
  const topic_sources = resolved?.topic_sources ?? {};

  const page_count =
    typeof info.pageCount === "number" && info.pageCount > 0
      ? info.pageCount
      : null;

  const content_style = classifyContentStyles(
    title,
    description,
    tags,
    seed.styles,
  );
  const difficulty =
    page_count == null
      ? "medium"
      : page_count <= 180
        ? "light"
        : page_count <= 360
          ? "medium"
          : "deep";

  const { isbn_13, isbn_10 } = extractIsbns(info.industryIdentifiers);

  return {
    status: "ok",
    draft: {
      external_id: id,
      isbn_13,
      isbn_10,
      language: info.language?.trim() || null,
      title,
      description: description.slice(0, 8000),
      cover_url,
      publisher: info.publisher?.trim() || null,
      published_date: info.publishedDate?.trim() || null,
      page_count,
      rating:
        typeof info.averageRating === "number"
          ? Math.round(info.averageRating * 10) / 10
          : null,
      ratings_count:
        typeof info.ratingsCount === "number" && info.ratingsCount >= 0
          ? info.ratingsCount
          : null,
      preview_url: info.previewLink?.trim() || null,
      info_url: info.infoLink?.trim() || null,
      author,
      tags,
      topic_sources,
      content_style,
      difficulty,
    },
  };
}

/** Google volume → edition draft；不过闸返回 null */
export function mapVolumeToEditionDraft(
  volume: GoogleVolume,
  seed: Pick<IngestQuery, "tags" | "styles">,
): EditionDraft | null {
  const result = evaluateVolumeForIngest(volume, seed);
  return result.status === "ok" ? result.draft : null;
}

export function mergeTopics(editions: EditionDraft[]): string[] {
  const set = new Set<string>();
  for (const e of editions) for (const t of e.tags) set.add(t);
  return [...set];
}

/** evidence 覆盖 seed */
export function mergeTopicSources(editions: EditionDraft[]): TopicSources {
  const out: TopicSources = {};
  for (const e of editions) {
    for (const [tag, kind] of Object.entries(e.topic_sources)) {
      if (out[tag] === "evidence") continue;
      out[tag] = kind;
    }
  }
  return out;
}

export function mergeStyles(editions: EditionDraft[]): string[] {
  const set = new Set<string>();
  for (const e of editions) for (const s of e.content_style) set.add(s);
  return [...set];
}

export function pickDifficulty(
  editions: EditionDraft[],
): "light" | "medium" | "deep" {
  const order = { light: 0, medium: 1, deep: 2 } as const;
  let best = editions[0];
  for (const e of editions) {
    if (order[e.difficulty] > order[best.difficulty]) best = e;
  }
  return best.difficulty;
}
