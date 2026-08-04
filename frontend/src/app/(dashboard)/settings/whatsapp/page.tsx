"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { RequirePermission } from "@/components/auth/require-permission";
import {
  useWhatsappActions,
  useWhatsappConnectionHistory,
  useWhatsappStatus,
} from "@/hooks/use-whatsapp-connection";
import type { WhatsappConnectionStatus } from "@/lib/whatsapp-api";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/ui/error-state";

const DISCONNECT_REASON_LABELS: Record<string, string> = {
  logged_out: "You were logged out from WhatsApp on your phone.",
  bad_session: "The saved session became corrupted and had to be reset.",
  restart_required: "WhatsApp requested a routine restart.",
  transient_network_error: "A network hiccup interrupted the connection.",
  manual_disconnect: "Disconnected manually from this page.",
};

function formatDisconnectReason(reason: unknown): string | null {
  if (typeof reason !== "string" || !reason) return null;
  return DISCONNECT_REASON_LABELS[reason] ?? reason.replaceAll("_", " ");
}

const STATUS_LABELS: Record<WhatsappConnectionStatus, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  qr_pending: "Scan the QR code",
  connected: "Connected",
  disconnected: "Disconnected",
  reconnecting: "Reconnecting…",
  auth_required: "Re-authentication required",
  error: "Connection error",
};

const STATUS_STYLES: Record<WhatsappConnectionStatus, string> = {
  idle: "bg-muted/10 text-muted",
  connecting: "bg-warning/10 text-warning",
  qr_pending: "bg-warning/10 text-warning",
  connected: "bg-success/10 text-success",
  disconnected: "bg-danger/10 text-danger",
  reconnecting: "bg-warning/10 text-warning",
  auth_required: "bg-danger/10 text-danger",
  error: "bg-danger/10 text-danger",
};

function StatusBadge({ status }: { status: WhatsappConnectionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
        STATUS_STYLES[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function DisconnectDialog({
  open,
  onCancel,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-text">Disconnect WhatsApp?</h2>
        <p className="mt-2 text-sm text-muted">
          This will end the active WhatsApp session. You will need to scan a new QR code to
          reconnect.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted hover:bg-primary-soft/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50"
          >
            {isPending ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ticks every second so QR-expiry checks stay pure at render time. */
function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

function ConnectionTimeline() {
  const { data: events, isLoading } = useWhatsappConnectionHistory();

  if (isLoading) {
    return <p className="text-sm text-muted">Loading history…</p>;
  }

  if (!events || events.length === 0) {
    return <p className="text-sm text-muted">No connection events yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {events.map((event) => {
        const reason = formatDisconnectReason(event.metadata?.disconnectReason ?? event.metadata?.reason);
        return (
          <li key={event.id} className="flex items-start gap-3 border-b border-border pb-3 last:border-0">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
            <div>
              <p className="text-sm font-medium text-text">{formatConnectionEvent(event.event_type)}</p>
              <p className="text-xs text-muted">{new Date(event.occurred_at).toLocaleString()}</p>
              {reason && <p className="mt-0.5 text-xs text-muted">{reason}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function formatConnectionEvent(eventType: string): string {
  switch (eventType) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "qr_generated":
      return "QR code generated";
    case "disconnected":
      return "Disconnected";
    case "reconnect_attempt":
      return "Reconnect attempt";
    case "logged_out":
      return "Logged out";
    case "bad_session":
      return "Session reset (corrupted)";
    case "error":
      return "Connection error";
    default:
      return eventType.replaceAll("_", " ");
  }
}

function LiveStatusPanel() {
  const { data: status } = useWhatsappStatus();
  const { data: events } = useWhatsappConnectionHistory();

  const latestEvent = events?.[0] ?? null;
  const connectedNumber = status?.phoneNumber ?? null;

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Live session</p>
          <h2 className="mt-1 text-lg font-semibold text-text">
            {status?.status === "connected" ? "WhatsApp is live" : "WhatsApp session"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            This summary updates from the gateway in real time after connect, reconnect, or QR scan events.
          </p>
        </div>
        <StatusBadge status={status?.status ?? "idle"} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-bg/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Connected number</p>
          <p className="mt-2 text-lg font-semibold text-text">
            {connectedNumber ?? "Not available yet"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {status?.status === "connected"
              ? "The gateway has confirmed the active WhatsApp session."
              : "Connect WhatsApp to load the active session details here."}
          </p>
        </div>

        <div className="rounded-md border border-border bg-bg/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Most recent activity</p>
          <p className="mt-2 text-lg font-semibold text-text">
            {latestEvent ? formatConnectionEvent(latestEvent.event_type) : "No recent activity"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {latestEvent ? new Date(latestEvent.occurred_at).toLocaleString() : "Waiting for the next connection event."}
          </p>
        </div>
      </div>
    </div>
  );
}

function WhatsappSettingsContent() {
  const { data: status, isLoading, isError, refetch } = useWhatsappStatus();
  const { data: events } = useWhatsappConnectionHistory();
  const { connect, disconnect, reconnect } = useWhatsappActions();
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  const now = useNow();
  const currentStatus: WhatsappConnectionStatus = status?.status ?? "idle";
  const qrExpiresAtMs = status?.qrExpiresAt ? new Date(status.qrExpiresAt).getTime() : null;
  const qrExpired = !!qrExpiresAtMs && qrExpiresAtMs < now;
  const qrSecondsRemaining = qrExpiresAtMs ? Math.max(0, Math.ceil((qrExpiresAtMs - now) / 1000)) : null;

  const latestEvent = events?.[0] ?? null;
  const latestReason = latestEvent
    ? formatDisconnectReason(latestEvent.metadata?.disconnectReason ?? latestEvent.metadata?.reason)
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">WhatsApp Connection</h1>
        <p className="mt-1 text-sm text-muted">
          Manage the workspace&apos;s single WhatsApp session used to send and receive messages.
        </p>
      </div>

      <LiveStatusPanel />

      <div className="rounded-lg border border-border bg-surface p-6">
        {isLoading && <p className="mt-4 text-sm text-muted">Loading connection status…</p>}
        {isError && (
          <ErrorState
            className="mt-4"
            message="Unable to reach the WhatsApp gateway. Try again shortly."
            onRetry={() => refetch()}
          />
        )}

        {currentStatus === "qr_pending" && status?.qrCode && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <p className="max-w-xs text-center text-sm text-muted">
              Open WhatsApp on your phone → <span className="font-medium text-text">Linked Devices</span> →{" "}
              <span className="font-medium text-text">Link a device</span>, then scan this code.
            </p>
            {qrExpired ? (
              <p className="text-sm text-danger">This QR code has expired.</p>
            ) : (
              <>
                <div className="rounded-lg border border-border p-4">
                  <Image
                    src={status.qrCode}
                    alt="WhatsApp QR code"
                    width={220}
                    height={220}
                    unoptimized
                  />
                </div>
                {qrSecondsRemaining !== null && (
                  <p className="text-xs text-muted">Expires in {qrSecondsRemaining}s</p>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {connect.isPending ? "Refreshing…" : "Refresh QR code"}
            </button>
          </div>
        )}

        {(currentStatus === "idle" || currentStatus === "disconnected") && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {connect.isPending ? "Connecting…" : "Connect WhatsApp"}
            </button>
          </div>
        )}

        {currentStatus === "auth_required" && (
          <div className="mt-6 space-y-2">
            <p className="text-sm text-danger">
              WhatsApp logged this session out. Re-authentication is required — connect again to
              generate a new QR code.
            </p>
            {latestReason && <p className="text-xs text-muted">Reason: {latestReason}</p>}
            <button
              type="button"
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {connect.isPending ? "Connecting…" : "Reconnect and scan new QR"}
            </button>
          </div>
        )}

        {currentStatus === "error" && (
          <div className="mt-6 space-y-2">
            <p className="text-sm text-danger">
              Automatic reconnection attempts were exhausted. Try reconnecting manually.
            </p>
            {latestReason && <p className="text-xs text-muted">Last known reason: {latestReason}</p>}
            <button
              type="button"
              onClick={() => reconnect.mutate()}
              disabled={reconnect.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {reconnect.isPending ? "Reconnecting…" : "Retry connection"}
            </button>
          </div>
        )}

        {(currentStatus === "connecting" || currentStatus === "reconnecting") && (
          <p className="mt-6 text-sm text-muted">
            {currentStatus === "connecting"
              ? "Establishing connection…"
              : "Connection dropped; retrying automatically with backoff…"}
          </p>
        )}

        {currentStatus === "connected" && (
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => reconnect.mutate()}
              disabled={reconnect.isPending}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text hover:bg-primary-soft/50 disabled:opacity-50"
            >
              {reconnect.isPending ? "Reconnecting…" : "Reconnect"}
            </button>
            <button
              type="button"
              onClick={() => setShowDisconnectDialog(true)}
              className="rounded-md border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-4 text-lg font-semibold text-text">Connection history</h2>
        <ConnectionTimeline />
      </div>

      <DisconnectDialog
        open={showDisconnectDialog}
        onCancel={() => setShowDisconnectDialog(false)}
        isPending={disconnect.isPending}
        onConfirm={() => {
          disconnect.mutate(undefined, {
            onSuccess: () => setShowDisconnectDialog(false),
          });
        }}
      />
    </div>
  );
}

export default function WhatsappSettingsPage() {
  return (
    <RequirePermission permission="whatsapp.connection.manage">
      <WhatsappSettingsContent />
    </RequirePermission>
  );
}
