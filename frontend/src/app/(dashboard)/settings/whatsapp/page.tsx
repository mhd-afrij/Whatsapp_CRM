"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, QrCode, RefreshCcw } from "lucide-react";
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

function WhatsappSettingsContent() {
  const { data: status, isLoading, isError, refetch } = useWhatsappStatus();
  const { data: events } = useWhatsappConnectionHistory();
  const { connect, disconnect, logout, reconnect } = useWhatsappActions();
  const { toast } = useToast();
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const autoRefreshTriggeredRef = useRef(false);

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
