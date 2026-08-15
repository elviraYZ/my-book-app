/**
 * 清理 works：按代表版质量闸，只保留约 CATALOG_TARGET 部。
 * 删除作品会 cascade editions 与相关 bookmarks / topic_books。
 *
 * 用法：npm run prune:books
 */

import { createClient } from "@supabase/supabase-js";

import {
  CATALOG_TARGET,
  selectCatalogBooks,
} from "../lib/data/book-quality";
import {
  assignGenreTags,
  classifyContentStyles,
} from "../lib/data/book-tags";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`缺少环境变量 ${name}`);
  return v;
}

function getSupabaseSecret(): string {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const secret = getSupabaseSecret();
  if (!secret) {
    throw new Error("缺少 SUPABASE_SECRET_KEY 或 SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("works")
    .select(
      "id, work_key, canonical_title, primary_author, topics, representative_edition_id, book_editions!book_editions_work_id_fkey(id, title, description, cover_url, rating, ratings_count, page_count, language)",
    )
    .limit(2000);

  if (error) throw new Error(error.message);
  const all = data ?? [];
  console.log(`读取 ${all.length} 部作品…`);

  const flattened = all.map((row) => {
    const editions =
      (row.book_editions as
        | {
            id: string;
            title: string;
            description: string | null;
            cover_url: string | null;
            rating: number | null;
            ratings_count: number | null;
            page_count: number | null;
            language: string | null;
          }[]
        | null) ?? [];
    const rep =
      editions.find((e) => e.id === row.representative_edition_id) ??
      editions[0];
    const title = String(rep?.title ?? row.canonical_title ?? "");
    const description = rep?.description ?? null;
    const tags = assignGenreTags({
      title,
      description,
      seedTags: (row.topics as string[] | null) ?? [],
      allowSeedFallback: false,
    });
    const content_style = classifyContentStyles(
      title,
      description,
      tags,
      undefined,
    );
    return {
      id: row.id as string,
      title,
      author: (row.primary_author as string | null) ?? null,
      description,
      cover_url: rep?.cover_url ?? null,
      tags,
      content_style,
      rating: rep?.rating != null ? Number(rep.rating) : null,
      ratings_count:
        rep?.ratings_count != null ? Number(rep.ratings_count) : null,
      page_count: rep?.page_count ?? null,
      language: rep?.language ?? null,
    };
  });

  const { kept, rejected, deduped } = selectCatalogBooks(
    flattened,
    CATALOG_TARGET,
  );
  const keepIds = new Set(kept.map((b) => b.id as string));
  const toDelete = all
    .map((b) => b.id as string)
    .filter((id) => !keepIds.has(id));

  console.log(
    `质量淘汰 ${rejected}，版本去重 ${deduped}，保留 ${kept.length}，将删除 ${toDelete.length}`,
  );

  for (const book of kept) {
    const { error: upErr } = await supabase
      .from("works")
      .update({
        topics: book.tags,
        content_style: book.content_style,
      })
      .eq("id", book.id);
    if (upErr) {
      console.warn(`  更新标签失败 ${book.title}:`, upErr.message);
    }
  }

  if (toDelete.length === 0) {
    console.log("无需删除。");
    return;
  }

  const chunkSize = 50;
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += chunkSize) {
    const chunk = toDelete.slice(i, i + chunkSize);
    const { error: delErr, count } = await supabase
      .from("works")
      .delete({ count: "exact" })
      .in("id", chunk);
    if (delErr) {
      console.error(`  删除批次失败:`, delErr.message);
      continue;
    }
    deleted += count ?? chunk.length;
    console.log(`  已删 ${deleted}/${toDelete.length}`);
  }

  console.log("");
  console.log(`—— 完成 —— 删除 ${deleted} 部作品`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
