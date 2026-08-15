"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";

import {
  EXPLORE_FILTER_OPTIONS,
  FILTER_SECTION_LABELS,
  GENRE_FILTER_GROUPS,
  countActiveFilters,
  emptyExploreFilters,
  toggleFilterValue,
  type ExploreFilterKey,
} from "@/lib/data";
import type { ExploreFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

const sections: {
  key: Exclude<ExploreFilterKey, "genres">;
  title: string;
}[] = [
  { key: "purposes", title: FILTER_SECTION_LABELS.purposes },
  { key: "times", title: FILTER_SECTION_LABELS.times },
  { key: "difficulties", title: FILTER_SECTION_LABELS.difficulties },
];

type ExploreSidebarProps = {
  value: ExploreFilters;
  onChange: (next: ExploreFilters) => void;
  className?: string;
};

function GenreCheckbox({
  checked,
  label,
  onToggle,
  indeterminate,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
  indeterminate?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
        checked || indeterminate
          ? "bg-primary/8 text-primary"
          : "text-slate-700 hover:bg-slate-50",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = Boolean(indeterminate) && !checked;
        }}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="size-3.5 rounded border-slate-300 text-primary accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

function setGroupGenres(
  filters: ExploreFilters,
  groupValues: readonly string[],
  selectAll: boolean,
): ExploreFilters {
  const groupSet = new Set(groupValues);
  const withoutGroup = filters.genres.filter((g) => !groupSet.has(g));
  return {
    ...filters,
    genres: selectAll
      ? [...withoutGroup, ...groupValues]
      : withoutGroup,
  };
}

export function ExploreSidebar({
  value,
  onChange,
  className,
}: ExploreSidebarProps) {
  const activeCount = countActiveFilters(value);
  // 起始全部收起；仅用户点击才展开
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const selectedCountByGroup = useMemo(() => {
    const map: Record<string, number> = {};
    for (const group of GENRE_FILTER_GROUPS) {
      map[group.title] = group.options.filter((o) =>
        value.genres.includes(o.value),
      ).length;
    }
    return map;
  }, [value.genres]);

  const toggleGroupOpen = (title: string) => {
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white",
        className,
      )}
    >
      <div className="shrink-0 space-y-3 border-b border-slate-100 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">探索筛选</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            按创作方向组合筛选
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-800">筛选</p>
          <button
            type="button"
            disabled={activeCount === 0}
            onClick={() => onChange(emptyExploreFilters())}
            className="text-xs text-primary disabled:text-slate-300"
          >
            清空
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            题材
          </p>
          {GENRE_FILTER_GROUPS.map((group) => {
            const open = openGroups[group.title] ?? false;
            const selected = selectedCountByGroup[group.title] ?? 0;
            const total = group.options.length;
            const allSelected = selected === total && total > 0;
            const someSelected = selected > 0 && !allSelected;
            const groupValues = group.options.map((o) => o.value);

            return (
              <div
                key={group.title}
                className="overflow-hidden rounded-xl border border-slate-100"
              >
                <div className="flex items-center gap-1 bg-slate-50/80 px-1.5 py-1.5 hover:bg-slate-50">
                  <label
                    className="flex shrink-0 cursor-pointer items-center px-1"
                    title={allSelected ? "取消全选本组" : "全选本组"}
                  >
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={() =>
                        onChange(
                          setGroupGenres(value, groupValues, !allSelected),
                        )
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="size-3.5 rounded border-slate-300 text-primary accent-primary"
                      aria-label={`${group.title}全选`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleGroupOpen(group.title)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 px-1 py-0.5 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="text-[13px] font-medium text-slate-700">
                        {group.title}
                      </span>
                      {selected > 0 ? (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {selected}/{total}
                        </span>
                      ) : null}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 text-slate-400 transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>
                </div>
                {open ? (
                  <ul className="max-h-44 space-y-0.5 overflow-y-auto overscroll-contain p-1.5">
                    {group.options.map((opt) => {
                      const checked = value.genres.includes(opt.value);
                      return (
                        <li key={opt.value}>
                          <GenreCheckbox
                            checked={checked}
                            label={opt.label}
                            onToggle={() =>
                              onChange(
                                toggleFilterValue(value, "genres", opt.value),
                              )
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>

        {sections.map((section) => (
          <div key={section.key} className="space-y-2.5">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {section.title}
            </p>
            <ul className="space-y-1.5">
              {EXPLORE_FILTER_OPTIONS[section.key].map((opt) => {
                const checked = value[section.key].includes(opt.value);
                return (
                  <li key={opt.value}>
                    <GenreCheckbox
                      checked={checked}
                      label={opt.label}
                      onToggle={() =>
                        onChange(
                          toggleFilterValue(value, section.key, opt.value),
                        )
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="rounded-xl border border-sky-100 bg-sky-50/80 p-3">
          <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-sky-800">
            <Sparkles className="size-3.5" />
            小贴士
          </p>
          <p className="text-xs leading-relaxed text-sky-900/80">
            分组左侧可全选；点标题展开或收起。侧栏过长可上下滑动。
          </p>
        </div>
      </div>
    </aside>
  );
}
