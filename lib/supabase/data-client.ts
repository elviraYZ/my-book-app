import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

/**
 * 数据层统一用浏览器客户端，避免把 next/headers（server.ts）打进 Client Component。
 * SSR 阶段无登录 cookie 时 getUser 为空；页面靠客户端 hydrate 再拉真实数据。
 */
export async function createDataClient(): Promise<SupabaseClient> {
  return createClient();
}

export async function requireUserId(
  supabase: SupabaseClient,
): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("请先登录后再使用此功能");
  }
  return user.id;
}
