"use client";

import { cn } from "@/lib/utils";
import type { WhatsappConnectionStatus } from "@/lib/whatsapp-api";

/**
 * Presentational metadata for every raw gateway status, reduced to the four
 * visual states required by the design spec (connected / connecting /
 * disconnected / error). The gateway's richer raw states (qr_pending,
 * auth_required, ...) keep their own wording but map onto the same four
 * colors so the whole UI communicates status the same way.
 */
const STATUS_META: Record<WhatsappConnectionStatus, { label: string; dot: string; text: string; bg: string; pulse: boolean }> = {
  connected: { label: "Connected", dot: "bg-success", text: "text-success", bg: "bg-success/10", pulse: false },
  connecting: { label: "Connecting", dot: "bg-warning", text: "text-warning", bg: "bg-warning/10", pulse: true },
  qr_pending: { label: "Awaiting QR scan", dot: "bg-warning", text: "text-warning", bg: "bg-warning/10", pulse: true },
  reconnecting: { label: "Reconnecting", dot: "bg-warning", text: "text-warning", bg: "bg-warning/10", pulse: true },
  idle: { label: "Not connected", dot: "bg-muted", text: "text-muted", bg: "bg-muted", pulse: false },
  disconnected: { label: "Disconnected", dot: "bg-muted", text: "text-muted", bg: "bg-muted", pulse: false },
  auth_required: { label: "Re-auth required", dot: "bg-danger", text: "text-danger", bg: "bg-danger/10", pulse: false },
  error: { label: "Connection error", dot: "bg-danger", text: "text-danger", bg: "bg-danger/10", pulse: false },
};

export function AccountStatusBadge({
  status,
  className,
}: {
  status: WhatsappConnectionStatus | string | null | undefined;
  className?: string;
}) {
  const meta = (status && STATUS_META[status as WhatsappConnectionStatus]) || STATUS_META.idle;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        meta.bg,
        meta.text,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot, meta.pulse && "animate-pulse")} />
      {meta.label}
    </span>
  );
}

/** Skeleton block used while workspace settings / accounts load. */
export function AccountCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4" aria-hidden="true">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-bg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/3 animate-pulse rounded bg-bg" />
          <div className="h-3 w-1/4 animate-pulse rounded bg-bg" />
        </div>
        <div className="h-5 w-20 animate-pulse rounded-full bg-bg" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="h-8 animate-pulse rounded bg-bg" />
        <div className="h-8 animate-pulse rounded bg-bg" />
        <div className="h-8 animate-pulse rounded bg-bg" />
      </div>
    </div>
  );
}

/** Skeleton for the connection-health metrics grid. */
export function ConnectionMetricsSkeleton() {
  return (
    <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-3 w-16 animate-pulse rounded bg-bg" />
          <div className="h-4 w-24 animate-pulse rounded bg-bg" />
        </div>
      ))}
    </div>
  );
}
