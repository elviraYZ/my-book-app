import type { SupabaseClient } from "@supabase/supabase-js";

/** 标签来源：正文规则证据 / 检索 seed / LLM enrichment 裁定 */
export type TopicSourceKind = "evidence" | "seed" | "llm";

export type TopicSources = Record<string, TopicSourceKind>;

export type IngestQuery = {
  q: string;
  tags: string[];
  styles?: string[];
};

export type GoogleVolume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    description?: string;
    categories?: string[];
    language?: string;
    averageRating?: number;
    ratingsCount?: number;
    pageCount?: number;
    publishedDate?: string;
    publisher?: string;
    industryIdentifiers?: { type?: string; identifier?: string }[];
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    previewLink?: string;
    infoLink?: string;
  };
};

export type EditionDraft = {
  external_id: string;
  isbn_13: string | null;
  isbn_10: string | null;
  language: string | null;
  title: string;
  description: string;
  cover_url: string;
  publisher: string | null;
  published_date: string | null;
  page_count: number | null;
  rating: number | null;
  ratings_count: number | null;
  preview_url: string | null;
  info_url: string | null;
  author: string;
  tags: string[];
  topic_sources: TopicSources;
  /** 本轮自由概念命中（不入 works.topics taxonomy） */
  concepts?: string[];
  content_style: string[];
  difficulty: "light" | "medium" | "deep";
};

export type IngestRejectReason =
    | "missing_volume"
    | "non_chinese_title"
    | "no_author"
    | "no_cover"
    | "bad_description"
    | "garbled_metadata"
    | "no_evidence"
    | "tag_mismatch"
    | "domain_irrelevant"
    | "context_irrelevant"
    | "external_id_conflict"
    | "isbn_conflict"
    | "already_in_catalog";

export const INGEST_REJECT_REASONS: IngestRejectReason[] = [
  "missing_volume",
  "non_chinese_title",
  "no_author",
  "no_cover",
  "bad_description",
  "garbled_metadata",
  "no_evidence",
  "tag_mismatch",
  "domain_irrelevant",
  "context_irrelevant",
  "external_id_conflict",
  "isbn_conflict",
  "already_in_catalog",
];

export type IngestRejectCounts = Record<IngestRejectReason, number>;

export function emptyRejectCounts(): IngestRejectCounts {
  return {
    missing_volume: 0,
    non_chinese_title: 0,
    no_author: 0,
    no_cover: 0,
    bad_description: 0,
    garbled_metadata: 0,
    no_evidence: 0,
    tag_mismatch: 0,
    domain_irrelevant: 0,
    context_irrelevant: 0,
    external_id_conflict: 0,
    isbn_conflict: 0,
    already_in_catalog: 0,
  };
}

/** 日志用短标签 */
export const INGEST_REJECT_LABELS: Record<IngestRejectReason, string> = {
  missing_volume: "缺volume",
  non_chinese_title: "标题无效",
  no_author: "无作者",
  no_cover: "无封面",
  bad_description: "简介差",
  garbled_metadata: "乱码",
  no_evidence: "无evidence",
  tag_mismatch: "tag不匹配",
  domain_irrelevant: "领域无关",
  context_irrelevant: "需求无关",
  external_id_conflict: "external_id冲突",
  isbn_conflict: "ISBN冲突",
  already_in_catalog: "已在库",
};

export type ExistingIndex = {
  workKeys: Map<string, string>;
  externalIds: Set<string>;
  isbn13s: Set<string>;
};

export type IngestProgressEvent =
  | {
      type: "tag_start";
      tag: string;
      target: number;
      queryCount: number;
    }
  | {
      type: "query_page";
      tag: string;
      query: string;
      /** 0-based 页码 */
      page: number;
      startIndex: number;
      /** Google 本页返回条数（可 < pageSize，不因此停） */
      itemCount: number;
      candidates: number;
      insertedThisPage: number;
      mostlyExisting: boolean;
      /** 本页各丢弃原因计数（不含成功候选） */
      rejectCounts: IngestRejectCounts;
      newForTag: number;
      target: number;
      willContinue: boolean;
      nextPage: number | null;
    }
  | {
      type: "query_stop";
      tag: string;
      query: string;
      page: number;
      reason: "per_tag" | "max_pages" | "empty_items";
      newForTag: number;
      target: number;
    }
  | {
      type: "query_skip";
      tag: string;
      query: string;
      reason: string;
    }
  | {
      type: "tag_done";
      tag: string;
      newForTag: number;
      target: number;
    };

export type IngestBooksInput = {
  queries: IngestQuery[];
  /** 本次每个 tag 需新插入的独立 work 数（不含库内已有） */
  perTag: number;
  /**
   * 要凑满的正式 taxonomy tags（仅 whitelist）。
   * 自由 keywords 不得传入此处。
   */
  tags?: string[];
  /** 当前推荐 Context；用于入库前 context/domain 准入 */
  demand?: import("@/lib/types").StructuredDemandContext;
  maxPagesPerQuery?: number;
  pageSize?: number;
  googleApiKey: string;
  supabase: SupabaseClient;
  onProgress?: (event: IngestProgressEvent) => void;
};

export type IngestBooksResult = {
  newWorksByTag: Record<string, number>;
  newWorksTotal: number;
  editionsAppended: number;
  skippedQueries: string[];
  insertedWorkIds: string[];
};
