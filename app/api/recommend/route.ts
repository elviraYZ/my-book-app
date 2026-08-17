import { NextResponse } from "next/server";

import { runRecommendPipeline } from "@/lib/data/recommend/pipeline";
import { ONLINE_GOOGLE_INGEST_ENABLED } from "@/lib/data/recommend/weights";
import { createClient } from "@/lib/supabase/server";
import type { RecommendRequest } from "@/lib/types";

/**
 * Context-first 推荐入口（AI Search）。
 * MVP：本地 catalog only；同步 Google ingest 默认关闭。
 * Coverage GOOD/THIN/GAP 由 pipeline 记录。
 */
export async function POST(request: Request) {
  let body: Partial<RecommendRequest> & { topicId?: string } = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = body.prompt?.trim() ?? "";
  const hasContext =
    Boolean(prompt) ||
    Boolean(body.previous_turns?.length) ||
    Boolean(body.themes?.length);
  if (!hasContext) {
    return NextResponse.json(
      { error: "prompt or previous context is required" },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();
    const googleApiKey = process.env.GOOGLE_BOOKS_API_KEY?.trim();

    const result = await runRecommendPipeline(
      {
        prompt,
        topic_id: body.topic_id ?? body.topicId,
        previous_turns: body.previous_turns,
        themes: body.themes,
        keywords: body.keywords,
        preferences: body.preferences,
        goals: body.goals,
        goal: body.goal,
        depth: body.depth,
        session_bucket: body.session_bucket,
        special_notes: body.special_notes,
        initial_topics: body.initial_topics,
        profile: body.profile,
      },
      {
        supabase,
        googleApiKey,
        // MVP：默认不在线补库；需 ONLINE_GOOGLE_INGEST_ENABLED=true 且显式开启
        enableIngest: ONLINE_GOOGLE_INGEST_ENABLED && Boolean(googleApiKey),
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "recommend failed",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/recommend",
    methods: ["POST"],
    note: "Context-first local catalog; online Google ingest disabled for MVP.",
  });
}
