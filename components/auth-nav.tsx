"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, UserRound } from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { buttonVariants } from "@/components/ui/button";
import { isMockMode } from "@/lib/data/config";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function AuthNav({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isMockMode()) {
      setReady(true);
      return;
    }
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const onLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.refresh();
      router.push("/");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <span className="inline-flex size-8 items-center justify-center text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    );
  }

  if (isMockMode()) {
    return (
      <Link
        href="/onboarding"
        className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary"
        aria-label="个人画像"
        title="阅读画像（mock）"
      >
        <UserRound className="size-4" />
      </Link>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className={cn(
          compact
            ? "inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary"
            : buttonVariants({ variant: "ghost", size: "sm" }),
          !compact && "gap-1.5 text-muted-foreground",
        )}
        aria-label="登录"
        title="登录"
      >
        <UserRound className="size-3.5" />
        {compact ? null : "登录"}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Link
        href="/onboarding"
        className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary"
        aria-label="个人画像"
        title={user.email ?? "阅读画像"}
      >
        <UserRound className="size-4" />
      </Link>
      <button
        type="button"
        onClick={() => void onLogout()}
        disabled={busy}
        className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        aria-label="退出登录"
        title="退出登录"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <LogOut className="size-3.5" />
        )}
      </button>
    </div>
  );
}
