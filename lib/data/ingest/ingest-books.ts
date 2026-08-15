import { workKey } from "@/lib/data/book-quality";
import { filterWhitelistTags } from "@/lib/data/book-tags";
import { admitGoogleCandidate } from "@/lib/data/ingest/admission";
import { fetchGoogleBooksPage, sleep } from "@/lib/data/ingest/google-books";
import { evaluateVolumeForIngest } from "@/lib/data/ingest/map-volume";
import {
  loadExistingCatalog,
  upsertWorkGroup,
} from "@/lib/data/ingest/persist";
import { embedAndSaveWork } from "@/lib/data/recommend/embed-work";
import {
  filterQueriesByTags,
  uniqueTagsFromQueries,
} from "@/lib/data/ingest/default-queries";
import type {
  EditionDraft,
  IngestBooksInput,
  IngestBooksResult,
} from "@/lib/data/ingest/types";
import { emptyRejectCounts } from "@/lib/data/ingest/types";

const DEFAULT_PAGE_SIZE = 40;
const DEFAULT_MAX_PAGES = 8;
const MOSTLY_EXISTING_RATIO = 0.6;
/** 无正式 taxonomy 时的计数桶（不写入 works.topics） */
const CONTEXT_BUCKET = "__context__";

/**
 * Google Books → 清洗 → 准入 → work/edition 归组去重 → 写库。
 * tags 仅正式 taxonomy；自由 keywords 只出现在 query.q。
 */
export async function ingestBooks(
  input: IngestBooksInput,
): Promise<IngestBooksResult> {
  const {
    googleApiKey,
    supabase,
    perTag,
    onProgress,
    pageSize = DEFAULT_PAGE_SIZE,
    maxPagesPerQuery = DEFAULT_MAX_PAGES,
    demand,
  } = input;

  if (perTag < 1) {
    throw new Error("perTag 必须 >= 1");
  }

  const rawTags =
    input.tags && input.tags.length > 0
      ? [...new Set(input.tags)]
      : uniqueTagsFromQueries(input.queries);
  let tagsToRun: string[] = filterWhitelistTags(rawTags);
  if (tagsToRun.length === 0) {
    tagsToRun = [CONTEXT_BUCKET];
  }

  const existing = await loadExistingCatalog(supabase);

  const newWorksByTag: Record<string, number> = {};
  const countedKeysByTag: Record<string, Set<string>> = {};
  for (const tag of tagsToRun) {
    newWorksByTag[tag] = 0;
    countedKeysByTag[tag] = new Set();
  }

  let editionsAppended = 0;
  const skippedQueries: string[] = [];
  const insertedWorkIds: string[] = [];
  const insertedKeys = new Set<string>();

  function creditNewWork(key: string, topics: string[], workId: string) {
    if (insertedKeys.has(key)) return;
    insertedKeys.add(key);
    insertedWorkIds.push(workId);
    for (const t of topics) {
      if (!countedKeysByTag[t]) continue;
      if (countedKeysByTag[t].has(key)) continue;
      countedKeysByTag[t].add(key);
      newWorksByTag[t] += 1;
    }
    if (
      countedKeysByTag[CONTEXT_BUCKET] &&
      !countedKeysByTag[CONTEXT_BUCKET].has(key)
    ) {
      countedKeysByTag[CONTEXT_BUCKET].add(key);
      newWorksByTag[CONTEXT_BUCKET] += 1;
    }
  }

  for (const tag of tagsToRun) {
    const tagQueries =
      tag === CONTEXT_BUCKET
        ? input.queries
        : filterQueriesByTags(input.queries, [tag]);
    onProgress?.({
      type: "tag_start",
      tag,
      target: perTag,
      queryCount: tagQueries.length,
    });

    if (tagQueries.length === 0) {
      onProgress?.({
        type: "tag_done",
        tag,
        newForTag: newWorksByTag[tag],
        target: perTag,
      });
      continue;
    }

    for (const query of tagQueries) {
      if (newWorksByTag[tag] >= perTag) break;

      for (let page = 0; page < maxPagesPerQuery; page++) {
        if (newWorksByTag[tag] >= perTag) {
          onProgress?.({
            type: "query_stop",
            tag,
            query: query.q,
            page,
            reason: "per_tag",
            newForTag: newWorksByTag[tag],
            target: perTag,
          });
          break;
        }

        const startIndex = page * pageSize;
        let items;
        try {
          items = await fetchGoogleBooksPage({
            query: query.q,
            apiKey: googleApiKey,
            maxResults: pageSize,
            startIndex,
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          skippedQueries.push(query.q);
          onProgress?.({
            type: "query_skip",
            tag,
            query: query.q,
            reason,
          });
          break;
        }

        if (items.length === 0) {
          onProgress?.({
            type: "query_stop",
            tag,
            query: query.q,
            page,
            reason: "empty_items",
            newForTag: newWorksByTag[tag],
            target: perTag,
          });
          break;
        }

        const rejectCounts = emptyRejectCounts();
        const byWork = new Map<string, EditionDraft[]>();

        for (const item of items) {
          const seedTags = filterWhitelistTags(query.tags);
          const evaluated = evaluateVolumeForIngest(item, {
            tags: seedTags,
            styles: query.styles,
          });
          if (evaluated.status === "reject") {
            rejectCounts[evaluated.reason] += 1;
            continue;
          }

          const draft = evaluated.draft;
          if (existing.externalIds.has(draft.external_id)) {
            rejectCounts.external_id_conflict += 1;
            continue;
          }
          if (draft.isbn_13 && existing.isbn13s.has(draft.isbn_13)) {
            rejectCounts.isbn_conflict += 1;
            continue;
          }
          const key = workKey(draft.title, draft.author);
          if (existing.workKeys.has(key)) {
            rejectCounts.already_in_catalog += 1;
            continue;
          }

          if (tag !== CONTEXT_BUCKET && !draft.tags.includes(tag)) {
            rejectCounts.tag_mismatch += 1;
            continue;
          }

          const admission = admitGoogleCandidate(draft, demand);
          if (!admission.admit) {
            const reason =
              admission.reason === "domain_irrelevant"
                ? "domain_irrelevant"
                : "context_irrelevant";
            rejectCounts[reason] += 1;
            continue;
          }
          draft.concepts = admission.concepts;

          const list = byWork.get(key) ?? [];
          list.push(draft);
          byWork.set(key, list);
        }

        const candidates = [...byWork.values()].reduce(
          (n, list) => n + list.length,
          0,
        );
        const rejectedTotal = Object.values(rejectCounts).reduce(
          (a, b) => a + b,
          0,
        );
        const mostlyExisting =
          items.length > 0 &&
          rejectedTotal / items.length >= MOSTLY_EXISTING_RATIO;

        let insertedThisPage = 0;
        for (const [key, editions] of byWork) {
          if (newWorksByTag[tag] >= perTag) break;

          const before = newWorksByTag[tag];
          const result = await upsertWorkGroup(
            supabase,
            key,
            editions,
            existing,
          );

          if (result.status === "existed") {
            editionsAppended += result.editionsAdded;
            continue;
          }
          if (result.status === "inserted") {
            creditNewWork(key, result.topics, result.workId);
            if (newWorksByTag[tag] > before) insertedThisPage += 1;
            try {
              await embedAndSaveWork(supabase, result.workId);
            } catch (err) {
              console.warn("[ingest] embed skipped:", err);
            }
          }
        }

        const hitTarget = newWorksByTag[tag] >= perTag;
        const nextPage = page + 1;
        const hitMaxPages = nextPage >= maxPagesPerQuery;
        const willContinue = !hitTarget && !hitMaxPages;

        onProgress?.({
          type: "query_page",
          tag,
          query: query.q,
          page,
          startIndex,
          itemCount: items.length,
          candidates,
          insertedThisPage,
          mostlyExisting,
          rejectCounts,
          newForTag: newWorksByTag[tag],
          target: perTag,
          willContinue,
          nextPage: willContinue ? nextPage : null,
        });

        if (hitTarget) {
          onProgress?.({
            type: "query_stop",
            tag,
            query: query.q,
            page,
            reason: "per_tag",
            newForTag: newWorksByTag[tag],
            target: perTag,
          });
          break;
        }
        if (hitMaxPages) {
          onProgress?.({
            type: "query_stop",
            tag,
            query: query.q,
            page,
            reason: "max_pages",
            newForTag: newWorksByTag[tag],
            target: perTag,
          });
          break;
        }

        await sleep(250);
      }

      await sleep(150);
    }

    onProgress?.({
      type: "tag_done",
      tag,
      newForTag: newWorksByTag[tag],
      target: perTag,
    });
  }

  return {
    newWorksByTag,
    newWorksTotal: insertedWorkIds.length,
    editionsAppended,
    skippedQueries: [...new Set(skippedQueries)],
    insertedWorkIds,
  };
}
