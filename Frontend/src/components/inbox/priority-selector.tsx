"use client";

import { AlertTriangle, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversationPriority } from "@/lib/conversations-api";

export const PRIORITY_OPTIONS: ConversationPriority[] = ["low", "normal", "high", "urgent"];

const PRIORITY_META: Record<
  ConversationPriority,
  { label: string; icon: typeof AlertTriangle | null; className: string }
> = {
  low: { label: "Low priority", icon: Minus, className: "text-muted" },
  normal: { label: "Normal priority", icon: null, className: "text-muted" },
  high: { label: "High priority", icon: ArrowUp, className: "text-warning" },
  urgent: { label: "Urgent", icon: AlertTriangle, className: "text-danger" },
};

/**
 * Icon-only indicator for list rows. Renders nothing for "normal" (the common
 * case) so the list stays uncluttered - both an icon AND the label/title are
 * always paired, never color alone, per the "don't communicate status only
 * through color" design rule.
 */
export function PriorityIndicator({ priority }: { priority: ConversationPriority }) {
  const meta = PRIORITY_META[priority];
  if (!meta.icon) return null;
  const Icon = meta.icon;
  return (
    <span title={meta.label} className={cn("inline-flex shrink-0 items-center", meta.className)}>
      <Icon className="h-3.5 w-3.5" />
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

/** Dropdown used in the chat header / contact panel to change a conversation's priority. */
export function PrioritySelector({
  value,
  onChange,
  disabled,
}: {
  value: ConversationPriority;
  onChange: (priority: ConversationPriority) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ConversationPriority)}
      disabled={disabled}
      aria-label="Conversation priority"
      className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
    >
      {PRIORITY_OPTIONS.map((p) => (
        <option key={p} value={p}>
          {PRIORITY_META[p].label}
        </option>
      ))}
    </select>
  );
}
