import { NextResponse } from "next/server";

import {
  EXPLORE_PAGE_SIZE,
  filtersFromSearchParams,
  listExploreBooksPage,
} from "@/lib/data/explore";

/**
 * 探索分页：?offset=&limit=&genres=&…&interestTags=游戏设计,关卡设计
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number(
    url.searchParams.get("limit") ?? String(EXPLORE_PAGE_SIZE),
  );
  const interestTags =
    url.searchParams.get("interestTags")?.split(",").filter(Boolean) ?? [];

  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ error: "invalid offset" }, { status: 400 });
  }
  if (!Number.isFinite(limit) || limit < 1) {
    return NextResponse.json({ error: "invalid limit" }, { status: 400 });
  }

  try {
    const filters = filtersFromSearchParams(url.searchParams);
    const page = await listExploreBooksPage({
      filters,
      offset,
      limit: Math.min(limit, 100),
      interestTags,
    });
    return NextResponse.json(page);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "explore failed",
      },
      { status: 500 },
    );
  }
}
