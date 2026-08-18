"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, QrCode, RefreshCcw } from "lucide-react";
import { AlertCircle, Clock3, QrCode, RefreshCcw, Wifi, WifiOff } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { WhatsappIntegrationCard } from "@/components/whatsapp/whatsapp-integration-card";
import {
  useWhatsappActions,
  useWhatsappConnectionHistory,
  useWhatsappStatus,
} from "@/hooks/use-whatsapp-connection";
import { useToast } from "@/providers/toast-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WhatsappConnectionStatus } from "@/lib/whatsapp-api";
import { ErrorState } from "@/components/ui/error-state";

/** Matches the gateway's QR_TTL_MS; used only to render the expiry progress bar. */
const QR_TTL_SECONDS = 60;

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

function ConfirmDialog({
const STATUS_LABELS: Record<WhatsappConnectionStatus, string> = {
  idle: "Not connected",
  connecting: "Connecting",
  qr_pending: "Scan the QR code",
  connected: "Connected",
  disconnected: "Disconnected",
  reconnecting: "Reconnecting",
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

const STATUS_COPY: Record<
  WhatsappConnectionStatus,
  { title: string; body: string }
> = {
  idle: {
    title: "Not connected",
    body: "Start a new WhatsApp session to generate a pairing QR code.",
  },
  connecting: {
    title: "Connecting",
    body: "The gateway is opening a fresh session and preparing pairing.",
  },
  qr_pending: {
    title: "Waiting for QR scan",
    body: "Scan the QR code from WhatsApp Linked Devices to finish pairing.",
  },
  connected: {
    title: "Connected",
    body: "The gateway is live and ready to receive and send messages.",
  },
  disconnected: {
    title: "Disconnected",
    body: "The session was ended or dropped. Reconnect to continue.",
  },
  reconnecting: {
    title: "Reconnecting",
    body: "The gateway is retrying automatically with backoff.",
  },
  auth_required: {
    title: "Re-authentication required",
    body: "WhatsApp logged this session out. A new QR scan is required.",
  },
  error: {
    title: "Connection error",
    body: "Automatic reconnect attempts were exhausted. Try again manually.",
  },
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
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  isPending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-text">Disconnect WhatsApp?</h2>
        <p className="mt-2 text-sm text-muted">
          This will end the active WhatsApp session. You will need to scan a new QR code to reconnect.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="text-muted hover:bg-primary-soft/50 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="bg-danger hover:bg-danger/90 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPending ? pendingLabel : confirmLabel}
            {isPending ? "Disconnecting..." : "Disconnect"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function ConnectionTimeline() {
  const { data: events, isLoading } = useWhatsappConnectionHistory();

  if (isLoading) {
    return <p className="text-sm text-muted">Loading history...</p>;
  }

  if (!events || events.length === 0) {
    return <p className="text-sm text-muted">No connection events yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {events.map((event) => {
        const reason = formatDisconnectReason(event.metadata?.disconnectReason ?? event.metadata?.reason);
        return (
          <li key={event.id} className="flex items-start gap-3 rounded-xl border border-border bg-bg/40 p-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0">
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

function LiveStatusPanel() {
  const { data: status } = useWhatsappStatus();
  const { data: events } = useWhatsappConnectionHistory();

  const latestEvent = events?.[0] ?? null;
  const connectedNumber = status?.phoneNumber ?? null;
  const currentStatus = status?.status ?? "idle";
  const copy = STATUS_COPY[currentStatus];

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Live session</p>
          <h2 className="mt-1 text-xl font-semibold text-text">{copy.title}</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">{copy.body}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={currentStatus} />
          {currentStatus === "connected" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
              <Wifi className="h-3.5 w-3.5" />
              Online
            </span>
          ) : currentStatus === "error" || currentStatus === "auth_required" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-3 py-1 text-xs font-medium text-danger">
              <AlertCircle className="h-3.5 w-3.5" />
              Needs action
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
              <Clock3 className="h-3.5 w-3.5" />
              Pending
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-bg/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Connected number</p>
          <p className="mt-2 text-lg font-semibold text-text">{connectedNumber ?? "Not available yet"}</p>
          <p className="mt-1 text-sm text-muted">
            {currentStatus === "connected"
              ? "The gateway has confirmed the active WhatsApp session."
              : "Connect WhatsApp to load the active session details here."}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-bg/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Most recent activity</p>
          <p className="mt-2 text-lg font-semibold text-text">
            {latestEvent ? formatConnectionEvent(latestEvent.event_type) : "No recent activity"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {latestEvent
              ? new Date(latestEvent.occurred_at).toLocaleString()
              : "Waiting for the next connection event."}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-bg/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Current state</p>
          <p className="mt-2 text-lg font-semibold text-text">{STATUS_LABELS[currentStatus]}</p>
          <p className="mt-1 text-sm text-muted">
            {currentStatus === "connected"
              ? "Keep this tab open to monitor disconnects and QR expiry."
              : "Use the actions below to recover or restart the session."}
          </p>
        </div>
      </div>
    </div>
  );
}

function WhatsappSettingsContent() {
  const { data: status, isLoading, isError, refetch } = useWhatsappStatus();
  const { data: events } = useWhatsappConnectionHistory();
  const { connect, disconnect, logout, reconnect } = useWhatsappActions();
  const { toast } = useToast();
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const autoRefreshTriggeredRef = useRef(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const now = useNow();
  const currentStatus: WhatsappConnectionStatus = status?.status ?? "idle";
  const qrExpiresAtMs = status?.qrExpiresAt ? new Date(status.qrExpiresAt).getTime() : null;
  const qrExpired = !!qrExpiresAtMs && qrExpiresAtMs < now;
  const qrSecondsRemaining = qrExpiresAtMs
    ? Math.max(0, Math.ceil((qrExpiresAtMs - now) / 1000))
    : null;
  const qrProgress =
    qrSecondsRemaining !== null ? Math.max(0, Math.min(1, qrSecondsRemaining / QR_TTL_SECONDS)) : 0;

  const latestEvent = events?.[0] ?? null;
  const latestReason = latestEvent
    ? formatDisconnectReason(latestEvent.metadata?.disconnectReason ?? latestEvent.metadata?.reason)
    : null;
  const needsResetBeforeQr =
    currentStatus !== "idle" && currentStatus !== "disconnected";
  const startQrFlowLabel = needsResetBeforeQr ? "Reset session and scan QR" : "Connect WhatsApp";

  const startQrFlow = async () => {
    setActionError(null);
    try {
      if (needsResetBeforeQr) {
        await logout.mutateAsync();
      }
      await connect.mutateAsync();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to start WhatsApp pairing.");
    }
  };

  /** Regenerates the QR safely (reconnect reuses credentials if valid). */
  const refreshQr = async () => {
    setActionError(null);
    try {
      await reconnect.mutateAsync();
      toast("Generating a fresh QR code...", "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh the QR code.";
      setActionError(message);
      toast(message, "error");
    }
  };

  const startQrFlow = async () => {
    setActionError(null);
    try {
      await connect.mutateAsync();
      toast("WhatsApp session starting — scan the QR code to pair.", "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start WhatsApp pairing.";
      setActionError(message);
      toast(message, "error");
    }
  };

  /** Destructive: signs the phone out and clears saved credentials. Chat data is never touched. */
  const confirmResetSession = async () => {
    setActionError(null);
    try {
      await logout.mutateAsync();
      await connect.mutateAsync();
      setShowResetDialog(false);
      toast("Session reset — a new QR code has been generated.", "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reset the WhatsApp session.";
      setActionError(message);
      toast(message, "error");
    }
  };

  const handleDisconnect = () => {
    setActionError(null);
    disconnect.mutate(undefined, {
      onSuccess: () => {
        setShowDisconnectDialog(false);
        toast("WhatsApp disconnected.", "success");
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : "Failed to disconnect WhatsApp.";
        setActionError(message);
        toast(message, "error");
      },
    });
  };

  /** Cancels an in-progress pairing. Non-destructive: no credentials are wiped. */
  const stopPairing = () => {
    setActionError(null);
    disconnect.mutate(undefined, {
      onSuccess: () => toast("Pairing cancelled.", "success"),
      onError: (error) => {
        const message = error instanceof Error ? error.message : "Failed to cancel pairing.";
        setActionError(message);
        toast(message, "error");
      },
    });
  };

  // Auto-refresh an expired QR so pairing doesn't dead-end on a stale code.
  useEffect(() => {
    if (currentStatus === "qr_pending" && qrExpired && status?.qrCode) {
      if (autoRefreshTriggeredRef.current) return;
      autoRefreshTriggeredRef.current = true;
      void reconnect.mutateAsync().catch((error) => {
        const message = error instanceof Error ? error.message : "Failed to refresh the QR code.";
        setActionError(message);
        toast(message, "error");
      });
    } else {
      autoRefreshTriggeredRef.current = false;
    }
  }, [currentStatus, qrExpired, status?.qrCode, reconnect, toast]);

  return (
    <div className="space-y-6">
      <div className="border-border bg-surface rounded-3xl border p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-text text-2xl font-semibold">WhatsApp Connection</h1>
            <p className="text-muted mt-1 text-sm">
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold text-text">WhatsApp Connection</h1>
            <p className="mt-1 text-sm text-muted">
              Manage the workspace&apos;s single WhatsApp session used to send and receive messages.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentStatus === "connected" && (
              <>
                <button
                  type="button"
                  onClick={() => setShowResetDialog(true)}
                  disabled={logout.isPending}
                  className="border-border text-text hover:bg-primary-soft/50 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  <QrCode className="h-4 w-4" />
                  Scan new QR
                </button>
                <button
                  type="button"
                  onClick={() => setShowDisconnectDialog(true)}
                  className="border-danger text-danger hover:bg-danger/10 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
                >
                  Disconnect
                </button>
              </>
            )}
            {currentStatus === "qr_pending" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void refreshQr();
                  }}
                  disabled={reconnect.isPending}
                  className="border-border text-text hover:bg-primary-soft/50 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {reconnect.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  {reconnect.isPending ? "Refreshing..." : "Refresh QR"}
                </button>
                <button
                  type="button"
                  onClick={stopPairing}
                  disabled={disconnect.isPending}
                  className="border-danger text-danger hover:bg-danger/10 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  Stop pairing
                </button>
              </>
            )}
            {currentStatus === "auth_required" && (
              <button
                type="button"
                onClick={() => {
                  void startQrFlow();
                }}
                disabled={connect.isPending}
                className="bg-primary hover:bg-primary-dark inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {connect.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <QrCode className="h-4 w-4" />
                )}
                {connect.isPending ? "Preparing QR..." : "Reconnect and scan QR"}
              </button>
            )}
            {currentStatus === "error" && (
              <button
                type="button"
                onClick={() => {
                  void refreshQr();
                }}
                disabled={reconnect.isPending}
                className="bg-primary hover:bg-primary-dark inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {reconnect.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                {reconnect.isPending ? "Reconnecting..." : "Retry connection"}
              </button>
            )}
            {(currentStatus === "connecting" || currentStatus === "reconnecting") && (
              <button
                type="button"
                disabled
                className="border-border text-muted inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium opacity-60"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                {currentStatus === "connecting" ? "Connecting..." : "Reconnecting..."}
            <button
              type="button"
              onClick={() => reconnect.mutate()}
              disabled={reconnect.isPending}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-text hover:bg-primary-soft/50 disabled:opacity-50"
            >
              <RefreshCcw className="h-4 w-4" />
              {reconnect.isPending ? "Reconnecting..." : "Reconnect"}
            </button>
            <button
              type="button"
              onClick={() => {
                void startQrFlow();
              }}
              disabled={connect.isPending || logout.isPending}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              <QrCode className="h-4 w-4" />
              {connect.isPending || logout.isPending ? "Preparing QR..." : startQrFlowLabel}
            </button>
            {currentStatus === "connected" && (
              <button
                type="button"
                onClick={() => setShowDisconnectDialog(true)}
                className="inline-flex items-center gap-2 rounded-full border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>

      {actionError && (
        <div className="border-danger/20 bg-danger/5 text-danger rounded-2xl border p-4 text-sm">
          {actionError}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="space-y-6">
          <WhatsappIntegrationCard />

        </div>
      )}

      {isLoading && (
        <div className="border-border bg-surface rounded-2xl border p-6 shadow-sm">
          <p className="text-muted text-sm">Loading connection status...</p>
        </div>
      )}

      {isError && (
        <div className="border-border bg-surface rounded-2xl border p-6 shadow-sm">
          <ErrorState
            message="Unable to reach the WhatsApp gateway. Try again shortly."
            onRetry={() => refetch()}
          />
        </div>
      )}

      {actionError && (
        <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
          {actionError}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <LiveStatusPanel />

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            {isLoading && <p className="mt-4 text-sm text-muted">Loading connection status...</p>}
            {isError && (
              <ErrorState
                className="mt-4"
                message="Unable to reach the WhatsApp gateway. Try again shortly."
                onRetry={() => refetch()}
              />
            )}

            {currentStatus === "qr_pending" && status?.qrCode && (
              <div className="mt-2 grid gap-5 md:grid-cols-[240px_minmax(0,1fr)] md:items-center">
                <div className="flex justify-center rounded-2xl border border-border bg-bg/60 p-4">
                  {qrExpired ? (
                    <div className="flex h-[220px] w-[220px] items-center justify-center rounded-xl border border-dashed border-danger/40 bg-danger/5 text-center text-sm text-danger">
                      QR expired
                    </div>
                  ) : (
                    <Image
                      src={status.qrCode}
                      alt="WhatsApp QR code"
                      width={220}
                      height={220}
                      unoptimized
                      className="rounded-xl"
                    />
                  )}
                </div>
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                    <QrCode className="h-3.5 w-3.5" />
                    Pairing required
                  </div>
                  <p className="text-sm text-muted">
                    Open WhatsApp on your phone, go to{" "}
                    <span className="font-medium text-text">Linked Devices</span>, then scan the QR to finish connecting.
                  </p>
                  {qrSecondsRemaining !== null && !qrExpired && (
                    <p className="text-xs text-muted">QR expires in {qrSecondsRemaining}s.</p>
                  )}
                  {qrExpired && (
                    <p className="text-sm text-danger">This QR code has expired. Refresh it to generate a new one.</p>
                  )}
                </div>
              </div>
            )}

            {currentStatus === "auth_required" && (
              <div className="mt-2 rounded-2xl border border-danger/20 bg-danger/5 p-4">
                <p className="text-sm font-medium text-danger">
                  WhatsApp logged this session out. Re-authentication is required.
                </p>
                {latestReason && <p className="mt-1 text-xs text-muted">Reason: {latestReason}</p>}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      void startQrFlow();
                    }}
                    disabled={connect.isPending || logout.isPending}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    {connect.isPending || logout.isPending ? "Preparing QR..." : "Reconnect and scan new QR"}
                  </button>
                </div>
              </div>
            )}

            {currentStatus === "error" && (
              <div className="mt-2 rounded-2xl border border-danger/20 bg-danger/5 p-4">
                <p className="text-sm font-medium text-danger">Automatic reconnection attempts were exhausted.</p>
                {latestReason && <p className="mt-1 text-xs text-muted">Last known reason: {latestReason}</p>}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => reconnect.mutate()}
                    disabled={reconnect.isPending}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    {reconnect.isPending ? "Reconnecting..." : "Retry connection"}
                  </button>
                </div>
              </div>
            )}

            {(currentStatus === "connecting" || currentStatus === "reconnecting") && (
              <div className="mt-2 rounded-2xl border border-warning/20 bg-warning/5 p-4">
                <p className="text-sm text-warning">
                  {currentStatus === "connecting"
                    ? "Establishing connection..."
                    : "Connection dropped; retrying automatically with backoff..."}
                </p>
              </div>
            )}

            {(currentStatus === "idle" || currentStatus === "disconnected") && (
              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void startQrFlow();
                  }}
                  disabled={connect.isPending || logout.isPending}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {connect.isPending || logout.isPending ? "Preparing QR..." : "Connect WhatsApp"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-text">Connection history</h2>
            <ConnectionTimeline />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showDisconnectDialog}
        onOpenChange={setShowDisconnectDialog}
        title="Disconnect WhatsApp?"
        description="This will end the active WhatsApp session and clear the connected phone number. Saved session credentials are kept, and your chat history is not affected."
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting..."
        isPending={disconnect.isPending}
        onConfirm={handleDisconnect}
      />

      <ConfirmDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        title="Scan a new QR code?"
        description="This signs WhatsApp out on your phone and clears the saved session credentials. You will need to scan a fresh QR code to reconnect. Chat history is not affected."
        confirmLabel="Reset session"
        pendingLabel="Resetting..."
        isPending={logout.isPending || connect.isPending}
        onConfirm={() => {
          void confirmResetSession();
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
