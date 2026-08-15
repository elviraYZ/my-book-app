"use client";

import { useState, type ReactNode } from "react";
import { PencilLine, Plus, Sparkles, X } from "lucide-react";

import {
  DEPTH_OPTIONS,
  FILTER_SECTION_LABELS,
  GOAL_OPTIONS,
  MAX_GOALS,
  MAX_KEYWORDS,
  MAX_PREFERENCES,
  MAX_THEMES,
  PREFERENCE_OPTIONS,
  SESSION_OPTIONS,
  THEME_OPTIONS,
} from "@/lib/data";
import type { ReadingDepth } from "@/lib/types";
import { cn } from "@/lib/utils";

export {
  GOAL_OPTIONS,
  normalizeGoalSelection,
  normalizeGoalsSelection,
} from "@/lib/data";

export type DemandEditorBarProps = {
  demandText: string;
  onDemandChange: (text: string) => void;
  editingDemand: boolean;
  onToggleEditDemand: () => void;
  demandDirty: boolean;
  onDiscardDemand: () => void;
  demandExpanded: boolean;
  onToggleDemandExpanded: () => void;
  selectedThemes: string[];
  selectedKeywords: string[];
  selectedGoals: string[];
  selectedPreferences: string[];
  selectedDepth: ReadingDepth | "";
  selectedSession: string;
  onToggleTheme: (tag: string) => void;
  onAddKeyword: (tag: string) => void;
  onRemoveKeyword: (tag: string) => void;
  onToggleGoal: (goal: string) => void;
  onTogglePreference: (tag: string) => void;
  onDepthChange: (value: ReadingDepth | "") => void;
  onSessionChange: (value: string) => void;
  conditionsDirty: boolean;
  onDiscardConditions: () => void;
  adjustOpen: boolean;
  onAdjustOpenChange: (open: boolean) => void;
  totalCount: number;
  actions: ReactNode;
  hint?: string;
  disabled?: boolean;
};

export function DemandEditorBar({
  demandText,
  onDemandChange,
  editingDemand,
  onToggleEditDemand,
  demandDirty,
  onDiscardDemand,
  demandExpanded,
  onToggleDemandExpanded,
  selectedThemes,
  selectedKeywords,
  selectedGoals,
  selectedPreferences,
  selectedDepth,
  selectedSession,
  onToggleTheme,
  onAddKeyword,
  onRemoveKeyword,
  onToggleGoal,
  onTogglePreference,
  onDepthChange,
  onSessionChange,
  conditionsDirty,
  onDiscardConditions,
  adjustOpen,
  onAdjustOpenChange,
  totalCount,
  actions,
  hint,
  disabled,
}: DemandEditorBarProps) {
  const [keywordDraft, setKeywordDraft] = useState("");

  const commitKeyword = () => {
    const t = keywordDraft.trim();
    if (!t) return;
    onAddKeyword(t);
    setKeywordDraft("");
  };

  return (
    <section className="rounded-2xl border border-[#E6EAF2] bg-white shadow-[0_1px_2px_rgba(31,41,55,0.04)]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.45fr)_minmax(7.5rem,0.55fr)_minmax(11rem,0.95fr)] lg:items-stretch">
        <div className="min-w-0 space-y-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F5DFF]">
                <Sparkles className="size-3.5" />
              </span>
              <p className="text-[13px] font-semibold text-[#111827]">
                当前需求
                {demandDirty ? (
                  <span className="ml-1.5 text-[11px] font-medium text-amber-600">
                    已编辑
                  </span>
                ) : null}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {demandDirty ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onDiscardDemand}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#6B7280] hover:bg-[#FEF2F2] hover:text-[#DC2626]"
                >
                  撤销
                </button>
              ) : null}
              <button
                type="button"
                disabled={disabled}
                onClick={onToggleEditDemand}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors",
                  editingDemand
                    ? "border-[#4F5DFF] bg-[#EEF2FF] text-[#4F5DFF]"
                    : "border-[#C9D4FF] bg-white text-[#4F5DFF] hover:bg-[#F5F7FF]",
                )}
              >
                <PencilLine className="size-3.5" />
                {editingDemand ? "完成编辑" : "编辑需求"}
              </button>
            </div>
          </div>
          {editingDemand ? (
            <textarea
              autoFocus
              value={demandText}
              onChange={(e) => onDemandChange(e.target.value)}
              rows={4}
              disabled={disabled}
              className="w-full resize-none rounded-xl border border-[#C9D4FF] bg-[#F8F9FF] px-3 py-2 text-[13px] leading-relaxed text-[#374151] outline-none placeholder:text-[#C5CAD6] disabled:opacity-60"
              placeholder="描述你的阅读需求…"
            />
          ) : (
            <>
              <p
                className={cn(
                  "text-[13px] leading-relaxed text-[#4B5568]",
                  !demandExpanded && "line-clamp-3",
                )}
              >
                {demandText.trim() || "暂无需求描述"}
              </p>
              {demandText.trim().length > 60 ? (
                <button
                  type="button"
                  onClick={onToggleDemandExpanded}
                  className="text-[12px] font-semibold text-[#4F5DFF] hover:underline"
                >
                  {demandExpanded ? "收起" : "查看详情 >"}
                </button>
              ) : null}
            </>
          )}
        </div>

        <div className="relative z-20 min-w-0 space-y-1.5 overflow-visible border-t border-[#EEF1F6] p-4 lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-[#111827]">
              推荐条件
              {conditionsDirty ? (
                <span className="ml-1.5 text-[11px] font-medium text-amber-600">
                  已修改
                </span>
              ) : null}
            </p>
            <div className="relative flex shrink-0 items-center gap-1">
              {conditionsDirty ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onDiscardConditions}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#6B7280] hover:bg-[#FEF2F2] hover:text-[#DC2626]"
                >
                  撤销
                </button>
              ) : null}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAdjustOpenChange(!adjustOpen)}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors",
                  adjustOpen
                    ? "border-[#4F5DFF] bg-[#EEF2FF] text-[#4F5DFF]"
                    : "border-[#C9D4FF] bg-white text-[#4F5DFF] hover:bg-[#F5F7FF]",
                )}
              >
                <Plus className="size-3.5" />
                调整条件
              </button>
              {adjustOpen ? (
                <div className="absolute top-full right-0 z-50 mt-1 max-h-[min(70vh,32rem)] w-[min(calc(100vw-2rem),22rem)] overflow-y-auto rounded-xl border border-[#E6EAF2] bg-white p-3 shadow-lg sm:w-[22rem]">
                  <p className="text-[11px] font-semibold text-[#374151]">
                    按类别调整推荐条件
                  </p>
                  <p className="mt-0.5 text-[10px] text-[#9AA3B5]">
                    主题来自正式题材库 · 本次关注可自由输入 · 冲突以你最新修改为准
                  </p>

                  <div className="mt-2.5 space-y-2.5">
                    <div>
                      <p className="mb-1 text-[10px] font-medium text-[#8B95A8]">
                        主题 ({selectedThemes.length}/{MAX_THEMES})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {THEME_OPTIONS.map((tag) => {
                          const on = selectedThemes.includes(tag);
                          const blocked =
                            !on && selectedThemes.length >= MAX_THEMES;
                          return (
                            <button
                              key={tag}
                              type="button"
                              disabled={blocked || disabled}
                              onClick={() => onToggleTheme(tag)}
                              className={cn(
                                "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                                on
                                  ? "bg-[#4F5DFF] text-white"
                                  : "bg-[#F3F5F9] text-[#5F6B7C] hover:bg-[#EEF2FF]",
                                blocked && "cursor-not-allowed opacity-40",
                              )}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] font-medium text-[#8B95A8]">
                        本次关注 ({selectedKeywords.length}/{MAX_KEYWORDS})
                      </p>
                      <div className="mb-1.5 flex gap-1">
                        <input
                          value={keywordDraft}
                          disabled={
                            disabled || selectedKeywords.length >= MAX_KEYWORDS
                          }
                          onChange={(e) => setKeywordDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitKeyword();
                            }
                          }}
                          placeholder="如：森林、空间引导"
                          className="h-7 min-w-0 flex-1 rounded-md border border-[#E6EAF2] px-2 text-[11px] outline-none focus:border-[#C9D4FF]"
                        />
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={commitKeyword}
                          className="h-7 shrink-0 rounded-md bg-[#EEF2FF] px-2 text-[11px] font-semibold text-[#4F5DFF]"
                        >
                          添加
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedKeywords.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            disabled={disabled}
                            onClick={() => onRemoveKeyword(tag)}
                            className="inline-flex items-center gap-0.5 rounded-md bg-[#F5F3FF] px-1.5 py-0.5 text-[10px] font-medium text-[#6D28D9]"
                          >
                            {tag}
                            <X className="size-2.5 opacity-70" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] font-medium text-[#8B95A8]">
                        目标 ({selectedGoals.length}/{MAX_GOALS})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {GOAL_OPTIONS.map((g) => {
                          const on = selectedGoals.includes(g);
                          const blocked =
                            !on && selectedGoals.length >= MAX_GOALS;
                          return (
                            <button
                              key={g}
                              type="button"
                              disabled={blocked || disabled}
                              onClick={() => onToggleGoal(g)}
                              className={cn(
                                "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                                on
                                  ? "bg-[#0F766E] text-white"
                                  : "bg-[#F3F5F9] text-[#5F6B7C]",
                                blocked && "opacity-40",
                              )}
                            >
                              {g}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] font-medium text-[#8B95A8]">
                        内容偏好 ({selectedPreferences.length}/{MAX_PREFERENCES}
                        )
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {PREFERENCE_OPTIONS.map((tag) => {
                          const on = selectedPreferences.includes(tag);
                          const blocked =
                            !on &&
                            selectedPreferences.length >= MAX_PREFERENCES;
                          return (
                            <button
                              key={tag}
                              type="button"
                              disabled={blocked || disabled}
                              onClick={() => onTogglePreference(tag)}
                              className={cn(
                                "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                                on
                                  ? "bg-[#15803D] text-white"
                                  : "bg-[#F3F5F9] text-[#5F6B7C] hover:bg-[#F0FDF4]",
                                blocked && "cursor-not-allowed opacity-40",
                              )}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] font-medium text-[#8B95A8]">
                        {FILTER_SECTION_LABELS.difficulties}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onDepthChange("")}
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[11px] font-medium",
                            selectedDepth === ""
                              ? "bg-[#4F5DFF] text-white"
                              : "bg-[#F3F5F9] text-[#5F6B7C]",
                          )}
                        >
                          不限
                        </button>
                        {DEPTH_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={disabled}
                            onClick={() => onDepthChange(opt.value)}
                            className={cn(
                              "rounded-md px-2 py-0.5 text-[11px] font-medium",
                              selectedDepth === opt.value
                                ? "bg-[#4F5DFF] text-white"
                                : "bg-[#F3F5F9] text-[#5F6B7C]",
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] font-medium text-[#8B95A8]">
                        {FILTER_SECTION_LABELS.times}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {SESSION_OPTIONS.map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            disabled={disabled}
                            onClick={() => onSessionChange(opt.value)}
                            className={cn(
                              "rounded-md px-2 py-0.5 text-[11px] font-medium",
                              selectedSession === opt.value
                                ? "bg-[#4F5DFF] text-white"
                                : "bg-[#F3F5F9] text-[#5F6B7C]",
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onAdjustOpenChange(false)}
                    className="mt-3 w-full rounded-lg bg-[#F3F5F9] py-1.5 text-[11px] font-semibold text-[#5F6B7C] hover:bg-[#EEF1F6]"
                  >
                    完成
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 w-14 shrink-0 text-[10px] text-[#9AA3B5]">
                主题
              </span>
              {selectedThemes.length === 0 ? (
                <span className="text-[11px] text-[#C5CAD6]">未选</span>
              ) : (
                selectedThemes.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggleTheme(tag)}
                    className="inline-flex items-center gap-0.5 rounded-md bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-medium text-[#4F5DFF] hover:bg-[#E0E7FF]"
                    title="移除"
                  >
                    {tag}
                    <X className="size-2.5 opacity-70" />
                  </button>
                ))
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 w-14 shrink-0 text-[10px] text-[#9AA3B5]">
                本次关注
              </span>
              {selectedKeywords.length === 0 ? (
                <span className="text-[11px] text-[#C5CAD6]">未选</span>
              ) : (
                selectedKeywords.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    disabled={disabled}
                    onClick={() => onRemoveKeyword(tag)}
                    className="inline-flex items-center gap-0.5 rounded-md bg-[#F5F3FF] px-1.5 py-0.5 text-[10px] font-medium text-[#6D28D9] hover:bg-[#EDE9FE]"
                    title="移除"
                  >
                    {tag}
                    <X className="size-2.5 opacity-70" />
                  </button>
                ))
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 w-14 shrink-0 text-[10px] text-[#9AA3B5]">
                目标与偏好
              </span>
              {selectedGoals.length === 0 &&
              selectedPreferences.length === 0 ? (
                <span className="text-[11px] text-[#C5CAD6]">未指定</span>
              ) : null}
              {selectedGoals.map((tag) => (
                <button
                  key={`goal-${tag}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggleGoal(tag)}
                  className="inline-flex items-center gap-0.5 rounded-md bg-[#ECFDF5] px-1.5 py-0.5 text-[10px] font-medium text-[#0F766E] hover:bg-[#D1FAE5]"
                  title="移除"
                >
                  {tag}
                  <X className="size-2.5 opacity-70" />
                </button>
              ))}
              {selectedPreferences.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    disabled={disabled}
                    onClick={() => onTogglePreference(tag)}
                    className="inline-flex items-center gap-0.5 rounded-md bg-[#F0FDF4] px-1.5 py-0.5 text-[10px] font-medium text-[#15803D] hover:bg-[#DCFCE7]"
                    title="移除"
                  >
                    {tag}
                    <X className="size-2.5 opacity-70" />
                  </button>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 w-14 shrink-0 text-[10px] text-[#9AA3B5]">
                阅读条件
              </span>
              <select
                value={selectedDepth}
                disabled={disabled}
                onChange={(e) =>
                  onDepthChange(e.target.value as ReadingDepth | "")
                }
                aria-label={FILTER_SECTION_LABELS.difficulties}
                className="h-7 max-w-[9.5rem] rounded-md border border-[#E6EAF2] bg-white px-1.5 text-[11px] text-[#374151] outline-none"
              >
                <option value="">
                  {FILTER_SECTION_LABELS.difficulties}·不限
                </option>
                {DEPTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={selectedSession}
                disabled={disabled}
                onChange={(e) => onSessionChange(e.target.value)}
                aria-label={FILTER_SECTION_LABELS.times}
                className="h-7 max-w-[9.5rem] rounded-md border border-[#E6EAF2] bg-white px-1.5 text-[11px] text-[#374151] outline-none"
              >
                {SESSION_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.value === ""
                      ? `${FILTER_SECTION_LABELS.times}·不限`
                      : opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="border-t border-[#EEF1F6] p-4 text-left lg:border-t-0 lg:border-l">
          <p className="text-[13px] font-semibold text-[#111827]">为你找到</p>
          <p className="mt-2 text-[28px] leading-none font-bold tracking-tight text-[#111827]">
            {totalCount}
            <span className="ml-1 text-[13px] font-semibold text-[#6B7280]">
              本相关书籍
            </span>
          </p>
          <p className="mt-2 text-[11px] leading-snug text-[#9AA3B5]">
            {hint ?? "综合相关性、口碑与可读性"}
          </p>
        </div>

        <div className="flex flex-col justify-center gap-2 rounded-b-2xl border-t border-[#EEF1F6] bg-[#F7F9FF] p-3 lg:rounded-b-none lg:rounded-r-2xl lg:border-t-0 lg:border-l">
          {actions}
        </div>
      </div>
    </section>
  );
}
