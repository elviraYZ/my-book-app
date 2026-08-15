/**
 * Backfill / force 重写 works.embedding。
 *
 * 用法：
 *   1. .env.local：GEMINI_API_KEY + SUPABASE_SECRET_KEY
 *   2. 已执行 supabase/patch_works_embedding.sql（vector(768) + match RPC）
 *      若库里仍是旧 1536 列：先跑 patch_works_embedding_gemini_768.sql
 *   3. npm run embed:works
 *   4. 可选：--limit 50  --force（覆盖已有 embedding）
 *
 * 建议先跑 npm run enrich:works（或 --skip-embed），再 force embed。
 * 流程：works → buildWorkEmbeddingText → embedText → update embedding
 */

import { createClient } from "@supabase/supabase-js";
import { ProxyAgent, setGlobalDispatcher } from "undici";

import {
  describeEmbeddingProvider,
  hasEmbeddingProvider,
} from "../lib/ai/embedding";
import { embedAndSaveWork } from "../lib/data/recommend/embed-work";

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
  let limit = 500;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit" && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0) limit = Math.floor(n);
    } else if (a === "--force") {
      force = true;
    }
  }
  return { limit, force };
}

async function main() {
  setupProxyFromEnv();

  if (!hasEmbeddingProvider()) {
    throw new Error(
      "缺少 GEMINI_API_KEY（或 AI_PROVIDER=openai 时的 OPENAI_API_KEY）",
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = getSupabaseSecret();
  if (!url || !secret) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  const { limit, force } = parseArgs(process.argv.slice(2));
  const supabase = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const desc = describeEmbeddingProvider();
  console.log(
    `provider=${desc.provider} model=${desc.model} dims=${desc.dimensions} limit=${limit} force=${force}`,
  );

  let query = supabase
    .from("works")
    .select("id, canonical_title")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!force) {
    query = query.is("embedding", null);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `查询 works 失败: ${error.message}（请确认已执行 patch_works_embedding.sql）`,
    );
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    console.log(
      force
        ? "没有 works 可处理。"
        : "没有 embedding IS NULL 的 works，无需 backfill（可用 --force 覆盖）。",
    );
    return;
  }

  console.log(`待处理 ${rows.length} 本…`);
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const title = String(row.canonical_title ?? "").slice(0, 40);
    process.stdout.write(`[${i + 1}/${rows.length}] ${title} … `);
    const success = await embedAndSaveWork(supabase, row.id);
    if (success) {
      ok += 1;
      console.log("ok");
    } else {
      fail += 1;
      console.log("fail");
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(
    `完成：成功 ${ok}，失败 ${fail}${force ? "（--force 已覆盖已有）" : "（失败可重跑，仍只处理 NULL）"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
