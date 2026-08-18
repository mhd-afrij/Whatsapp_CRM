"use client";

import { useConversationSlaStatus } from "@/hooks/use-sla";
import { cn } from "@/lib/utils";

interface SlaIndicatorProps {
  conversationId: number;
  className?: string;
}

function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return "Breached";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function SlaIndicator({ conversationId, className }: SlaIndicatorProps) {
  const { data: slaStatus } = useConversationSlaStatus(conversationId);

  if (!slaStatus?.has_active_sla) {
    return null;
  }

  const { type, status, remaining_seconds } = slaStatus;

  const statusConfig = {
    pending: { color: "text-success", bg: "bg-success/10", label: "SLA" },
    at_risk: { color: "text-warning", bg: "bg-warning/10", label: "SLA at risk" },
    breached: { color: "text-danger", bg: "bg-danger/10", label: "SLA breached" },
    within_sla: { color: "text-success", bg: "bg-success/10", label: "SLA" },
    resolved: { color: "text-muted", bg: "bg-bg", label: "SLA" },
  };

  const config = statusConfig[status ?? "pending"];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        config.bg,
        config.color,
        className
      )}
      role="status"
      aria-label={`${config.label}: ${status === "breached" ? "Breached" : formatRemainingTime(remaining_seconds ?? 0)} remaining`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {status === "breached" ? (
        <span>SLA breached</span>
      ) : (
        <span>
          {type === "first_response" ? "First response" : "Follow-up"}{" "}
          {formatRemainingTime(remaining_seconds ?? 0)}
        </span>
      )}
    </span>
  );
}
