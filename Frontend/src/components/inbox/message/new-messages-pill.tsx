"use client";

import { ChevronDown } from "lucide-react";

interface NewMessagesPillProps {
  count: number;
  onClick: () => void;
}

export function NewMessagesPill({ count, onClick }: NewMessagesPillProps) {
  if (count === 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="sticky bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-primary/90 transition-colors"
      aria-label={`Scroll to latest message (${count} new)`}
    >
      <span>↓ {count} new message{count !== 1 ? "s" : ""}</span>
      <ChevronDown className="h-4 w-4" />
    </button>
  );
}
