"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Check,
  Code2,
  Coffee,
  GraduationCap,
  Leaf,
  Lightbulb,
  Loader2,
  Lock,
  Paintbrush,
  Palette,
  Target,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";

import { OnboardingRedirectOverlay } from "@/components/recommend-loading-overlay";
import { Button } from "@/components/ui/button";
import { getProfile, saveProfile } from "@/lib/data";
import type { ReadingDepth } from "@/lib/types";
import { cn } from "@/lib/utils";

type Option = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
};

const roles: Option[] = [
  {
    id: "design",
    label: "设计 / 产品",
    description: "玩法 / 关卡 / 系统 / 策划",
    icon: <Paintbrush className="size-5" />,
  },
  {
    id: "art",
    label: "美术 / 视觉",
    description: "原画 / 3D / 动画 / UI",
    icon: <Palette className="size-5" />,
  },
  {
    id: "dev",
    label: "开发 / 技术",
    description: "程序 / 引擎 / 工具链",
    icon: <Code2 className="size-5" />,
  },
  {
    id: "prod",
    label: "制作 / 管理",
    description: "项目 / 运营 / 市场 / 制作人",
    icon: <Users className="size-5" />,
  },
];

const purposes: Option[] = [
  {
    id: "solve",
    label: "解决问题",
    description: "应对具体工作挑战",
    icon: <Target className="size-5" />,
  },
  {
    id: "learn",
    label: "学习提升",
    description: "系统学习，增强专业能力",
    icon: <TrendingUp className="size-5" />,
  },
  {
    id: "inspire",
    label: "寻找灵感",
    description: "发现新想法，激发创意",
    icon: <Lightbulb className="size-5" />,
  },
  {
    id: "relax",
    label: "休闲放松",
    description: "轻松可读，拓展视野",
    icon: <Coffee className="size-5" />,
  },
];

const interests = [
  "游戏设计",
  "关卡设计",
  "引擎开发",
  "产品策略",
  "用户研究",
  "叙事 / 剧情",
  "美术设定",
  "3D 技术",
  "AI / 算法",
  "游戏运营",
  "数据分析",
  "市场营销",
] as const;

const intensities: Option[] = [
  {
    id: "light",
    label: "轻松翻翻",
    description: "碎片时间也能读完一小节",
    icon: <Leaf className="size-5" />,
  },
  {
    id: "medium",
    label: "认真读读",
    description: "需要专注，稳步提升",
    icon: <BookOpen className="size-5" />,
  },
  {
    id: "deep",
    label: "啃一啃",
    description: "深入钻研，适合系统补课",
    icon: <GraduationCap className="size-5" />,
  },
];

function toggleItem(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function SelectCard({
  selected,
  onClick,
  option,
}: {
  selected: boolean;
  onClick: () => void;
  option: Option;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start gap-2 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all",
        selected
          ? "border-teal-500 ring-2 ring-teal-500/20"
          : "border-border/80 hover:border-primary/30 hover:bg-slate-50/80",
      )}
    >
      {selected ? (
        <span className="absolute top-2.5 right-2.5 flex size-5 items-center justify-center rounded-full bg-teal-500 text-white">
          <Check className="size-3" strokeWidth={3} />
        </span>
      ) : null}
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-xl",
          selected ? "bg-teal-50 text-teal-600" : "bg-slate-100 text-slate-600",
        )}
      >
        {option.icon}
      </span>
      <span className="text-sm font-semibold text-foreground">
        {option.label}
      </span>
      <span className="text-xs leading-relaxed text-muted-foreground">
        {option.description}
      </span>
    </button>
  );
}

function RequiredMark({ done }: { done?: boolean }) {
  return (
    <span
      className={cn(
        "ml-0.5 font-semibold",
        done ? "text-teal-600" : "text-rose-500",
      )}
      aria-hidden
    >
      *
    </span>
  );
}

function SectionTitle({
  step,
  title,
  hint,
  required,
  done,
  missing,
}: {
  step: number;
  title: string;
  hint: string;
  required?: boolean;
  done?: boolean;
  missing?: boolean;
}) {
  return (
    <div className="space-y-1">
      <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs",
            missing
              ? "bg-rose-100 text-rose-600"
              : done
                ? "bg-teal-100 text-teal-700"
                : "bg-primary/10 text-primary",
          )}
        >
          {done && !missing ? (
            <Check className="size-3.5" strokeWidth={3} />
          ) : (
            step
          )}
        </span>
        <span>
          {title}
          {required ? <RequiredMark done={done && !missing} /> : null}
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {hint}
        </span>
        {required ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              missing
                ? "bg-rose-50 text-rose-600"
                : done
                  ? "bg-teal-50 text-teal-700"
                  : "bg-rose-50 text-rose-600",
            )}
          >
            必选
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            可选
          </span>
        )}
      </h2>
      {missing ? (
        <p className="pl-8 text-xs text-rose-600">请至少选择 1 项后继续</p>
      ) : null}
    </div>
  );
}

export function OnboardingForm() {
  const router = useRouter();
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [intensity, setIntensity] = useState("");
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [loading, setLoading] = useState(true);
  /** 已有必填画像 → 修改语气；否则首次建立 */
  const [isEdit, setIsEdit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profile = await getProfile();
        if (cancelled) return;
        const complete =
          profile.roles.length > 0 && profile.interests.length > 0;
        setIsEdit(complete);
        if (complete || profile.roles.length || profile.interests.length) {
          setSelectedRoles(profile.roles);
          setSelectedInterests(profile.interests);
          setSelectedPurposes(profile.reading_purposes);
          setIntensity(profile.reading_depth ?? "");
        } else {
          // 首次：给一组温和默认，降低空白页压力
          setSelectedRoles(["design"]);
          setSelectedPurposes(["solve", "learn"]);
          setSelectedInterests(["游戏设计", "关卡设计", "引擎开发"]);
          setIntensity("light");
        }
      } catch {
        if (!cancelled) {
          setSelectedRoles(["design"]);
          setSelectedPurposes(["solve", "learn"]);
          setSelectedInterests(["游戏设计", "关卡设计", "引擎开发"]);
          setIntensity("light");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rolesDone = selectedRoles.length > 0;
  const interestsDone = selectedInterests.length > 0;

  const missing = useMemo(
    () => ({
      roles: !rolesDone,
      interests: !interestsDone,
    }),
    [rolesDone, interestsDone],
  );

  const missingLabels = useMemo(() => {
    const list: string[] = [];
    if (missing.roles) list.push("岗位");
    if (missing.interests) list.push("感兴趣领域");
    return list;
  }, [missing]);

  const selectedSummary = useMemo(() => {
    return {
      roles: roles
        .filter((r) => selectedRoles.includes(r.id))
        .map((r) => r.label),
      purposes: purposes
        .filter((p) => selectedPurposes.includes(p.id))
        .map((p) => p.label),
      interests: selectedInterests,
      intensity: intensities.find((i) => i.id === intensity)?.label ?? "",
    };
  }, [selectedRoles, selectedPurposes, selectedInterests, intensity]);

  const clearAll = () => {
    setSelectedRoles([]);
    setSelectedPurposes([]);
    setSelectedInterests([]);
    setIntensity("");
    setAttemptedSubmit(true);
  };

  const canSubmit = missingLabels.length === 0;
  const highlight = (key: keyof typeof missing) =>
    attemptedSubmit && missing[key];

  const handleSubmit = async () => {
    if (!canSubmit) {
      setAttemptedSubmit(true);
      return;
    }
    setSaving(true);
    setRedirecting(true);
    try {
      await saveProfile({
        roles: selectedRoles,
        interests: selectedInterests,
        reading_purposes: selectedPurposes,
        reading_depth: (intensity || null) as ReadingDepth | null,
      });
      // 整页进入首页，确保 middleware 重新读到已完成的画像（避免 client 导航仍被拦回 onboarding）
      window.location.assign("/");
    } catch (err) {
      setSaving(false);
      setRedirecting(false);
      window.alert(
        err instanceof Error ? err.message : "保存失败，请稍后重试",
      );
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        加载画像…
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_300px] lg:gap-8 sm:px-6">
      <OnboardingRedirectOverlay open={redirecting} />
      <div className="space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {isEdit ? "修改你的阅读画像" : "欢迎建立你的阅读画像 👋"}
          </h1>
          <p className="text-muted-foreground">
            {isEdit
              ? "调整岗位与兴趣后，后续推荐会按新的偏好更新"
              : "帮我们更懂你，为你推荐更有价值的游戏行业好书"}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3.5" />
              选择仅用于个性化推荐，不会对外泄露
            </span>
            <span className="text-slate-300">|</span>
            <span>
              {isEdit
                ? "「岗位」「感兴趣领域」仍为必选；改完后记得保存"
                : "仅「岗位」「感兴趣领域」为必选；其余可选，选了推荐会更准"}
            </span>
          </div>
        </div>

        {/* 1. 岗位 — 必选 */}
        <section
          className={cn(
            "space-y-3 rounded-2xl border p-4 transition-colors sm:p-5",
            highlight("roles")
              ? "border-rose-300 bg-rose-50/40"
              : rolesDone
                ? "border-teal-200 bg-white"
                : "border-slate-200 bg-white",
          )}
        >
          <SectionTitle
            step={1}
            title="你的岗位"
            hint="（可多选）"
            required
            done={rolesDone}
            missing={highlight("roles")}
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {roles.map((option) => (
              <SelectCard
                key={option.id}
                option={option}
                selected={selectedRoles.includes(option.id)}
                onClick={() => {
                  setSelectedRoles((prev) => toggleItem(prev, option.id));
                }}
              />
            ))}
          </div>
        </section>

        {/* 2. 感兴趣领域 — 必选 */}
        <section
          className={cn(
            "space-y-3 rounded-2xl border p-4 transition-colors sm:p-5",
            highlight("interests")
              ? "border-rose-300 bg-rose-50/40"
              : interestsDone
                ? "border-teal-200 bg-white"
                : "border-slate-200 bg-white",
          )}
        >
          <SectionTitle
            step={2}
            title="你感兴趣的领域"
            hint="（可多选）"
            required
            done={interestsDone}
            missing={highlight("interests")}
          />
          <div className="flex flex-wrap gap-2">
            {interests.map((item) => {
              const selected = selectedInterests.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setSelectedInterests((prev) => toggleItem(prev, item));
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                    selected
                      ? "border-teal-500 bg-teal-50 text-teal-700"
                      : "border-border bg-white text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  {selected ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : null}
                  {item}
                </button>
              );
            })}
            <button
              type="button"
              className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground"
            >
              + 自定义领域
            </button>
          </div>
        </section>

        {/* 3. 阅读目的 — 可选 */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <SectionTitle
            step={3}
            title="阅读目的"
            hint="（可多选）"
            done={selectedPurposes.length > 0}
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {purposes.map((option) => (
              <SelectCard
                key={option.id}
                option={option}
                selected={selectedPurposes.includes(option.id)}
                onClick={() =>
                  setSelectedPurposes((prev) => toggleItem(prev, option.id))
                }
              />
            ))}
          </div>
        </section>

        {/* 4. 阅读投入 — 可选 */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <SectionTitle
            step={4}
            title="你偏好的阅读投入"
            hint="（单选）"
            done={Boolean(intensity)}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {intensities.map((option) => (
              <SelectCard
                key={option.id}
                option={option}
                selected={intensity === option.id}
                onClick={() =>
                  setIntensity((prev) => (prev === option.id ? "" : option.id))
                }
              />
            ))}
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">已选偏好</h3>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="size-3.5" />
              清空
            </button>
          </div>

          <div className="space-y-3 text-sm">
            <PreferenceGroup
              label="岗位"
              required
              done={rolesDone}
              items={selectedSummary.roles}
              missing={highlight("roles")}
            />
            <PreferenceGroup
              label="领域"
              required
              done={interestsDone}
              items={selectedSummary.interests}
              missing={highlight("interests")}
            />
            <PreferenceGroup
              label="阅读目的"
              items={selectedSummary.purposes}
            />
            <PreferenceGroup
              label="阅读投入"
              items={
                selectedSummary.intensity ? [selectedSummary.intensity] : []
              }
            />
          </div>

          <div className="rounded-xl bg-sky-50 p-4 text-sm text-slate-700">
            <p className="mb-2 font-medium text-sky-900">
              {isEdit ? "修改后会发生什么" : "为您定制的推荐体验"}
            </p>
            <ul className="space-y-1.5 text-xs text-sky-900/80">
              {isEdit ? (
                <>
                  <li>✓ 新的岗位与兴趣会立刻用于推荐</li>
                  <li>✓ 已保存的专题与收藏不会被清空</li>
                  <li>✓ 可随时再回来调整</li>
                </>
              ) : (
                <>
                  <li>✓ 更精准匹配当前工作场景</li>
                  <li>✓ 平衡专业提升与兴趣阅读</li>
                  <li>✓ 持续形成学习路径</li>
                  <li>✓ 减少无效筛选时间</li>
                </>
              )}
            </ul>
          </div>

          {!canSubmit ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
              {attemptedSubmit ? (
                <>
                  还不能保存：请先完成必选
                  <span className="font-semibold">
                    {" "}
                    {missingLabels.join("、")}
                  </span>
                </>
              ) : isEdit ? (
                <>请保留「岗位」和「感兴趣领域」至少各一项</>
              ) : (
                <>只需完成「岗位」和「感兴趣领域」即可开启推荐，其余为可选</>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-xs text-teal-700">
              {isEdit
                ? "可以保存修改，推荐将按新画像更新"
                : "必选项已完成，可以开启专属推荐"}
            </div>
          )}

          <Button
            className="h-11 w-full rounded-xl bg-gradient-to-r from-teal-500 to-sky-500 text-white hover:from-teal-600 hover:to-sky-600 disabled:opacity-60"
            disabled={saving}
            onClick={() => void handleSubmit()}
          >
            {saving
              ? "保存中…"
              : isEdit
                ? "保存修改 →"
                : "完成设置，开启专属推荐 →"}
          </Button>
          {isEdit ? (
            <Button
              variant="outline"
              className="h-10 w-full rounded-xl"
              disabled={saving}
              onClick={() => router.push("/")}
            >
              取消并返回
            </Button>
          ) : null}
          <p className="text-center text-xs text-muted-foreground">
            {isEdit
              ? "保存后返回首页；之后也可从顶栏头像再改"
              : "完成必选后将进入首页；推荐会按你的画像定制"}
          </p>
        </div>
      </aside>
    </div>
  );
}

function PreferenceGroup({
  label,
  items,
  required,
  done,
  missing,
}: {
  label: string;
  items: string[];
  required?: boolean;
  done?: boolean;
  missing?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div>
        <p
          className={cn(
            "mb-1.5 text-xs",
            missing ? "font-medium text-rose-600" : "text-muted-foreground",
          )}
        >
          {label}
          {required ? <RequiredMark done={false} /> : null}
          {!required ? (
            <span className="ml-1 text-[10px] text-slate-400">可选</span>
          ) : null}
        </p>
        <p
          className={cn(
            "text-xs",
            missing ? "text-rose-500" : "text-slate-400",
          )}
        >
          {missing
            ? "必选 · 尚未选择"
            : required
              ? "未选择"
              : "未选择（可跳过）"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">
        {label}
        {required ? <RequiredMark done={done} /> : null}
        {!required ? (
          <span className="ml-1 text-[10px] text-slate-400">可选</span>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-700"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
