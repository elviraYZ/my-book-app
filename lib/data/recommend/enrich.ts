import {
  classifyContentStyles,
  classifyGenreTags,
  filterWhitelistTags,
} from "@/lib/data/book-tags";
import {
  buildDisplaySummary,
  enrichWorkMetadata,
  inferUseCases as inferUseCasesCore,
} from "@/lib/data/work-enrichment";
import type { Book, ContentStyle, ReadingDepth } from "@/lib/types";

function inferDifficultyFromBook(book: Book): ReadingDepth {
  if (
    book.difficulty === "light" ||
    book.difficulty === "medium" ||
    book.difficulty === "deep"
  ) {
    return book.difficulty;
  }
  const minutes = book.reading_minutes;
  if (minutes != null) {
    if (minutes <= 20) return "light";
    if (minutes <= 45) return "medium";
    return "deep";
  }
  const len = (book.description ?? "").length;
  if (len < 400) return "light";
  if (len < 1200) return "medium";
  return "deep";
}

/**
 * 从风格 / 难度 / 文案推断适用场景（enrichment）。
 * 仅返回阅读目的枚举，不含自由 concepts。
 */
export function inferUseCases(book: Book, options?: { force?: boolean }): string[] {
  return inferUseCasesCore(book, options);
}

/**
 * 正式进入候选池前的 enrichment。
 * 保证至少有可用的 topics / difficulty / style / displaySummary / useCases / concepts，
 * 避免新抓书裸数据参与统一评分而天然吃亏。
 * MVP：主要内存补齐；全量落库见 scripts/enrich-works.ts。
 */
export function enrichBookForScoring(book: Book): Book {
  const enriched = enrichWorkMetadata({
    title: book.title,
    description: book.description,
    previousTopics: book.tags,
    previousStyles: book.content_style,
    previousUseCases: book.use_cases,
    previousConcepts: book.concepts,
    previousDisplaySummary: book.display_summary,
    readingMinutes: book.reading_minutes,
    force: false,
  });

  // 若库内已有 whitelist topics，优先保留并与正文合并；空则用正文
  let tags = filterWhitelistTags(book.tags);
  if (tags.length === 0) {
    tags = classifyGenreTags(book.title, book.description);
  } else {
    tags = enriched.topics.length > 0 ? enriched.topics : tags;
  }

  let content_style = book.content_style ?? [];
  if (content_style.length === 0) {
    content_style = classifyContentStyles(
      book.title,
      book.description,
      tags,
    ) as ContentStyle[];
  }

  const difficulty = inferDifficultyFromBook({
    ...book,
    tags,
    content_style,
  });

  const withMeta: Book = {
    ...book,
    tags,
    primary_topics:
      book.primary_topics && book.primary_topics.length > 0
        ? book.primary_topics
        : enriched.primary_topics,
    content_style,
    difficulty,
  };

  const display_summary =
    book.display_summary?.trim() && book.display_summary.trim().length >= 20
      ? book.display_summary
      : buildDisplaySummary({
          title: withMeta.title,
          description: withMeta.description,
          topics: withMeta.tags,
          existing: book.display_summary,
        });

  const use_cases = inferUseCases({ ...withMeta, display_summary });
  const concepts =
    book.concepts && book.concepts.length > 0
      ? book.concepts
      : enriched.concepts;

  return {
    ...withMeta,
    display_summary,
    use_cases,
    concepts,
  };
}

export function enrichBooksForScoring(books: Book[]): Book[] {
  return books.map(enrichBookForScoring);
}
