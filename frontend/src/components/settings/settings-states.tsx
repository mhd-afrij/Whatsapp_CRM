"use client";

import { AlertTriangle } from "lucide-react";

export function SettingsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-label="Loading settings" role="status">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-border/60" />
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="h-5 w-40 animate-pulse rounded bg-border/60" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="h-4 w-1/3 animate-pulse rounded bg-border/50" />
              <div className="h-6 w-12 animate-pulse rounded-full bg-border/50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="max-w-md text-sm text-muted">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function SettingsErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 px-6 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-danger" />
      <p className="max-w-md text-sm text-text">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-primary"
      >
        Retry
      </button>
    </div>
  );
}
