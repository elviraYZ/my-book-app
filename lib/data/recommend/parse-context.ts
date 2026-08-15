import {
  clampGoals,
  clampKeywords,
  clampPreferences,
  clampThemes,
  extractCoreConditionsFromText,
} from "@/lib/data/recommend-tags";
import type {
  ReadingDepth,
  RecommendRequest,
  StructuredDemandContext,
} from "@/lib/types";

const EXCLUSION_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /不要英文|不要英语|拒英文|非英文/, label: "英文" },
  { re: /不要小说|拒小说|别推小说/, label: "小说" },
];

function inferExclusions(text: string, styles: string[]): string[] {
  const out: string[] = [];
  for (const { re, label } of EXCLUSION_PATTERNS) {
    if (re.test(text)) out.push(label);
  }
  if (styles.includes("少理论") && !out.includes("重理论")) {
    out.push("重理论");
  }
  return out;
}

/** 内部用：topics + keywords → searchQueries（不展示给用户） */
export function buildSearchQueriesFromDemand(
  topics: string[],
  keywords: string[],
  styles: string[],
): string[] {
  const queries: string[] = [];
  const push = (q: string) => {
    const t = q.trim();
    if (t && !queries.includes(t) && queries.length < 6) queries.push(t);
  };

  const focus = [...keywords, ...topics].slice(0, 4);
  if (focus.length >= 2) push(focus.slice(0, 2).join(" "));
  for (const t of topics.slice(0, 2)) push(t);
  for (const k of keywords.slice(0, 3)) push(k);
  if (topics[0] && keywords[0]) push(`${topics[0]} ${keywords[0]}`);
  if (topics[0] && styles[0] && styles[0] !== "少理论") {
    push(`${topics[0]} ${styles[0]}`);
  }

  const en: Record<string, string> = {
    关卡设计: "level design",
    空间引导: "wayfinding spatial design",
    玩家体验: "player experience",
    玩家导航: "player navigation wayfinding",
    游戏设计: "game design",
    森林: "forest level design",
    地标: "landmark wayfinding",
    建筑: "architecture wayfinding",
    美术: "game art",
    编程: "game programming",
    人工智能: "game AI",
    叙事: "narrative design",
  };
  for (const t of [...topics, ...keywords].slice(0, 3)) {
    if (en[t]) push(en[t]);
  }

  return queries;
}

/**
 * 规则解析 StructuredDemandContext。
 * topics = 白名单；keywords = 本次关注；searchQueries 内部生成。
 */
export function parseDemandContext(
  text: string,
  input: RecommendRequest,
): StructuredDemandContext {
  const extracted = extractCoreConditionsFromText(text);

  const topics =
    input.themes !== undefined
      ? clampThemes(input.themes)
      : extracted.themes;

  const keywords =
    input.keywords !== undefined
      ? clampKeywords(input.keywords)
      : clampKeywords(extracted.keywords);

  const styles =
    input.preferences !== undefined
      ? clampPreferences(input.preferences).filter((p) => !topics.includes(p))
      : extracted.preferences.filter((p) => !topics.includes(p));

  const difficulty: ReadingDepth | null =
    input.depth !== undefined
      ? input.depth
      : (extracted.depth ?? input.profile?.reading_depth ?? null);

  const time =
    input.session_bucket !== undefined
      ? input.session_bucket
      : extracted.session_bucket;

  const goals =
    input.goals !== undefined
      ? clampGoals(input.goals)
      : input.goal !== undefined
        ? clampGoals(input.goal.trim() ? [input.goal.trim()] : [])
        : clampGoals(extracted.goals);
  const goal = goals[0] ?? "";

  const exclusions = inferExclusions(text, styles);
  let finalKeywords = keywords;
  // 不整句 seed；无 keywords 时留给 LLM / searchQueries 用 topics

  const searchQueries = buildSearchQueriesFromDemand(
    topics,
    finalKeywords,
    styles,
  );

  const intentConfidence =
    topics.length === 0 && finalKeywords.length > 0 && text.trim().length <= 8
      ? 0.25
      : topics.length > 0 || (extracted.goal && styles.length > 0)
        ? 0.7
        : 0.4;

  return {
    topics,
    keywords: finalKeywords,
    goal,
    goals,
    styles,
    difficulty,
    time,
    exclusions,
    searchQueries:
      searchQueries.length > 0
        ? searchQueries
        : finalKeywords.slice(0, 3).length > 0
          ? finalKeywords.slice(0, 3)
          : ["reading"],
    intentConfidence,
  };
}
