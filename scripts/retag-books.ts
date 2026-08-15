/**
 * 用规则重标 works.topics / primary_topics / content_style / difficulty 等。
 * 完整 enrichment + force embed 请用：npm run enrich:works
 *
 * 用法：npm run retag:books
 */

import { createClient } from "@supabase/supabase-js";

import { enrichWorkMetadata } from "../lib/data/work-enrichment";

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
      "id, canonical_title, topics, primary_topics, content_style, display_summary, use_cases, concepts, difficulty, representative_edition_id, book_editions!book_editions_work_id_fkey(id, title, description, page_count)",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  console.log(`读取 ${rows.length} 部作品，开始规则 enrichment…`);

  let changed = 0;
  let unchanged = 0;

  for (const row of rows) {
    const editions = (row.book_editions as
      | {
          id: string;
          title: string;
          description: string | null;
          page_count: number | null;
        }[]
      | null) ?? [];
    const rep =
      editions.find((e) => e.id === row.representative_edition_id) ??
      editions[0];
    const title = String(rep?.title ?? row.canonical_title ?? "");
    const description = (rep?.description as string | null) ?? null;

    const next = enrichWorkMetadata({
      title,
      description,
      previousTopics: (row.topics as string[] | null) ?? [],
      previousStyles: (row.content_style as string[] | null) ?? undefined,
      previousUseCases: (row.use_cases as string[] | null) ?? [],
      previousConcepts: (row.concepts as string[] | null) ?? [],
      previousDisplaySummary: (row.display_summary as string | null) ?? null,
      pageCount: rep?.page_count ?? null,
      force: true,
    });

    const prevTopics = (row.topics as string[] | null) ?? [];
    const sameTopics =
      prevTopics.length === next.topics.length &&
      prevTopics.every((t, i) => t === next.topics[i]);
    const prevStyles = (row.content_style as string[] | null) ?? [];
    const sameStyles =
      prevStyles.length === next.content_style.length &&
      prevStyles.every((s, i) => s === next.content_style[i]);

    if (sameTopics && sameStyles && row.difficulty === next.difficulty) {
      // 仍写回 primary/concepts/use_cases/summary，保证新列有值
    }

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
      console.error(`  失败 ${title}:`, upErr.message);
      continue;
    }

    if (sameTopics && sameStyles) {
      unchanged += 1;
    } else {
      changed += 1;
      console.log(
        `  ✓ ${title.slice(0, 28)}…  [${prevTopics.join(",")}] → [${next.topics.join(",")}]`,
      );
    }
  }

  console.log("");
  console.log(
    `—— 完成 —— 标签/风格变更 ${changed}，其余已补齐 enrichment 字段 ${unchanged}`,
  );
  console.log("完整 force embed 请再跑：npm run enrich:works -- --embed-only");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
