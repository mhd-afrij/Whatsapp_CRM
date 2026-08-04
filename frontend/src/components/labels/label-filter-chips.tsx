"use client";

import { useLabelList } from "@/hooks/use-labels";
import { cn } from "@/lib/utils";

/** Multi-select label filter chips (OR/any-match semantics - matches the backend's `labels[]` filter). */
export function LabelFilterChips({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const { data: labels } = useLabelList();

  if (!labels || labels.length === 0) {
    return null;
  }

  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {labels.map((label) => {
        const active = selected.includes(label.id);
        const color = label.color_hex || "#6366F1";
        return (
          <button
            key={label.id}
            type="button"
            onClick={() => toggle(label.id)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              active ? "border-transparent text-white" : "border-border text-muted hover:text-text"
            )}
            style={active ? { backgroundColor: color } : undefined}
          >
            {label.name}
          </button>
        );
      })}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-muted underline hover:text-text"
        >
          Clear
        </button>
      )}
    </div>
  );
}
