"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const EMOJIS = [
  "😀", "😁", "😂", "😃", "😄", "😅", "😆", "😉", "😊", "😋",
  "😎", "😍", "😘", "😜", "😝", "😞", "😟", "😠", "😡", "😢",
  "😣", "😤", "😥", "😦", "😧", "😨", "😩", "😪", "😫", "😬",
  "😱", "😲", "😳", "😴", "😵", "😶", "😷", "😸", "😹", "😺",
  "😻", "😼", "😽", "😾", "😿", "🙀", "🙁", "🙂", "🙃",
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function EmojiPicker({ onSelect, onClose, isOpen }: EmojiPickerProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return EMOJIS.filter((emoji) => emoji.toLowerCase().includes(q) || q.length === 0);
  }, [search]);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
  }, [isOpen]);

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
    if (!isOpen) return;
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
      const emoji = filtered[selectedIndex];
      if (emoji) {
        onSelect(emoji);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="absolute bottom-full left-1/2 -translate-x-1/2 rounded-xl border border-border bg-surface shadow-lg z-30 min-w-64"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center gap-2 border-b border-border px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <svg
          className="h-4 w-4 text-primary"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        <span className="text-xs font-medium text-text">Emojis</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted hover:text-text"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div
        ref={listRef}
        className="max-h-80 overflow-y-auto rounded-b-xl bg-surface px-3 py-1"
        onClick={(e) => e.stopPropagation()}
      >
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-center text-xs text-muted">
            Type to search emojis...
          </p>
        )}
        {filtered.map((emoji, index) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={cn(
              "flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-text hover:bg-bg transition-colors",
              index === selectedIndex ? "border-b border-primary" : ""
            )}
          >
            <span className="text-2xl">{emoji}</span>
            <span className="text-[10px]">{emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}