"use client";

import { cn } from "@/lib/utils";
import type { PresenceStatus } from "@/lib/presence-api";

interface PresenceIndicatorProps {
  status: PresenceStatus;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<PresenceStatus, { color: string; label: string }> = {
  online: { color: "bg-success", label: "Online" },
  away: { color: "bg-warning", label: "Away" },
  busy: { color: "bg-danger", label: "Busy" },
  offline: { color: "bg-muted/40", label: "Offline" },
};

const SIZE_CONFIG: Record<"sm" | "md" | "lg", string> = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

export function PresenceIndicator({
  status,
  size = "md",
  showLabel = false,
  className,
}: PresenceIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const sizeClass = SIZE_CONFIG[size];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      role="status"
      aria-label={config.label}
    >
      <span
        className={cn("shrink-0 rounded-full", sizeClass, config.color)}
        aria-hidden="true"
      />
      {showLabel && (
        <span className="text-xs text-muted">{config.label}</span>
      )}
    </span>
  );
}
