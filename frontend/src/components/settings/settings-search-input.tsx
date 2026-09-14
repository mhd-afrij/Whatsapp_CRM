"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsSearchInput({
  value = "",
  onChange,
  placeholder = "Search…",
  className,
  autoFocus = false,
}: {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="h-8 w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-3 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        aria-label={placeholder}
      />
    </div>
  );
}

export function useFilteredItems(
  items: Array<{ name: string; description: string }>,
  query: string
) {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [items, query]);
}
