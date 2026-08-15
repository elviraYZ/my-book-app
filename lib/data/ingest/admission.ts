/**
 * Google 候选入库准入：质量闸之外，再要求领域相关 + 当前 Context 相关。
 * 自由 keywords 只作 Context 证据，不写入正式 topics。
 */

import { filterWhitelistTags } from "@/lib/data/book-tags";
import { evaluateAbsoluteRelevance } from "@/lib/data/recommend/absolute-gate";
import type { EditionDraft } from "@/lib/data/ingest/types";
import type { Book, StructuredDemandContext } from "@/lib/types";

const DOMAIN_PATTERNS: RegExp[] = [
  /游戏|关卡|玩家|玩法|交互|设计|叙事|美术|原画|设定|程序|策划|UX|UI|level\s*design|game\s*design|gameplay|wayfinding/i,
];

export type IngestAdmissionResult = {
  admit: boolean;
  reason: string | null;
  concepts: string[];
};

function draftAsBook(draft: EditionDraft): Book {
  return {
    id: draft.external_id,
    title: draft.title,
    author: draft.author,
    description: draft.description,
    display_summary: draft.description.slice(0, 280),
    cover_url: draft.cover_url,
    tags: draft.tags,
    content_style: draft.content_style as Book["content_style"],
    difficulty: draft.difficulty,
    use_cases: [],
    created_at: new Date().toISOString(),
  };
}

/** 游戏行业 / 设计领域相关性（taxonomy 证据或领域词） */
export function isDomainRelevant(draft: EditionDraft): boolean {
  const whitelist = filterWhitelistTags(draft.tags);
  if (whitelist.length > 0) return true;
  const blob = `${draft.title}\n${draft.description}`;
  return DOMAIN_PATTERNS.some((re) => re.test(blob));
}

/** 从正文抽取与本轮 Context 命中的自由概念（不入 taxonomy） */
export function extractMatchedConcepts(
  draft: EditionDraft,
  demand: StructuredDemandContext | undefined,
): string[] {
  if (!demand) return [];
  const blob = `${draft.title}\n${draft.description}`.toLowerCase();
  const seeds = [
    ...(demand.explicitKeywords ?? demand.keywords ?? []),
    ...(demand.inferredKeywords ?? []),
  ];
  const out: string[] = [];
  for (const k of seeds) {
    const t = k.trim().toLowerCase();
    if (t.length < 2) continue;
    if (blob.includes(t) && !out.includes(k)) out.push(k);
  }
  return out.slice(0, 12);
}

/**
 * 入库前 Context 相关：走 absolute gate（无 embedding 时靠 keyword/topic）。
 */
export function admitGoogleCandidate(
  draft: EditionDraft,
  demand: StructuredDemandContext | undefined,
): IngestAdmissionResult {
  if (!isDomainRelevant(draft)) {
    return { admit: false, reason: "domain_irrelevant", concepts: [] };
  }

  const concepts = extractMatchedConcepts(draft, demand);
  if (!demand) {
    return { admit: true, reason: null, concepts };
  }

  const book = draftAsBook(draft);
  const abs = evaluateAbsoluteRelevance(book, demand, 0);
  if (!abs.admit) {
    return {
      admit: false,
      reason: abs.rejectReason ?? "context_irrelevant",
      concepts,
    };
  }
  return { admit: true, reason: null, concepts };
}
