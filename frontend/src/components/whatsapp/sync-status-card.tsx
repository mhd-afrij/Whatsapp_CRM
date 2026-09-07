"use client";

import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Download,
} from "lucide-react";
import type { WhatsappSyncStatus } from "@/lib/whatsapp-api";
import { cn } from "@/lib/utils";

const STATE_LABELS: Record<WhatsappSyncStatus["state"], string> = {
  pending: "Waiting to start",
  syncing: "Importing chat history",
  completed: "History import complete",
  failed: "History import failed",
};

const STATE_STYLES: Record<WhatsappSyncStatus["state"], string> = {
  pending: "text-muted",
  syncing: "text-warning",
  completed: "text-success",
  failed: "text-danger",
};

const STATE_ICONS: Record<WhatsappSyncStatus["state"], typeof Clock> = {
  pending: Clock,
  syncing: Loader2,
  completed: CheckCircle2,
  failed: AlertCircle,
};

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Live historical-sync indicator (spec §9). Pure presentational: the parent
 * feeds it the gateway's sync snapshot (from GET /whatsapp/status and the
 * sync.started/progress/completed/failed socket events handled in
 * use-whatsapp-connection.ts). Renders nothing when no run has ever happened.
 */
export function SyncStatusCard({
  sync,
}: {
  sync?: WhatsappSyncStatus | null;
}) {
  if (!sync) return null;

  const { state } = sync;
  const StateIcon = STATE_ICONS[state];
  const handled =
    sync.processedMessages +
    sync.duplicateMessages +
    sync.failedMessages +
    sync.skippedMessages;
  const percent =
    sync.totalMessages > 0
      ? Math.min(100, Math.round((handled / sync.totalMessages) * 100))
      : state === "completed"
        ? 100
        : 0;
  const inProgress = state === "pending" || state === "syncing";

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <StateIcon
            className={cn(
              "mt-0.5 h-5 w-5",
              STATE_STYLES[state],
              state === "syncing" && "animate-spin"
            )}
            aria-hidden="true"
          />
          <div>
            <p
              className={cn(
                "text-xs font-semibold uppercase tracking-wide",
                STATE_STYLES[state]
              )}
            >
              {STATE_LABELS[state]}
            </p>
            <h3 className="mt-0.5 text-lg font-semibold text-text">
              {inProgress
                ? "Syncing past WhatsApp conversations"
                : "Historical conversations & messages"}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {inProgress
                ? `${formatCount(handled)} of ${formatCount(sync.totalMessages)} messages imported${
                    sync.totalConversations > 0
                      ? ` across ${formatCount(sync.totalConversations)} chats`
                      : ""
                  }`
                : state === "completed"
                  ? `${formatCount(sync.totalConversations)} chats and ${formatCount(
                      sync.totalMessages
                    )} messages are available in the inbox.`
                  : sync.error ?? "The import did not complete. Reconnecting will retry safely."}
            </p>
          </div>
        </div>

        {sync.updatedAt && (
          <span className="text-xs text-muted">
            Updated {formatTime(sync.updatedAt)}
          </span>
        )}
      </div>

      {inProgress && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-muted/20">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="History import progress"
            />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {percent}% — imported from WhatsApp in the background. The inbox
            updates automatically as messages arrive.
          </p>
        </div>
      )}

      {(sync.duplicateMessages > 0 ||
        sync.failedMessages > 0 ||
        sync.skippedMessages > 0 ||
        state === "completed") && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-bg/60 px-3 py-1 font-medium text-text">
            {formatCount(sync.processedMessages)} imported
          </span>
          {sync.duplicateMessages > 0 && (
            <span className="rounded-full bg-bg/60 px-3 py-1 text-muted">
              {formatCount(sync.duplicateMessages)} duplicates skipped
            </span>
          )}
          {sync.skippedMessages > 0 && (
            <span className="rounded-full bg-bg/60 px-3 py-1 text-muted">
              {formatCount(sync.skippedMessages)} protocol/system
            </span>
          )}
          {sync.failedMessages > 0 && (
            <span className="rounded-full bg-danger/10 px-3 py-1 text-danger">
              {formatCount(sync.failedMessages)} failed
            </span>
          )}
        </div>
      )}
    </div>
  );
}
