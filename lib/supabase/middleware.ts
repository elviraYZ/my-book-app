import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/")
  );
}

function isOnboardingComplete(profile: {
  roles?: string[] | null;
  interests?: string[] | null;
} | null) {
  return (
    !!profile &&
    (profile.roles?.length ?? 0) > 0 &&
    (profile.interests?.length ?? 0) > 0
  );
}

function redirectTo(request: NextRequest, path: string) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  if (path === "/login") {
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next && next !== "/login") {
      url.searchParams.set("next", next);
    }
  }
  return NextResponse.redirect(url);
}

/** 刷新 Auth cookie，并按登录 / onboarding 状态做路由门禁 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // mock 模式不强制登录，方便本地无 Supabase 调试
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "api") {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user) {
    if (isPublicPath(pathname)) return supabaseResponse;
    return redirectTo(request, "/login");
  }

  // 已登录访问登录页 → 按画像完成度分流
  if (pathname === "/login") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("roles, interests")
      .eq("id", user.id)
      .maybeSingle();
    if (isOnboardingComplete(profile)) {
      const next = request.nextUrl.searchParams.get("next");
      if (next && next.startsWith("/") && !next.startsWith("//")) {
        return redirectTo(request, next.split("?")[0] || "/");
      }
      return redirectTo(request, "/");
    }
    return redirectTo(request, "/onboarding");
  }

  if (pathname.startsWith("/auth/")) {
    return supabaseResponse;
  }

  // API 只要求登录，不强制 onboarding（由前端页面门禁覆盖）
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, interests")
    .eq("id", user.id)
    .maybeSingle();

  const onboarded = isOnboardingComplete(profile);

  if (!onboarded && pathname !== "/onboarding") {
    return redirectTo(request, "/onboarding");
  }

  // 已完成 onboarding 仍允许进入 /onboarding 修改画像
  return supabaseResponse;
}
