"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";

export interface SearchableOption {
  /** Serialized value stored in settings (number ids arrive as strings). */
  value: string;
  label: string;
  /** Optional secondary line rendered under the label. */
  hint?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  className,
  emptyText = "No results found.",
}: {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((opt) => opt.value === value) ?? null;

  const normalized = query.trim().toLowerCase();
  const filtered =
    normalized === ""
      ? options
      : options.filter(
          (opt) =>
            opt.label.toLowerCase().includes(normalized) ||
            (opt.hint?.toLowerCase().includes(normalized) ?? false)
        );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setQuery("")}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-2.5 text-sm text-text outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <span className={cn("min-w-0 truncate", !selected && "text-muted")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" side="bottom">
        <Command shouldFilter={false}>
          <div className="relative border-b border-border">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <CommandInput
              placeholder="Search…"
              value={query}
              onValueChange={setQuery}
              className="h-8 border-0 pl-8 focus:ring-0"
            />
          </div>
          <CommandEmpty>{emptyText}</CommandEmpty>
          <CommandGroup>
            {filtered.map((opt) => (
              <CommandItem
                key={opt.value}
                value={opt.value}
                onSelect={(currentValue) => {
                  onChange(currentValue === value ? value : currentValue);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === opt.value ? "opacity-100" : "opacity-0"
                  )}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{opt.label}</span>
                  {opt.hint && <span className="truncate text-xs text-muted">{opt.hint}</span>}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}