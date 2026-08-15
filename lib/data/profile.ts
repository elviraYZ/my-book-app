import { isMockMode } from "@/lib/data/config";
import { mockStore } from "@/lib/data/mock-store";
import {
  createDataClient,
  requireUserId,
} from "@/lib/supabase/data-client";
import type { Profile, ReadingDepth } from "@/lib/types";

function bustRecommendCache() {
  try {
    mockStore.clearLastRecommend();
  } catch {
    /* ignore */
  }
}

export type SaveProfileInput = {
  roles: string[];
  interests: string[];
  reading_purposes: string[];
  reading_depth: ReadingDepth | null;
};

function mapProfile(row: {
  id: string;
  roles?: string[] | null;
  interests?: string[] | null;
  reading_purposes?: string[] | null;
  reading_depth?: string | null;
  created_at: string;
  updated_at: string;
}): Profile {
  return {
    id: row.id,
    roles: row.roles ?? [],
    interests: row.interests ?? [],
    reading_purposes: row.reading_purposes ?? [],
    reading_depth: (row.reading_depth as ReadingDepth | null) ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 读取当前用户画像 */
export async function getProfile(): Promise<Profile> {
  if (isMockMode()) {
    return mockStore.getProfile();
  }

  const supabase = await createDataClient();
  const userId = await requireUserId(supabase);
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    const now = new Date().toISOString();
    const { data: created, error: insertError } = await supabase
      .from("profiles")
      .insert({ id: userId })
      .select("*")
      .single();
    if (insertError || !created) {
      throw new Error(insertError?.message ?? "无法创建画像");
    }
    return mapProfile(created);
  }

  return mapProfile(data);
}

/** 保存 onboarding 画像 */
export async function saveProfile(input: SaveProfileInput): Promise<Profile> {
  if (isMockMode()) {
    const prev = mockStore.getProfile();
    const now = new Date().toISOString();
    const saved = mockStore.saveProfile({
      ...prev,
      ...input,
      updated_at: now,
    });
    bustRecommendCache();
    return saved;
  }

  const supabase = await createDataClient();
  const userId = await requireUserId(supabase);
  const payload = {
    roles: input.roles,
    interests: input.interests,
    reading_purposes: input.reading_purposes,
    reading_depth: input.reading_depth,
  };

  // 触发器通常已建空行：优先 update；没有则 insert
  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (updateError) {
    throw new Error(updateError.message);
  }
  if (updated) {
    bustRecommendCache();
    return mapProfile(updated);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("profiles")
    .insert({ id: userId, ...payload })
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "保存画像失败");
  }
  bustRecommendCache();
  return mapProfile(inserted);
}
