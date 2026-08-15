/**
 * Work 元数据 enrichment：topics / primary_topics / concepts / use_cases /
 * display_summary / content_style / difficulty。
 * concepts ≠ use_cases（后者仅为阅读目的枚举）。
 */

import {
  classifyContentStyles,
  classifyGenreTags,
  filterWhitelistTags,
  isGenreTag,
  pickPrimaryTopics,
  type GenreTag,
} from "@/lib/data/book-tags";
import type { TopicSources } from "@/lib/data/ingest/types";
import { GOAL_OPTIONS } from "@/lib/data/recommend-tags";
import type { Book, ContentStyle, ReadingDepth } from "@/lib/types";

export const USE_CASE_WHITELIST = GOAL_OPTIONS;
const USE_CASE_SET = new Set<string>(USE_CASE_WHITELIST);

/** 自由概念证据（非 taxonomy；命中则写入 concepts） */
const CONCEPT_EVIDENCE: { concept: string; patterns: RegExp[] }[] = [
  { concept: "UX", patterns: [/\bUX\b/i, /用户体验/, /user\s*experience/i] },
  { concept: "UI", patterns: [/\bUI\b/i, /界面设计/, /user\s*interface/i] },
  { concept: "HCI", patterns: [/\bHCI\b/i, /人机交互/] },
  { concept: "可用性", patterns: [/可用性/, /usability/i] },
  { concept: "信息架构", patterns: [/信息架构/, /information\s*architecture/i] },
  { concept: "交互设计", patterns: [/交互设计/, /interaction\s*design/i] },
  { concept: "心流", patterns: [/心流/, /\bflow\s*state\b/i] },
  { concept: "玩家动机", patterns: [/玩家动机/, /player\s*motivation/i] },
  { concept: "反馈循环", patterns: [/反馈循环/, /feedback\s*loop/i] },
  { concept: "核心循环", patterns: [/核心循环/, /core\s*loop/i] },
  { concept: "进度系统", patterns: [/进度系统/, /progression/i] },
  { concept: "平衡性", patterns: [/数值平衡/, /game\s*balance/i, /平衡性/] },
  { concept: "涌现玩法", patterns: [/涌现/, /emergence/i] },
  { concept: "MDA", patterns: [/\bMDA\b/] },
  { concept: "空间叙事", patterns: [/空间叙事/, /environmental\s*storytelling/i] },
  { concept: "引导设计", patterns: [/引导设计/, /wayfinding/i, /寻路/] },
  { concept: "情感化设计", patterns: [/情感化设计/, /emotional\s*design/i] },
  { concept: "设计模式", patterns: [/设计模式/, /design\s*pattern/i] },
  { concept: "服务设计", patterns: [/服务设计/, /service\s*design/i] },
  { concept: "产品策略", patterns: [/产品策略/, /product\s*strategy/i] },
  { concept: "敏捷", patterns: [/敏捷开发/, /\bagile\b/i, /Scrum/i] },
  { concept: "着色器", patterns: [/着色器/, /\bshader\b/i] },
  { concept: "实时渲染", patterns: [/实时渲染/, /real[- ]?time\s*rendering/i] },
  { concept: "机器学习", patterns: [/机器学习/, /machine\s*learning/i] },
  { concept: "神经网络", patterns: [/神经网络/, /neural\s*network/i] },
];

export type WorkEnrichmentInput = {
  title: string;
  description?: string | null;
  /** 旧 topics（仅作 seed 参考；全量校正以正文 evidence 为准） */
  previousTopics?: string[] | null;
  previousStyles?: string[] | null;
  previousUseCases?: string[] | null;
  previousConcepts?: string[] | null;
  previousDisplaySummary?: string | null;
  pageCount?: number | null;
  readingMinutes?: number | null;
  /** true：忽略已有 display_summary / use_cases，强制重算 */
  force?: boolean;
};

export type WorkEnrichmentResult = {
  topics: GenreTag[];
  /** rule evidence / seed / llm enrichment */
  topic_sources: TopicSources;
  primary_topics: GenreTag[];
  content_style: ContentStyle[];
  difficulty: ReadingDepth;
  display_summary: string;
  use_cases: string[];
  concepts: string[];
};

export function filterUseCases(
  values: string[] | null | undefined,
): string[] {
  const out: string[] = [];
  for (const raw of values ?? []) {
    const t = raw.trim();
    if (!t || !USE_CASE_SET.has(t) || out.includes(t)) continue;
    out.push(t);
    if (out.length >= 4) break;
  }
  return out;
}

/** 从旧 use_cases 里拆出误存的自由概念 */
export function splitLegacyUseCases(values: string[] | null | undefined): {
  use_cases: string[];
  orphanConcepts: string[];
} {
  const use_cases: string[] = [];
  const orphanConcepts: string[] = [];
  for (const raw of values ?? []) {
    const t = raw.trim();
    if (!t) continue;
    if (USE_CASE_SET.has(t)) {
      if (!use_cases.includes(t)) use_cases.push(t);
    } else if (!isGenreTag(t) && !orphanConcepts.includes(t)) {
      orphanConcepts.push(t);
    }
  }
  return {
    use_cases: use_cases.slice(0, 4),
    orphanConcepts: orphanConcepts.slice(0, 16),
  };
}

export function extractConceptsFromText(
  title: string,
  description?: string | null,
): string[] {
  const blob = `${title}\n${description ?? ""}`;
  const out: string[] = [];
  for (const { concept, patterns } of CONCEPT_EVIDENCE) {
    if (isGenreTag(concept)) continue;
    if (patterns.some((re) => re.test(blob)) && !out.includes(concept)) {
      out.push(concept);
    }
  }
  return out.slice(0, 16);
}

export function mergeConcepts(...lists: (string[] | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list ?? []) {
      const t = raw.trim();
      if (!t || isGenreTag(t) || USE_CASE_SET.has(t) || out.includes(t)) continue;
      out.push(t);
      if (out.length >= 16) return out;
    }
  }
  return out;
}

export function inferDifficultyFromMeta(input: {
  pageCount?: number | null;
  readingMinutes?: number | null;
  description?: string | null;
}): ReadingDepth {
  const pageCount = input.pageCount;
  if (pageCount != null && pageCount > 0) {
    if (pageCount <= 180) return "light";
    if (pageCount <= 360) return "medium";
    return "deep";
  }
  const minutes = input.readingMinutes;
  if (minutes != null && minutes > 0) {
    if (minutes <= 20) return "light";
    if (minutes <= 45) return "medium";
    return "deep";
  }
  const len = (input.description ?? "").length;
  if (len < 400) return "light";
  if (len < 1200) return "medium";
  return "deep";
}

export function buildDisplaySummary(input: {
  title: string;
  description?: string | null;
  topics: string[];
  existing?: string | null;
  force?: boolean;
}): string {
  const existing = input.existing?.trim();
  if (!input.force && existing && existing.length >= 20) {
    return existing.slice(0, 280);
  }

  const desc = (input.description ?? "").replace(/\s+/g, " ").trim();
  if (desc.length >= 40) return desc.slice(0, 220);

  const tags = input.topics.slice(0, 3).join("、");
  return tags
    ? `《${input.title}》围绕${tags}展开，适合对照当前需求快速浏览。`
    : `《${input.title}》可作为当前主题的参考读物。`;
}

/**
 * 从风格 / 难度 / 文案推断阅读适用场景（枚举）。
 * force 时忽略已有 use_cases（避免历史 concepts 污染）。
 */
export function inferUseCases(
  book: Pick<
    Book,
    | "title"
    | "display_summary"
    | "description"
    | "tags"
    | "content_style"
    | "difficulty"
    | "use_cases"
  >,
  options?: { force?: boolean },
): string[] {
  if (!options?.force) {
    const existing = filterUseCases(book.use_cases);
    if (existing.length > 0) return existing;
  }

  const blob = `${book.title} ${book.display_summary ?? ""} ${book.description ?? ""} ${book.tags.join(" ")}`;
  const styles = book.content_style ?? [];
  const out = new Set<string>();

  if (styles.includes("case") || /案例|实践|手册/.test(blob)) {
    out.add("工作调研");
    out.add("找灵感");
  }
  if (styles.includes("method") || /方法|指南|教程|how to/i.test(blob)) {
    out.add("快速入门");
    out.add("工作调研");
  }
  if (styles.includes("theory") || /理论|原理|框架/.test(blob)) {
    out.add("系统学习");
  }
  if (styles.includes("inspiration") || /灵感|叙事|科幻|神话/.test(blob)) {
    out.add("找灵感");
    out.add("休闲阅读");
  }
  if (book.difficulty === "light") out.add("快速入门");
  if (book.difficulty === "deep") out.add("系统学习");

  if (out.size === 0) {
    out.add("工作调研");
    out.add("系统学习");
  }
  return [...out].filter((x) => USE_CASE_SET.has(x)).slice(0, 4);
}

/** 规则全量 enrichment（落库 / 脚本 / 内存评分共用） */
export function enrichWorkMetadata(
  input: WorkEnrichmentInput,
): WorkEnrichmentResult {
  const title = input.title;
  const description = input.description ?? null;
  const force = input.force === true;

  // 全量校正：以正文 evidence 为准；旧 topics 仅当正文也有证据时保留
  const fromText = classifyGenreTags(title, description);
  const fromPrev = filterWhitelistTags(input.previousTopics).filter((t) =>
    fromText.includes(t),
  );
  const topics = filterWhitelistTags([...fromText, ...fromPrev]);
  const topic_sources: TopicSources = {};
  for (const t of topics) topic_sources[t] = "evidence";
  const primary_topics = pickPrimaryTopics(topics);

  const content_style = classifyContentStyles(
    title,
    description,
    topics,
    input.previousStyles ?? undefined,
    { preferSeed: false },
  ) as ContentStyle[];

  const difficulty = inferDifficultyFromMeta({
    pageCount: input.pageCount,
    readingMinutes: input.readingMinutes,
    description,
  });

  const display_summary = buildDisplaySummary({
    title,
    description,
    topics,
    existing: input.previousDisplaySummary,
    force,
  });

  const legacy = splitLegacyUseCases(input.previousUseCases);
  const use_cases = inferUseCases(
    {
      title,
      description,
      display_summary,
      tags: topics,
      content_style,
      difficulty,
      use_cases: force ? [] : legacy.use_cases,
    },
    { force },
  );

  const concepts = mergeConcepts(
    extractConceptsFromText(title, description),
    input.previousConcepts,
    legacy.orphanConcepts,
  );

  return {
    topics,
    topic_sources,
    primary_topics,
    content_style,
    difficulty,
    display_summary,
    use_cases,
    concepts,
  };
}

/**
 * 规则建议 topics + LLM 在完整 whitelist 上裁定最终 topics / primary / concepts。
 * LLM 失败时保留规则结果；topic_sources 区分 evidence vs llm。
 */
export async function enrichWorkMetadataWithLlm(
  input: WorkEnrichmentInput,
): Promise<WorkEnrichmentResult & { llmSource: "llm" | "rules" }> {
  const base = enrichWorkMetadata(input);
  const { enrichTopicsWithLlm } = await import(
    "@/lib/data/work-enrichment-llm"
  );
  const llm = await enrichTopicsWithLlm({
    title: input.title,
    description: input.description,
    ruleTopics: base.topics,
    fallbackSummary: base.display_summary,
    fallbackConcepts: base.concepts,
  });

  // 用最终 topics 再推一轮 style / use_cases
  const content_style = classifyContentStyles(
    input.title,
    input.description,
    llm.topics,
    undefined,
    { preferSeed: false },
  ) as ContentStyle[];

  const use_cases = inferUseCases(
    {
      title: input.title,
      description: input.description,
      display_summary: llm.display_summary ?? base.display_summary,
      tags: llm.topics,
      content_style,
      difficulty: base.difficulty,
      use_cases: [],
    },
    { force: true },
  );

  return {
    ...base,
    topics: llm.topics,
    topic_sources: llm.topic_sources,
    primary_topics: llm.primary_topics,
    content_style,
    concepts: llm.concepts,
    display_summary: llm.display_summary ?? base.display_summary,
    use_cases,
    llmSource: llm.source,
  };
}
