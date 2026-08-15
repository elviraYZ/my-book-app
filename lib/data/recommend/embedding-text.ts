import type { StructuredDemandContext } from "@/lib/types";

/** works 表 / enrichment 拼出的 embedding 源 */
export type WorkEmbeddingSource = {
  canonical_title: string;
  display_summary?: string | null;
  topics?: string[] | null;
  primary_topics?: string[] | null;
  content_style?: string[] | null;
  use_cases?: string[] | null;
  concepts?: string[] | null;
  /** 无 display_summary 时用简介兜底 */
  description?: string | null;
};

function summarizeDescription(description: string | null | undefined): string {
  const d = (description ?? "").replace(/\s+/g, " ").trim();
  if (d.length >= 40) return d.slice(0, 220);
  return d;
}

/**
 * Work embedding 源文本：title + summary + primary/topics + style + concepts + use_cases。
 */
export function buildWorkEmbeddingText(work: WorkEmbeddingSource): string {
  const summary =
    work.display_summary?.trim() ||
    summarizeDescription(work.description) ||
    "";
  const primary = (work.primary_topics ?? []).filter(Boolean).join("、");
  const topics = (work.topics ?? []).filter(Boolean).join("、");
  const styles = (work.content_style ?? []).filter(Boolean).join("、");
  const concepts = (work.concepts ?? []).filter(Boolean).join("、");
  const uses = (work.use_cases ?? []).filter(Boolean).join("、");

  return [
    `标题: ${work.canonical_title}`,
    summary ? `摘要: ${summary}` : null,
    primary ? `主题材: ${primary}` : null,
    topics ? `题材: ${topics}` : null,
    styles ? `风格: ${styles}` : null,
    concepts ? `概念: ${concepts}` : null,
    uses ? `适用场景: ${uses}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 本轮需求 → query embedding 文本（只生成一次）。
 */
export function buildQueryEmbeddingText(
  context: StructuredDemandContext,
): string {
  const lines = [
    context.topics.length
      ? `topics: ${context.topics.join(", ")}`
      : null,
    context.keywords.length
      ? `keywords: ${context.keywords.join(", ")}`
      : null,
    context.goal ? `goal: ${context.goal}` : null,
    context.styles.length
      ? `styles: ${context.styles.join(", ")}`
      : null,
    context.difficulty ? `difficulty: ${context.difficulty}` : null,
    context.time ? `time: ${context.time}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Cosine similarity → Match 用 semantic 分：连续值，不做 bucket。
 * 有证据时直接用 [0,1] 的 similarity；missing 由调用方不传此维，勿在此用 0.05 冒充。
 */
export function normalizeSemanticSimilarity(similarity: number): number {
  if (!Number.isFinite(similarity)) return 0;
  return Math.min(1, Math.max(0, similarity));
}
