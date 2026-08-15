/**
 * Seed CLI：调用 ingestBooks() 增量扩充书库。
 *
 * 用法：
 *   1. .env.local：GOOGLE_BOOKS_API_KEY + SUPABASE_SECRET_KEY
 *   2. 已执行 migrate_works_editions.sql；若缺列再跑 patch_works_topic_sources.sql
 *   3. 国内可设 HTTPS_PROXY
 *   4. npm run seed:books -- --tags 编程,人工智能 --per-tag 18
 *
 * --tags：只跑这些题材；省略则跑默认词表全部 tag
 * --per-tag：本次每个 tag 需新插入的独立作品数（不含库内已有，默认 18）
 *
 * 核心逻辑在 lib/data/ingest（推荐 API 可复用 ingestBooks）。
 */

import { createClient } from "@supabase/supabase-js";
import { ProxyAgent, setGlobalDispatcher } from "undici";

import {
  DEFAULT_INGEST_QUERIES,
  filterQueriesByTags,
  ingestBooks,
  INGEST_REJECT_LABELS,
  type IngestProgressEvent,
  type IngestRejectReason,
} from "../lib/data/ingest";

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

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`缺少环境变量 ${name}（请写在 .env.local）`);
  return v;
}

function getSupabaseSecret(): string {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

function parseArgs(argv: string[]) {
  let tags: string[] = [];
  let perTag = 18;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tags" && argv[i + 1]) {
      tags = argv[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a.startsWith("--tags=")) {
      tags = a
        .slice("--tags=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === "--per-tag" && argv[i + 1]) {
      perTag = Math.max(1, Number(argv[++i]) || 18);
    } else if (a.startsWith("--per-tag=")) {
      perTag = Math.max(1, Number(a.slice("--per-tag=".length)) || 18);
    } else if (a === "--count" && argv[i + 1]) {
      // 兼容旧参数：当作 per-tag
      perTag = Math.max(1, Number(argv[++i]) || 18);
    } else if (a.startsWith("--count=")) {
      perTag = Math.max(1, Number(a.slice("--count=".length)) || 18);
    }
  }
  const envTags = (process.env.SEED_TAG_FILTER ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (tags.length === 0 && envTags.length > 0) tags = envTags;
  const envPer = Number(process.env.SEED_PER_TAG || process.env.TARGET_NEW);
  if (
    !argv.some((a) => a.startsWith("--per-tag") || a.startsWith("--count")) &&
    Number.isFinite(envPer) &&
    envPer > 0
  ) {
    perTag = envPer;
  }
  return { tags, perTag };
}

function logProgress(event: IngestProgressEvent) {
  switch (event.type) {
    case "tag_start":
      console.log(
        `\n▶ tag「${event.tag}」目标新增 ${event.target} 部（${event.queryCount} 个检索）`,
      );
      break;
    case "query_page": {
      const p = event.page + 1;
      const next =
        event.nextPage != null ? ` → 继续 p${event.nextPage + 1}` : "";
      const rejectParts = (
        Object.entries(event.rejectCounts) as [IngestRejectReason, number][]
      )
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${INGEST_REJECT_LABELS[k]}${n}`)
        .join(" ");
      console.log(
        `  · ${event.query} p${p} (startIndex=${event.startIndex}, items=${event.itemCount}):` +
          ` 候选${event.candidates} 写入${event.insertedThisPage}` +
          ` 本tag ${event.newForTag}/${event.target}` +
          next,
      );
      if (rejectParts) {
        console.log(`      丢弃: ${rejectParts}`);
      }
      break;
    }
    case "query_stop": {
      const label =
        event.reason === "per_tag"
          ? `已达 per-tag ${event.newForTag}/${event.target}`
          : event.reason === "max_pages"
            ? "已达 maxPagesPerQuery"
            : "Google 返回空 items（无更多结果）";
      console.log(`  ✕ ${event.query} 停于 p${event.page + 1}：${label}`);
      break;
    }
    case "query_skip":
      console.warn(`  ⚠️ 跳过 [${event.query}]: ${event.reason.slice(0, 160)}`);
      break;
    case "tag_done":
      console.log(
        `◀ tag「${event.tag}」完成：新增 ${event.newForTag}/${event.target}`,
      );
      break;
  }
}

async function main() {
  setupProxyFromEnv();
  const { tags, perTag } = parseArgs(process.argv.slice(2));

  const googleKey = requireEnv("GOOGLE_BOOKS_API_KEY");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseSecret = getSupabaseSecret();
  if (!supabaseSecret) {
    throw new Error(
      "缺少 SUPABASE_SECRET_KEY 或 SUPABASE_SERVICE_ROLE_KEY（服务端高权限，勿加 NEXT_PUBLIC_）",
    );
  }

  const supabase = createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const queries = filterQueriesByTags(DEFAULT_INGEST_QUERIES, tags);
  if (queries.length === 0) {
    throw new Error(
      tags.length
        ? `没有匹配 --tags 的检索词：${tags.join(",")}`
        : "默认检索词表为空",
    );
  }

  console.log(
    `增量扩库：per-tag=${perTag}${tags.length ? `；tags=${tags.join(",")}` : "；全部默认 tag"}`,
  );

  const result = await ingestBooks({
    queries,
    tags: tags.length > 0 ? tags : undefined,
    perTag,
    googleApiKey: googleKey,
    supabase,
    onProgress: logProgress,
  });

  console.log("");
  console.log("—— 完成 ——");
  console.log(`新作品合计: ${result.newWorksTotal}`);
  for (const [tag, n] of Object.entries(result.newWorksByTag)) {
    console.log(`  ${tag}: ${n}/${perTag}`);
  }
  console.log(`已有作品补版本: ${result.editionsAppended}`);
  if (result.skippedQueries.length > 0) {
    console.warn(`跳过 query: ${result.skippedQueries.join(", ")}`);
  }
  const short = Object.entries(result.newWorksByTag).filter(
    ([, n]) => n < perTag,
  );
  if (short.length > 0) {
    console.warn(
      `未凑满: ${short.map(([t, n]) => `${t}(${n})`).join(", ")} — 可加大 --per-tag 页数限制或稍后再跑。`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
