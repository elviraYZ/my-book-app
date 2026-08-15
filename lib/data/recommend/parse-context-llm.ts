import { hasLlmProvider } from "@/lib/ai/config";
import { completeJson } from "@/lib/ai/llm";
import { GENRE_TAG_WHITELIST } from "@/lib/data/book-tags";
import { attachExplicitInferredPartitions } from "@/lib/data/recommend/context-partition";
import { mapInterestsToBookTags } from "@/lib/data/interest-map";
import { bumpContextLlmCall } from "@/lib/data/recommend/dev-timing";
import {
  buildSearchQueriesFromDemand,
  parseDemandContext,
} from "@/lib/data/recommend/parse-context";
import {
  clampGoals,
  clampKeywords,
  clampPreferences,
  clampThemes,
  extractCoreConditionsFromText,
  PREFERENCE_OPTIONS,
} from "@/lib/data/recommend-tags";
import type {
  ReadingDepth,
  RecommendRequest,
  StructuredDemandContext,
} from "@/lib/types";

export type DemandParseSource = "llm" | "rules";

export type ParseDemandResult = {
  demand: StructuredDemandContext;
  source: DemandParseSource;
};

const ALLOWED_GOALS = [
  "工作调研",
  "系统学习",
  "找灵感",
  "快速入门",
  "休闲阅读",
] as const;

const ALLOWED_TIME = new Set(["15", "30", "60", "90"]);
const ALLOWED_DEPTH = new Set<ReadingDepth>(["light", "medium", "deep"]);
const TAXONOMY = new Set<string>(GENRE_TAG_WHITELIST);

const SYSTEM_PROMPT = `你是阅读需求解析器。产品用户均为游戏行业从业者。只提取结构化 Context，供本地书库召回与评分。

硬性规则：
1. 只输出一个 JSON 对象，不要 markdown，不要解释。
2. 不要推荐书、不要排序、不要写推荐理由、不要输出书名列表。
3. 字段必须是且仅是：
{
  "topics": string[],
  "keywords": string[],
  "goal": string | null,
  "styles": string[],
  "difficulty": "light" | "medium" | "deep" | null,
  "time": "15" | "30" | "60" | "90" | null,
  "exclusions": string[],
  "intentConfidence": number
}
4. topics：只能来自正式题材 taxonomy（关卡设计、游戏设计、建筑、美术、编程、叙事…）。0–3 个。
   - 用户话里能映射到 taxonomy 的，必须填。
   - 【宽短 query】若用户只说「游戏设计」「游戏美术」「玩家心理」「叙事」等单个宽题材（或「我想了解X」且无更多约束）：
     topics 只填该宽题材 1 个；keywords 必须 []；goal/styles/difficulty/time 必须 null/[]。
     禁止顺带补「叙事」「美术设定」「工作调研」「理论优先」等。
   - 具体对象/场景（森林、狗狗、空间引导）放 keywords，不要当 topics。
5. keywords：仅用户原话里出现的具体关注。不要为宽题材主动展开一长串同义词。
   - 例外：极短非题材词（如「狗狗」）可在游戏语境下展开少量 keywords。
6. goal：仅用户明确表达阅读目的时填写枚举（工作调研/系统学习/找灵感/快速入门/休闲阅读）。
   「我想了解 / 想知道 / 帮我看看」只是开口语，不是目标 → 必须 null。
   未说明必须 null（不要用画像猜，禁止默认工作调研）。
7. styles：仅用户明确表达（案例优先/理论优先/少理论/跨领域/实操）；未提及必须 []。
8. difficulty / time：未提及则 null。
9. exclusions：明确不要的；未提及则 []。
10. intentConfidence：0–1。宽短题材宜 ≤0.45；信息充分 0.7–1。
11. 不要输出 searchQueries / books / recommendations / ranking。
12. 画像不得压过用户本轮明确说的题材与偏好；明确手选条件必须尊重。
13. 区分：用户没说的内容不要写进 topics/keywords/goal/styles（后续系统会标为 inferred；宽 query 会直接丢掉）。`;

function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t || out.includes(t)) continue;
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/** 未明确时返回空串，禁止默认「工作调研」 */
function normalizeGoal(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw !== "string") return "";
  const t = raw.trim();
  if (!t || t === "null" || t === "undefined") return "";
  if ((ALLOWED_GOALS as readonly string[]).includes(t)) return t;
  if (/调研|查资料/.test(t)) return "工作调研";
  if (/系统|深入学/.test(t)) return "系统学习";
  if (/灵感|创意/.test(t)) return "找灵感";
  if (/入门|上手|快速/.test(t)) return "快速入门";
  if (/休闲|放松/.test(t)) return "休闲阅读";
  return "";
}

function normalizeIntentConfidence(raw: unknown, promptText: string): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(1, Math.max(0, raw));
  }
  return estimateIntentConfidence(promptText);
}

/** 极短/单片段需求：置信度低；有题材词时略抬高 */
export function estimateIntentConfidence(text: string): number {
  const t = text.trim();
  if (!t) return 0.1;
  const hasTaxonomy = extractCoreConditionsFromText(t).themes.length > 0;
  if (t.length <= 4) return hasTaxonomy ? 0.55 : 0.2;
  if (t.length <= 8 && !/[，。,.、；;：:\s]/.test(t)) {
    return hasTaxonomy ? 0.65 : 0.3;
  }
  if (t.length <= 16 && !/[，。,.、]/.test(t)) {
    return hasTaxonomy ? 0.7 : 0.5;
  }
  return hasTaxonomy ? 0.85 : 0.75;
}

/**
 * 短/模糊需求：在游戏行业内结合画像做有限度补全。
 * 不脱离游戏创作场景；最终排序仍受 contextRelevanceGate 约束。
 */
export function enrichAmbiguousDemandWithProfile(
  text: string,
  base: Omit<StructuredDemandContext, "searchQueries" | "intentConfidence">,
  input: RecommendRequest,
): Omit<StructuredDemandContext, "searchQueries" | "intentConfidence"> {
  const profile = input.profile;
  const interestTags = mapInterestsToBookTags(profile?.interests ?? []);
  const rolesBlob = (profile?.roles ?? []).join(" ");
  const interestsBlob = (profile?.interests ?? []).join(" ");
  const purposeBlob = (profile?.reading_purposes ?? []).join(" ");
  const profileBlob = `${rolesBlob} ${interestsBlob} ${purposeBlob}`;

  let topics = [...base.topics];
  let keywords = [...base.keywords];
  let goal = base.goal;
  let styles = [...base.styles];

  // 不把原文 seed 成 keyword；动物类等补全仍可加短标签
  // 动物/生物类模糊词 → 游戏创作向 keywords
  if (/狗|犬|猫|狼|动物|宠|兽|creature|animal/i.test(text)) {
    const extras = ["动物角色", "动物设定", "生物设计"];
    if (/宠|狗|猫|犬/.test(text)) extras.push("宠物系统");
    if (/美术|原画|设定|角色|画/.test(profileBlob) || interestTags.includes("美术")) {
      extras.push("角色设计", "概念设定");
    }
    if (/程序|玩法|系统|策划|设计/.test(profileBlob)) {
      extras.push("宠物玩法");
    }
    for (const k of extras) {
      if (!keywords.includes(k)) keywords.push(k);
    }
  }

  // 画像 → 有限 topics（仅白名单）
  if (topics.length === 0 && input.themes === undefined) {
    const preferred: string[] = [];
    if (
      interestTags.includes("美术") ||
      /美术|原画|设定|角色设计/.test(profileBlob)
    ) {
      preferred.push("美术");
    }
    if (
      interestTags.includes("游戏设计") ||
      interestTags.includes("关卡设计") ||
      /策划|玩法|系统/.test(profileBlob)
    ) {
      preferred.push("游戏设计");
    }
    if (interestTags.includes("叙事") || /叙事|剧情/.test(profileBlob)) {
      preferred.push("叙事");
    }
    if (preferred.length === 0 && interestTags.length > 0) {
      preferred.push(...interestTags.slice(0, 2));
    }
    if (preferred.length === 0) {
      preferred.push("游戏设计");
    }
    topics = clampThemes(preferred).slice(0, 2);
  }

  if (!goal && input.goal === undefined) {
    // 用户未选手动目标：不要用画像猜「工作调研/找灵感」
    goal = "";
  }

  if (styles.length === 0 && input.preferences === undefined) {
    // 用户未选手动偏好：不要用画像猜
    styles = [];
  }

  keywords = clampKeywords(keywords);
  topics = clampThemes(topics);
  styles = clampPreferences(styles).filter((s) => !topics.includes(s));

  return {
    ...base,
    topics: input.themes !== undefined ? base.topics : topics,
    keywords: input.keywords !== undefined ? base.keywords : keywords,
    goal: input.goal?.trim() ? base.goal : goal,
    styles: input.preferences !== undefined ? base.styles : styles,
  };
}

/**
 * 有题材证据则保留；极短无题材证据则走画像领域补全（不做空白 keywords-only）。
 */
function stripInferredContextForAmbiguousPrompt(
  text: string,
  base: Omit<StructuredDemandContext, "searchQueries" | "intentConfidence">,
  input: RecommendRequest,
): Omit<StructuredDemandContext, "searchQueries" | "intentConfidence"> {
  const extracted = extractCoreConditionsFromText(text);
  const groundedTopics = clampThemes([
    ...base.topics,
    ...extracted.themes,
  ]);
  const hasTaxonomySignal = groundedTopics.length > 0;

  const t = text.trim();
  const veryShortAmbiguous =
    t.length > 0 &&
    t.length <= 6 &&
    !/[，。,.、；;：:]/.test(t) &&
    !hasTaxonomySignal;

  if (!veryShortAmbiguous) {
    return {
      ...base,
      topics:
        input.themes !== undefined
          ? base.topics
          : groundedTopics.length > 0
            ? groundedTopics
            : base.topics,
    };
  }

  // 短模糊：游戏行业内 + 画像补全
  return enrichAmbiguousDemandWithProfile(text, base, input);
}

function normalizeDifficulty(raw: unknown): ReadingDepth | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (ALLOWED_DEPTH.has(t as ReadingDepth)) return t as ReadingDepth;
  if (/入门|轻松|light/.test(t)) return "light";
  if (/深入|硬核|deep/.test(t)) return "deep";
  if (/中等|认真|medium/.test(t)) return "medium";
  return null;
}

function normalizeTime(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.round(raw);
    if (n <= 15) return "15";
    if (n <= 30) return "30";
    if (n <= 60) return "60";
    return "90";
  }
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (ALLOWED_TIME.has(t)) return t;
  if (/15/.test(t)) return "15";
  if (/30/.test(t)) return "30";
  if (/60|一小时/.test(t)) return "60";
  if (/90|不限|长/.test(t)) return "90";
  return null;
}

/** topics 只保留白名单；其余挪到 keywords */
function splitTopicsAndKeywords(
  rawTopics: unknown,
  rawKeywords: unknown,
): { topics: string[]; keywords: string[] } {
  const topics: string[] = [];
  const keywords: string[] = [];
  const pushTopic = (t: string) => {
    if (TAXONOMY.has(t) && !topics.includes(t) && topics.length < 3) {
      topics.push(t);
    }
  };
  const pushKw = (t: string) => {
    if (!t || TAXONOMY.has(t) || topics.includes(t) || keywords.includes(t)) {
      return;
    }
    if (keywords.length < 8) keywords.push(t.slice(0, 24));
  };

  for (const t of asStringArray(rawTopics, 8)) {
    if (TAXONOMY.has(t)) pushTopic(t);
    else pushKw(t);
  }
  for (const t of asStringArray(rawKeywords, 8)) {
    if (TAXONOMY.has(t)) pushTopic(t);
    else pushKw(t);
  }
  return { topics, keywords };
}

function normalizeStyles(raw: unknown): string[] {
  const styles = asStringArray(raw, 4);
  const prefSet = new Set<string>(PREFERENCE_OPTIONS);
  const out: string[] = [];
  for (const s of styles) {
    let mapped = s;
    if (prefSet.has(s)) mapped = s;
    else if (/少理论|轻理论|不要.*理论|别.*理论/.test(s)) mapped = "少理论";
    else if (/理论优先|偏理论/.test(s)) mapped = "理论优先";
    else if (/案例/.test(s)) mapped = "案例优先";
    else if (/实操|实践|动手/.test(s)) mapped = "实操";
    else if (/跨/.test(s)) mapped = "跨领域";
    else mapped = s.slice(0, 16);

    if (mapped === "少理论") {
      const i = out.indexOf("理论优先");
      if (i >= 0) out.splice(i, 1);
    }
    if (mapped === "理论优先" && out.includes("少理论")) continue;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out.slice(0, 3);
}

/**
 * 用户手改字段覆盖 AI / 规则解析结果。
 * 约定：请求里显式传入的字段（含空数组 / null）优先于解析结果。
 */
export function applyManualContextOverrides(
  base: Omit<StructuredDemandContext, "searchQueries">,
  input: RecommendRequest,
): Omit<StructuredDemandContext, "searchQueries"> {
  let { topics, keywords, styles, difficulty, time, goal, goals, exclusions } =
    base;
  goals = goals ?? (goal ? [goal] : []);

  if (input.themes !== undefined) {
    topics = clampThemes(input.themes);
  }
  if (input.keywords !== undefined) {
    keywords = clampKeywords(input.keywords);
  }
  if (input.preferences !== undefined) {
    styles = clampPreferences(input.preferences).filter(
      (p) => !topics.includes(p),
    );
  }
  if (input.goals !== undefined) {
    goals = clampGoals(input.goals);
    goal = goals[0] ?? "";
  } else if (input.goal !== undefined) {
    goal = normalizeGoal(input.goal);
    goals = goal ? [goal] : [];
  }
  if (input.depth !== undefined) {
    difficulty = input.depth;
  }
  if (input.session_bucket !== undefined) {
    time = input.session_bucket;
  }

  keywords = clampKeywords(keywords.filter((k) => !topics.includes(k)));
  if (styles.includes("少理论") && !exclusions.includes("重理论")) {
    exclusions = [...exclusions, "重理论"];
  }

  return { topics, keywords, styles, difficulty, time, goal, goals, exclusions };
}

/**
 * 校验规范化后的 demand 是否符合 StructuredDemandContext。
 * searchQueries 由系统生成，必须存在。
 * 允许：仅有 keywords、无 topics；goal 可为空（未明确）。
 */
export function isValidStructuredDemand(
  demand: StructuredDemandContext | null,
): demand is StructuredDemandContext {
  if (!demand) return false;
  if (!Array.isArray(demand.topics)) return false;
  if (!demand.topics.every((t) => TAXONOMY.has(t))) return false;
  if (!Array.isArray(demand.keywords)) return false;
  if (demand.topics.length === 0 && demand.keywords.length === 0) return false;
  if (!Array.isArray(demand.styles)) return false;
  if (!Array.isArray(demand.exclusions)) return false;
  if (!Array.isArray(demand.searchQueries) || demand.searchQueries.length === 0) {
    return false;
  }
  if (
    demand.goal !== "" &&
    !(ALLOWED_GOALS as readonly string[]).includes(demand.goal)
  ) {
    return false;
  }
  if (
    demand.difficulty != null &&
    !ALLOWED_DEPTH.has(demand.difficulty)
  ) {
    return false;
  }
  if (demand.time != null && !ALLOWED_TIME.has(demand.time)) return false;
  return true;
}

/**
 * 将 LLM / 任意 JSON 规范成 StructuredDemandContext。
 * 再叠加用户手改条件（最新修改优先）。
 * searchQueries 始终由系统根据 topics+keywords 生成，不采信模型输出。
 */
export function normalizeStructuredDemand(
  raw: unknown,
  input: RecommendRequest,
): StructuredDemandContext | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  // 拒绝模型顺带推荐书
  if (
    "books" in obj ||
    "recommendations" in obj ||
    "ranking" in obj ||
    "book_ids" in obj
  ) {
    console.warn("[recommend] LLM returned book recommendations; reject");
    return null;
  }

  const split = splitTopicsAndKeywords(obj.topics, obj.keywords);
  const styles = normalizeStyles(obj.styles).filter(
    (s) => !split.topics.includes(s),
  );

  const promptText =
    input.prompt?.trim() ||
    input.special_notes?.trim() ||
    (input.previous_turns ?? []).map((t) => t.text).join("\n").trim() ||
    "";

  const goal = normalizeGoal(obj.goal);
  let overridden = applyManualContextOverrides(
    {
      topics: split.topics,
      keywords: split.keywords,
      styles,
      difficulty: normalizeDifficulty(obj.difficulty),
      time: normalizeTime(obj.time),
      goal,
      goals: goal ? [goal] : [],
      exclusions: asStringArray(obj.exclusions, 6),
    },
    input,
  );

  overridden = stripInferredContextForAmbiguousPrompt(
    promptText,
    overridden,
    input,
  );

  // 短模糊且无题材词时，规则侧再补一轮画像领域关键词（有「游戏设计」等题材则不补）
  const t = promptText.trim();
  const hasTaxonomy = extractCoreConditionsFromText(t).themes.length > 0;
  if (
    t.length > 0 &&
    t.length <= 6 &&
    !hasTaxonomy &&
    overridden.keywords.length <= 1 &&
    input.keywords === undefined
  ) {
    overridden = enrichAmbiguousDemandWithProfile(promptText, overridden, input);
  }

  if (overridden.topics.length === 0 && overridden.keywords.length === 0) {
    return null;
  }

  const searchQueries = buildSearchQueriesFromDemand(
    overridden.topics,
    overridden.keywords,
    overridden.styles,
  );
  if (searchQueries.length === 0) return null;

  const intentConfidence = (() => {
    const fromModel = normalizeIntentConfidence(
      obj.intentConfidence,
      promptText,
    );
    const t = promptText.trim();
    if (t.length > 0 && t.length <= 6) {
      return Math.min(fromModel, 0.5);
    }
    return fromModel;
  })();

  const demand: StructuredDemandContext = attachExplicitInferredPartitions(
    promptText,
    {
      ...overridden,
      searchQueries,
      intentConfidence,
    },
    input,
  );

  return isValidStructuredDemand(demand) ? demand : null;
}

function buildUserPrompt(text: string, input: RecommendRequest): string {
  const profile = input.profile;
  const parts = [
    `用户需求原文：\n${text || "（空）"}`,
    `正式题材 taxonomy（topics 只能从中选）：${GENRE_TAG_WHITELIST.join("、")}`,
    profile
      ? `长期画像（弱参考）：roles=${JSON.stringify(profile.roles ?? [])}; interests=${JSON.stringify(profile.interests ?? [])}; purposes=${JSON.stringify(profile.reading_purposes ?? [])}; depth=${profile.reading_depth ?? "null"}`
      : "长期画像：无",
  ];
  if (input.themes !== undefined) {
    parts.push(
      `用户已选手动正式主题（必须采用，勿改）：${input.themes.join("、") || "（空）"}`,
    );
  }
  if (input.keywords !== undefined) {
    parts.push(
      `用户已选手动本次关注（必须采用，勿改）：${input.keywords.join("、") || "（空）"}`,
    );
  }
  if (input.preferences !== undefined) {
    parts.push(
      `用户已选手动偏好（必须采用，勿改）：${input.preferences.join("、") || "（空）"}`,
    );
  }
  if (input.goals !== undefined) {
    parts.push(
      `用户已选手动目标（可多选，必须采用）：${input.goals.join("、") || "（空）"}`,
    );
  } else if (input.goal?.trim()) {
    parts.push(`用户已选手动目标（必须采用）：${input.goal.trim()}`);
  }
  if (input.depth !== undefined) {
    parts.push(`用户已选手动难度（必须采用）：${String(input.depth)}`);
  }
  if (input.session_bucket !== undefined) {
    parts.push(
      `用户已选手动时长（必须采用）：${String(input.session_bucket)}`,
    );
  }
  return parts.join("\n");
}

function rulesFallback(
  text: string,
  input: RecommendRequest,
): ParseDemandResult {
  let demand = parseDemandContext(text, input);
  const t = text.trim();
  if (
    t.length > 0 &&
    t.length <= 6 &&
    extractCoreConditionsFromText(t).themes.length === 0
  ) {
    const enriched = enrichAmbiguousDemandWithProfile(
      text,
      {
        topics: demand.topics,
        keywords: demand.keywords,
        goal: demand.goal,
        styles: demand.styles,
        difficulty: demand.difficulty,
        time: demand.time,
        exclusions: demand.exclusions,
      },
      input,
    );
    const searchQueries = buildSearchQueriesFromDemand(
      enriched.topics,
      enriched.keywords,
      enriched.styles,
    );
    demand = {
      ...enriched,
      searchQueries:
        searchQueries.length > 0 ? searchQueries : demand.searchQueries,
      intentConfidence: Math.min(demand.intentConfidence ?? 0.4, 0.5),
    };
  }

  demand = attachExplicitInferredPartitions(text, demand, input);

  return {
    demand,
    source: "rules",
  };
}

/**
 * LLM 解析 StructuredDemandContext。
 * - 有 GEMINI_API_KEY（或 AI_PROVIDER=openai + OPENAI_API_KEY）且未设 RECOMMEND_LLM_CONTEXT=0 时走 LLM
 * - 无 key / 超时 / 失败 / schema 校验失败 → 规则版 parseDemandContext
 * - 请求中的 themes/keywords/preferences/goal/depth/session_bucket 手改优先
 * - LLM 不参与荐书与最终排序；searchQueries 由系统生成
 */
export async function parseDemandContextWithLLM(
  text: string,
  input: RecommendRequest,
): Promise<ParseDemandResult> {
  const disabled =
    process.env.RECOMMEND_LLM_CONTEXT?.trim() === "0" ||
    process.env.RECOMMEND_LLM_CONTEXT?.trim().toLowerCase() === "false";

  if (!hasLlmProvider() || disabled) {
    return rulesFallback(text, input);
  }

  try {
    bumpContextLlmCall();
    const raw = await completeJson({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(text, input),
      temperature: 0.2,
    });
    const demand = normalizeStructuredDemand(raw, input);
    if (!demand) {
      console.warn("[recommend] LLM context invalid, fallback to rules");
      return rulesFallback(text, input);
    }
    return { demand, source: "llm" };
  } catch (err) {
    console.warn("[recommend] LLM context failed, fallback to rules:", err);
    return rulesFallback(text, input);
  }
}
