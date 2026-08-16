/**
 * 将 demand 拆成 explicit（用户原话/手选可证实）与 inferred（LLM/Profile 补全）。
 * 宽短 query：评分用字段只保留 explicit，避免补全把「游戏设计」撑成窄需求。
 */

import {
  CONTEXT_SPECIFICITY,
} from "@/lib/data/recommend/weights";
import {
  maskNegativeSpans,
  mergeNegativeConstraints,
  stripExcludedFromTopics,
} from "@/lib/data/recommend/negative-constraints";
import { buildSearchQueriesFromDemand } from "@/lib/data/recommend/parse-context";
import {
  clampGoals,
  clampKeywords,
  clampPreferences,
  clampThemes,
  extractCoreConditionsFromText,
} from "@/lib/data/recommend-tags";
import type { RecommendRequest, StructuredDemandContext } from "@/lib/types";

function uniq(items: string[]): string[] {
  const out: string[] = [];
  for (const x of items) {
    if (x && !out.includes(x)) out.push(x);
  }
  return out;
}

const BROAD = new Set<string>(CONTEXT_SPECIFICITY.broadTopics);

function goalsMentionedInText(text: string): string[] {
  return clampGoals(extractCoreConditionsFromText(text).goals ?? []);
}

function stylesMentionedInText(text: string): string[] {
  const extracted = extractCoreConditionsFromText(text);
  return clampPreferences(extracted.preferences ?? []);
}

/**
 * 用户明确说出 / 手选的宽短题材查询（如「游戏设计」「我想了解游戏美术」）。
 */
export function isBroadExplicitQuery(
  text: string,
  explicitTopics: string[],
  explicitKeywords: string[],
  explicitGoal: string,
  explicitStyles: string[],
): boolean {
  const t = text.trim();
  if (!t) return false;
  if (explicitGoal || explicitStyles.length > 0) return false;
  if (explicitKeywords.length >= 2) return false;

  const onlyBroadTopics =
    explicitTopics.length >= 1 &&
    explicitTopics.length <= 2 &&
    explicitTopics.every((x) => BROAD.has(x));

  if (!onlyBroadTopics) return false;

  // 无细分子句，或整句很短
  const hasDetailClause =
    /如何|怎样|通过|重点|尤其|希望|不要|除了|排除|避免|不是|案例|理论|地标|路径|机制/.test(t);
  if (hasDetailClause) return false;

  return explicitKeywords.length === 0 || t.length <= 24;
}

/**
 * 在最终 demand 上挂载 explicit / inferred 分区。
 * 宽短 query：topics/keywords/goal/styles 评分面只保留 explicit。
 */
export function attachExplicitInferredPartitions(
  promptText: string,
  demand: StructuredDemandContext,
  input: RecommendRequest,
): StructuredDemandContext {
  const text = promptText.trim();
  const extracted = extractCoreConditionsFromText(text);
  const negatives = mergeNegativeConstraints(
    {
      excludedTopics: extracted.excludedTopics,
      excludedKeywords: extracted.excludedKeywords,
      excludedConcepts: extracted.excludedConcepts,
    },
    {
      excludedTopics: demand.excludedTopics,
      excludedKeywords: demand.excludedKeywords,
      excludedConcepts: demand.excludedConcepts,
    },
  );
  const positiveText = maskNegativeSpans(text);

  const manualTopics =
    input.themes !== undefined ? clampThemes(input.themes) : [];
  const manualKeywords =
    input.keywords !== undefined ? clampKeywords(input.keywords) : [];
  const manualStyles =
    input.preferences !== undefined
      ? clampPreferences(input.preferences)
      : [];

  // 只承认正向文本中出现的题材；否定片段里的词进 excludedTopics
  let explicitTopics = uniq([
    ...manualTopics,
    ...extracted.themes,
    ...demand.topics.filter((t) => positiveText.includes(t)),
  ]);
  explicitTopics = stripExcludedFromTopics(
    clampThemes(explicitTopics),
    negatives.excludedTopics,
  );

  const banKw = new Set([
    ...negatives.excludedTopics,
    ...negatives.excludedKeywords,
    ...negatives.excludedConcepts,
  ]);

  let explicitKeywords = uniq([
    ...manualKeywords,
    ...extracted.keywords,
    ...demand.keywords.filter(
      (k) =>
        positiveText.includes(k) ||
        k === positiveText ||
        positiveText.includes(k.slice(0, 2)),
    ),
  ]).filter((k) => !banKw.has(k));
  explicitKeywords = clampKeywords(
    explicitKeywords.filter((k) => !explicitTopics.includes(k) && !BROAD.has(k)),
  );

  const inferredTopics = stripExcludedFromTopics(
    clampThemes(demand.topics.filter((t) => !explicitTopics.includes(t))),
    negatives.excludedTopics,
  );
  const inferredKeywords = clampKeywords(
    demand.keywords.filter(
      (k) => !explicitKeywords.includes(k) && !banKw.has(k),
    ),
  );

  const manualGoals = clampGoals(
    input.goals !== undefined
      ? input.goals
      : input.goal?.trim()
        ? [input.goal.trim()]
        : [],
  );
  const textGoals = goalsMentionedInText(text);
  const explicitGoals =
    input.goals !== undefined || input.goal !== undefined
      ? manualGoals
      : clampGoals([...manualGoals, ...textGoals]);
  const explicitGoal = explicitGoals[0] ?? "";

  const textStyles = stylesMentionedInText(text);
  const explicitStyles =
    input.preferences !== undefined
      ? manualStyles
      : uniq([...manualStyles, ...textStyles]);

  const broad = isBroadExplicitQuery(
    text,
    explicitTopics,
    explicitKeywords,
    explicitGoal,
    explicitStyles,
  );

  if (broad) {
    const topics =
      explicitTopics.length > 0 ? explicitTopics : demand.topics.slice(0, 1);
    const searchQueries = buildSearchQueriesFromDemand(
      topics,
      explicitKeywords,
      [],
    );
    return {
      ...demand,
      topics,
      keywords: explicitKeywords,
      explicitTopics: topics,
      inferredTopics,
      explicitKeywords,
      inferredKeywords,
      goal: explicitGoal,
      goals: explicitGoals,
      styles: explicitStyles,
      difficulty:
        input.depth !== undefined && input.depth !== null
          ? input.depth
          : extracted.depth ?? null,
      time:
        input.session_bucket !== undefined && input.session_bucket !== null
          ? input.session_bucket
          : extracted.session_bucket ?? null,
      ...negatives,
      searchQueries:
        searchQueries.length > 0 ? searchQueries : topics.slice(0, 2),
      intentConfidence: Math.min(demand.intentConfidence ?? 0.45, 0.5),
    };
  }

  const topics = uniq([...explicitTopics, ...inferredTopics]);
  const keywords = uniq([...explicitKeywords, ...inferredKeywords]);

  return {
    ...demand,
    topics,
    keywords,
    explicitTopics,
    inferredTopics,
    explicitKeywords,
    inferredKeywords,
    goal: explicitGoal,
    goals: explicitGoals,
    styles: explicitStyles,
    ...negatives,
  };
}
