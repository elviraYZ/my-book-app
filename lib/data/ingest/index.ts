export { ingestBooks } from "@/lib/data/ingest/ingest-books";
export {
  DEFAULT_INGEST_QUERIES,
  filterQueriesByTags,
  uniqueTagsFromQueries,
} from "@/lib/data/ingest/default-queries";
export { mapVolumeToEditionDraft, evaluateVolumeForIngest, resolveTopicsWithSources } from "@/lib/data/ingest/map-volume";
export { fetchGoogleBooksPage } from "@/lib/data/ingest/google-books";
export {
  filterCleanEditions,
  loadExistingCatalog,
  upsertWorkGroup,
} from "@/lib/data/ingest/persist";
export type {
  EditionDraft,
  IngestBooksInput,
  IngestBooksResult,
  IngestProgressEvent,
  IngestQuery,
  IngestRejectCounts,
  IngestRejectReason,
  TopicSourceKind,
  TopicSources,
} from "@/lib/data/ingest/types";
export {
  emptyRejectCounts,
  INGEST_REJECT_LABELS,
  INGEST_REJECT_REASONS,
} from "@/lib/data/ingest/types";

/** 元数据可读闸（ingest / enrichment 前共用；勿用 LLM 修乱码） */
export {
  isReadableMetadataField,
  isRepresentativeEligible,
  hasObviousGarbledPlaceholders,
  metadataCorruptionScore,
  passesMetadataQuality,
  pickRepresentativeEdition,
  qualityScore,
} from "@/lib/data/book-quality";
