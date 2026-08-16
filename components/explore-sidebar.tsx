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

const GENRE_PREVIEW_COUNT = 3;

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
  compact,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
  indeterminate?: boolean;
  /** 最内层题材选项：字更小，和组名拉开对比 */
  compact?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center rounded-lg px-2 transition-colors",
        compact
          ? "gap-2 py-1 text-[12px] leading-snug"
          : "gap-2.5 py-1.5 text-sm",
        checked || indeterminate
          ? "bg-primary/8 text-primary"
          : compact
            ? "text-slate-600 hover:bg-slate-50"
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
        className={cn(
          "rounded border-slate-300 text-primary accent-primary",
          compact ? "size-3" : "size-3.5",
        )}
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
    genres: selectAll ? [...withoutGroup, ...groupValues] : withoutGroup,
  };
}

/** 已选项落在预览区外时，默认展开该组选项 */
function initialExpandedGroups(genres: string[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const group of GENRE_FILTER_GROUPS) {
    map[group.title] = group.options
      .slice(GENRE_PREVIEW_COUNT)
      .some((o) => genres.includes(o.value));
  }
  return map;
}

export function ExploreSidebar({
  value,
  onChange,
  className,
}: ExploreSidebarProps) {
  const activeCount = countActiveFilters(value);
  /** 整组折叠：默认全部展开，点标题可收起 */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const group of GENRE_FILTER_GROUPS) {
      map[group.title] = true;
    }
    return map;
  });
  /** 组内是否展开超过 3 项 */
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    () => initialExpandedGroups(value.genres),
  );

  const selectedCountByGroup = useMemo(() => {
    const map: Record<string, number> = {};
    for (const group of GENRE_FILTER_GROUPS) {
      map[group.title] = group.options.filter((o) =>
        value.genres.includes(o.value),
      ).length;
    }
    return map;
  }, [value.genres]);

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
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            题材
          </p>
          {GENRE_FILTER_GROUPS.map((group, index) => {
            const open = openGroups[group.title] ?? true;
            const expanded = expandedGroups[group.title] ?? false;
            const selected = selectedCountByGroup[group.title] ?? 0;
            const total = group.options.length;
            const allSelected = selected === total && total > 0;
            const someSelected = selected > 0 && !allSelected;
            const groupValues = group.options.map((o) => o.value);
            const canExpand = total > GENRE_PREVIEW_COUNT;
            const visibleOptions =
              expanded || !canExpand
                ? group.options
                : group.options.slice(0, GENRE_PREVIEW_COUNT);
            const hiddenCount = total - GENRE_PREVIEW_COUNT;
            const isLast = index === GENRE_FILTER_GROUPS.length - 1;

            return (
              <div
                key={group.title}
                className={cn(
                  "space-y-0.5",
                  !isLast && "border-b border-slate-100 pb-3",
                )}
              >
                <div className="flex items-center gap-1">
                  <label
                    className="flex shrink-0 cursor-pointer items-center px-1 py-1.5"
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
                    onClick={() =>
                      setOpenGroups((prev) => ({
                        ...prev,
                        [group.title]: !open,
                      }))
                    }
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-slate-50"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="text-[13px] font-medium text-slate-500">
                        {group.title}
                      </span>
                      {selected > 0 ? (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
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
                  <>
                    <ul className="space-y-0.5 pl-0.5">
                      {visibleOptions.map((opt) => {
                        const checked = value.genres.includes(opt.value);
                        return (
                          <li key={opt.value}>
                            <GenreCheckbox
                              compact
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
                    {canExpand ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroups((prev) => ({
                            ...prev,
                            [group.title]: !expanded,
                          }))
                        }
                        aria-expanded={expanded}
                        className="flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      >
                        {expanded ? "收起" : `展开另外 ${hiddenCount} 项`}
                        <ChevronDown
                          className={cn(
                            "size-3.5 transition-transform",
                            expanded && "rotate-180",
                          )}
                        />
                      </button>
                    ) : null}
                  </>
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
            左侧可全选；点组名折叠；选项过多时点「展开另外」。
          </p>
        </div>
      </div>
    </aside>
  );
}
