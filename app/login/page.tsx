"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Loader2 } from "lucide-react";
import { Suspense } from "react";

import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const authError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(
    authError ? "登录链接无效或已过期，请重试" : null,
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || loading) return;
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const emailTrimmed = email.trim();
    const dest = next.startsWith("/") ? next : "/";

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: emailTrimmed,
          password,
        });
        if (error) throw error;

        // 多数项目关闭邮箱确认时 signUp 已带 session；否则再密码登录一次
        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: emailTrimmed,
            password,
          });
          if (signInError) {
            setMessage("注册成功。请查收确认邮件后再登录。");
            setMode("signin");
            setLoading(false);
            return;
          }
        }
        setMessage("注册成功，正在登录…");
      }

      // 门禁由 proxy 根据画像完成度再分流到 /onboarding 或业务页
      router.replace(dest);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "登录失败");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-6 px-4 py-10 sm:px-6">
      <div className="space-y-2 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <BookOpen className="size-6" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
          {mode === "signin" ? "登录游研书伴" : "注册账号"}
        </h1>
        <p className="text-sm text-[#71717A]">登录后同步专题、收藏与阅读画像</p>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-3 rounded-2xl border border-[#E6EAF2] bg-white p-5 shadow-sm"
      >
        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-[#374151]">邮箱</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-xl border border-[#E6EAF2] px-3 text-[14px] outline-none focus:border-[#4F5DFF]"
            placeholder="you@example.com"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-[#374151]">密码</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-xl border border-[#E6EAF2] px-3 text-[14px] outline-none focus:border-[#4F5DFF]"
            placeholder="至少 6 位"
          />
        </label>

        {message ? (
          <p className="rounded-xl bg-[#F8FAFC] px-3 py-2 text-[12px] text-[#4B5568]">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#4F5DFF] text-[14px] font-semibold text-white hover:opacity-95 disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {loading
            ? mode === "signup"
              ? "注册成功，正在登录…"
              : "登录中…"
            : mode === "signin"
              ? "登录"
              : "注册并登录"}
        </button>
      </form>

      <p className="text-center text-[13px] text-[#71717A]">
        {mode === "signin" ? (
          <>
            还没有账号？{" "}
            <button
              type="button"
              className="font-semibold text-[#4F5DFF] hover:underline"
              onClick={() => {
                setMode("signup");
                setMessage(null);
              }}
            >
              注册
            </button>
          </>
        ) : (
          <>
            已有账号？{" "}
            <button
              type="button"
              className="font-semibold text-[#4F5DFF] hover:underline"
              onClick={() => {
                setMode("signin");
                setMessage(null);
              }}
            >
              登录
            </button>
          </>
        )}
      </p>

      <p className="text-center text-[12px] text-[#A1A1AA]">
        <Link href="/" className={cn("hover:text-[#4F5DFF]")}>
          返回首页
        </Link>
        {" · "}
        <Link href="/onboarding" className="hover:text-[#4F5DFF]">
          完善阅读画像
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh bg-[#F4F6FA]">
      <SiteHeader variant="minimal" />
      <Suspense
        fallback={
          <div className="flex justify-center py-20 text-sm text-[#8B95A8]">
            <Loader2 className="size-4 animate-spin" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
