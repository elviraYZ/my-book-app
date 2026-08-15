/**
 * 全量 enrichment works 元数据，并可 force 重写 embedding。
 *
 * 用法：
 *   1. 先在 Supabase 执行 supabase/patch_works_enrichment_fields.sql
 *   2. npm run enrich:works                 # 规则 + LLM（primary 1–2 + concepts）
 *   3. npm run enrich:works -- --limit 10 --skip-embed   # 先抽样验收
 *   4. 可选：--rules-only  --embed-only  --offset N
 *
 * 规则：content_style / difficulty / use_cases + rule topic 建议
 * LLM：最终 topics（完整 whitelist）/ primary_topics（1–2）/ concepts / display_summary
 * topic_sources：evidence=规则保留，llm=LLM 新补
 */

import { createClient } from "@supabase/supabase-js";
import { ProxyAgent, setGlobalDispatcher } from "undici";

import { hasLlmProvider } from "../lib/ai/config";
import {
  describeEmbeddingProvider,
  hasEmbeddingProvider,
} from "../lib/ai/embedding";
import { embedAndSaveWork } from "../lib/data/recommend/embed-work";
import {
  enrichWorkMetadata,
  enrichWorkMetadataWithLlm,
} from "../lib/data/work-enrichment";

function setupProxyFromEnv() {
  const proxy =
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    process.env.ALL_PROXY?.trim();
  if (!proxy) return;
  setGlobalDispatcher(new ProxyAgent(proxy));
  const redacted = proxy.replace(/\/\/([^/@]+)@/, "//***@");
  console.log(`已启用代理: ${redacted}`);
}

function getSupabaseSecret(): string {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

function parseArgs(argv: string[]) {
  let limit = 5000;
  let offset = 0;
  let skipEmbed = false;
  let embedOnly = false;
  let rulesOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit" && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0) limit = Math.floor(n);
    } else if (a === "--offset" && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n >= 0) offset = Math.floor(n);
    } else if (a === "--skip-embed") {
      skipEmbed = true;
    } else if (a === "--embed-only") {
      embedOnly = true;
    } else if (a === "--rules-only") {
      rulesOnly = true;
    }
  }
  return { limit, offset, skipEmbed, embedOnly, rulesOnly };
}

type WorkRow = {
  id: string;
  canonical_title: string;
  topics: string[] | null;
  content_style: string[] | null;
  display_summary: string | null;
  use_cases: string[] | null;
  concepts: string[] | null;
  primary_topics: string[] | null;
  difficulty: string | null;
  representative_edition_id: string | null;
  book_editions:
    | {
        id: string;
        title: string;
        description: string | null;
        page_count: number | null;
      }[]
    | null;
};

async function main() {
  setupProxyFromEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = getSupabaseSecret();
  if (!url || !secret) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  const { limit, offset, skipEmbed, embedOnly, rulesOnly } = parseArgs(
    process.argv.slice(2),
  );
  const useLlm = !rulesOnly && hasLlmProvider();
  if (!rulesOnly && !hasLlmProvider()) {
    console.warn("未配置 LLM key，将仅用规则 enrichment（可用 GEMINI_API_KEY）");
  }

  const supabase = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    `enrich:works limit=${limit} offset=${offset} llm=${useLlm} skipEmbed=${skipEmbed} embedOnly=${embedOnly}`,
  );

  const { data, error } = await supabase
    .from("works")
    .select(
      "id, canonical_title, topics, primary_topics, content_style, display_summary, use_cases, concepts, difficulty, representative_edition_id, book_editions!book_editions_work_id_fkey(id, title, description, page_count)",
    )
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(
      `查询 works 失败: ${error.message}（请确认已执行 patch_works_enrichment_fields.sql）`,
    );
  }

  const rows = (data ?? []) as WorkRow[];
  if (rows.length === 0) {
    console.log("没有 works 可处理。");
    return;
  }

  console.log(`读取 ${rows.length} 部作品…`);

  let enrichedOk = 0;
  let enrichedFail = 0;
  let llmOk = 0;
  let rulesFallback = 0;
  const embedIds: string[] = [];

  if (!embedOnly) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const editions = row.book_editions ?? [];
      const rep =
        editions.find((e) => e.id === row.representative_edition_id) ??
        editions[0];
      const title = String(rep?.title ?? row.canonical_title ?? "");
      const description = rep?.description ?? null;
      const pageCount = rep?.page_count ?? null;

      const input = {
        title,
        description,
        previousTopics: row.topics,
        previousStyles: row.content_style,
        previousUseCases: row.use_cases,
        previousConcepts: row.concepts,
        previousDisplaySummary: row.display_summary,
        pageCount,
        force: true as const,
      };

      process.stdout.write(
        `[enrich ${i + 1}/${rows.length}] ${title.slice(0, 32)} … `,
      );

      try {
        const next = useLlm
          ? await enrichWorkMetadataWithLlm(input)
          : { ...enrichWorkMetadata(input), llmSource: "rules" as const };

        if (next.llmSource === "llm") llmOk += 1;
        else rulesFallback += 1;

        const { error: upErr } = await supabase
          .from("works")
          .update({
            topics: next.topics,
            topic_sources: next.topic_sources,
            primary_topics: next.primary_topics,
            content_style: next.content_style,
            difficulty: next.difficulty,
            display_summary: next.display_summary,
            use_cases: next.use_cases,
            concepts: next.concepts,
          })
          .eq("id", row.id);

        if (upErr) {
          enrichedFail += 1;
          console.log(`fail: ${upErr.message}`);
          continue;
        }

        enrichedOk += 1;
        embedIds.push(row.id);
        const srcHint = Object.entries(next.topic_sources)
          .map(([t, k]) => `${t}:${k}`)
          .join(",");
        console.log(
          `ok [${next.llmSource}] topics=[${next.topics.join(",")}] primary=[${next.primary_topics.join(",")}] concepts=${next.concepts.length}[${next.concepts.slice(0, 4).join(",")}] sources={${srcHint}}`,
        );
      } catch (err) {
        enrichedFail += 1;
        console.log(
          `fail: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 限速，避免打爆 LLM
      if (useLlm) await new Promise((r) => setTimeout(r, 220));
    }
    console.log(
      `enrichment 完成：成功 ${enrichedOk}，失败 ${enrichedFail}，llm=${llmOk}，rules=${rulesFallback}`,
    );
  } else {
    for (const row of rows) embedIds.push(row.id);
  }

  if (skipEmbed) {
    console.log("已 --skip-embed，跳过 embedding。");
    return;
  }

  if (!hasEmbeddingProvider()) {
    throw new Error(
      "缺少 GEMINI_API_KEY（或 AI_PROVIDER=openai 时的 OPENAI_API_KEY）；可用 --skip-embed 只做 enrichment",
    );
  }

  const desc = describeEmbeddingProvider();
  console.log(
    `force embed provider=${desc.provider} model=${desc.model} dims=${desc.dimensions} count=${embedIds.length}`,
  );

  let embedOk = 0;
  let embedFail = 0;
  for (let i = 0; i < embedIds.length; i++) {
    const id = embedIds[i];
    const row = rows.find((r) => r.id === id);
    const t = String(row?.canonical_title ?? id).slice(0, 40);
    process.stdout.write(`[embed ${i + 1}/${embedIds.length}] ${t} … `);
    const success = await embedAndSaveWork(supabase, id);
    if (success) {
      embedOk += 1;
      console.log("ok");
    } else {
      embedFail += 1;
      console.log("fail");
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`embedding 完成：成功 ${embedOk}，失败 ${embedFail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
