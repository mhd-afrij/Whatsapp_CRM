"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Zap, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMessageTemplates } from "@/hooks/use-message-templates";
import type { MessageTemplate } from "@/lib/message-templates-api";

interface TemplatePickerProps {
  onSelect: (content: string) => void;
  onClose: () => void;
}

export function TemplatePicker({ onSelect, onClose }: TemplatePickerProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: templates } = useMessageTemplates({ is_active: true });

  const filtered = useMemo(() => {
    if (!templates) return [];
    const q = search.toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.shortcut?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q)
    );
  }, [templates, search]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelect(filtered[selectedIndex].content);
      }
    }
  };

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-border bg-surface shadow-lg z-30">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Zap className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-text">Saved Replies</span>
        <div className="ml-auto flex-1 max-w-xs">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search replies..."
              className="w-full rounded-md border border-border bg-bg py-1 pl-7 pr-2 text-xs text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted hover:text-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div ref={listRef} className="max-h-60 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-muted">
            {templates?.length === 0 ? "No saved replies yet." : "No matches found."}
          </p>
        )}
        {filtered.map((template, index) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelect(template.content)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={cn(
              "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
              index === selectedIndex ? "bg-primary/5" : "hover:bg-bg"
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-text">{template.name}</span>
              {template.shortcut && (
                <span className="text-[10px] text-primary">/{template.shortcut}</span>
              )}
              {template.category && (
                <span className="text-[10px] text-muted">{template.category}</span>
              )}
            </div>
            <p className="line-clamp-1 text-[11px] text-muted">{template.content}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Parses slash command from composer input.
 * Returns the shortcut if the user types "/shortcut" at the start.
 */
export function parseSlashCommand(input: string): string | null {
  const match = input.match(/^\/([a-zA-Z0-9]+)$/);
  return match ? match[1] : null;
}
