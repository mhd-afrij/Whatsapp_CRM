"use client";

import {
  AlertTriangle,
  Clock3,
  Loader2,
  LogOut,
  MessageSquareText,
  Phone,
  QrCode,
  RefreshCw,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import { useState } from "react";
import { AccountStatusBadge } from "@/components/whatsapp/account-status-badge";
import { ConfirmActionDialog } from "@/components/whatsapp/confirm-action-dialog";
import { ConnectionMetricsSkeleton } from "@/components/whatsapp/account-status-badge";
import { danger, secondary } from "@/components/settings/styles";
import { SyncStatusCard } from "@/components/whatsapp/sync-status-card";
import type { WhatsappStatus } from "@/lib/whatsapp-api";
import { useToast } from "@/providers/toast-provider";
import type { WorkspaceWhatsappAccount } from "@/lib/workspace-api";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Metric({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-text" title={value}>
        {value}
      </p>
    </div>
  );
}

/**
 * Premium connection-health card for the workspace's single live gateway
 * session. All values come from the real gateway status endpoint — nothing is
 * fabricated; missing values render as "—" / "Not detected".
 */
export function ConnectionHealthCard({
  status,
  statusQuery,
  activeAccount,
  gatewayUnavailable,
  actions,
  canManage,
}: {
  status: WhatsappStatus | undefined;
  statusQuery: {
    isFetching: boolean;
    isError: boolean;
    refetch: () => void;
    lastCheckedAt: Date | null;
  };
  activeAccount: WorkspaceWhatsappAccount | null | undefined;
  gatewayUnavailable: boolean;
  actions: {
    reconnect: { mutateAsync: () => Promise<unknown>; isPending: boolean };
    generateQr: { mutateAsync: () => Promise<unknown>; isPending: boolean };
    logout: { mutateAsync: () => Promise<unknown>; isPending: boolean };
    checkNow: { mutate: () => void; isPending: boolean };
  };
  canManage: boolean;
}) {
  const { toast } = useToast();
  const [confirmDialog, setConfirmDialog] = useState<"logout" | "restart" | null>(null);
  const [pendingAction, setPendingAction] = useState<"reconnect" | "logout" | "restart" | null>(null);

  const isBusy =
    pendingAction !== null || actions.reconnect.isPending || actions.generateQr.isPending || actions.logout.isPending;

  const runReconnect = async () => {
    setPendingAction("reconnect");
    try {
      await actions.reconnect.mutateAsync();
      toast("WhatsApp connection restored successfully.", "success");
    } catch {
      toast("Unable to reconnect WhatsApp.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  const runRestart = async () => {
    setPendingAction("restart");
    setConfirmDialog(null);
    try {
      await actions.reconnect.mutateAsync();
      toast("WhatsApp service restarted.", "success");
    } catch {
      toast("Unable to restart the WhatsApp service.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  const runLogout = async () => {
    setPendingAction("logout");
    setConfirmDialog(null);
    try {
      await actions.logout.mutateAsync();
      toast("Device disconnected. Re-authentication required.", "success");
    } catch {
      toast("Unable to disconnect the device.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  const runGenerateQr = async () => {
    try {
      await actions.generateQr.mutateAsync();
      toast("QR code generated.", "success");
    } catch {
      toast("Unable to generate QR code.", "error");
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-busy={isBusy}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
            <MessageSquareText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text">WhatsApp Connection</h2>
            {gatewayUnavailable ? (
              <AccountStatusBadge status="connecting" className="mt-1.5" />
            ) : (
              <AccountStatusBadge status={status?.status} className="mt-1.5" />
            )}
          </div>
        </div>
        {statusQuery.isFetching && (
          <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Refreshing connection status" />
        )}
      </div>

      {!gatewayUnavailable && !statusQuery.isError && status?.status === "connected" && (
        <p className="mt-3 text-sm text-muted">WhatsApp gateway is online and ready to send and receive messages.</p>
      )}

      {gatewayUnavailable && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="font-medium text-text">WhatsApp gateway is temporarily unavailable.</p>
              <p className="mt-0.5 text-sm text-muted">Trying again automatically.</p>
              <p className="mt-1 text-xs text-muted">
                Last checked: {statusQuery.lastCheckedAt?.toLocaleString() ?? "Not yet"}
              </p>
            </div>
          </div>
          <button type="button" className={secondary} disabled={actions.checkNow.isPending} onClick={() => actions.checkNow.mutate()}>
            <RefreshCw className={`h-4 w-4 ${actions.checkNow.isPending ? "animate-spin" : ""}`} aria-hidden="true" />
            {actions.checkNow.isPending ? "Checking..." : "Retry now"}
          </button>
        </div>
      )}

      {status?.sync !== undefined && status?.sync !== null && (
        <div className="mt-4">
          <SyncStatusCard sync={status.sync} />
        </div>
      )}

      {!statusQuery.isFetching || status ? (
        <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            icon={Phone}
            label="Phone"
            value={status?.phoneNumber ?? activeAccount?.phone_number ?? "Not paired"}
          />
          <Metric icon={Smartphone} label="Device" value={activeAccount?.device_id ?? "Not detected"} />
          <Metric
            icon={MessageSquareText}
            label="Session"
            value={
              gatewayUnavailable
                ? "Unavailable"
                : status?.status === "connected"
                  ? "Healthy"
                  : status?.status
                    ? "Attention"
                    : "—"
            }
          />
          <Metric icon={Clock3} label="Last Connected" value={formatDate(activeAccount?.last_connected_at)} />
        </div>
      ) : (
        <ConnectionMetricsSkeleton />
      )}

      {status?.qrCode && (
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-bg p-4">
          <img
            src={status.qrCode}
            alt="Scan this QR code to connect WhatsApp"
            className="h-40 w-40 rounded-lg bg-white p-2"
          />
          <div>
            <p className="font-medium text-text">Scan to connect</p>
            <p className="mt-1 text-sm text-muted">Use WhatsApp on your phone to scan this code.</p>
            {status.qrExpiresAt && (
              <p className="mt-1 text-xs text-muted">QR expires {formatDate(status.qrExpiresAt)}</p>
            )}
          </div>
          <button type="button" className={secondary} onClick={() => void runGenerateQr()} disabled={isBusy}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh QR
          </button>
        </div>
      )}

      {canManage && (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50"
            disabled={isBusy}
            onClick={() => void runReconnect()}
          >
            {pendingAction === "reconnect" || actions.reconnect.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {pendingAction === "reconnect" || actions.reconnect.isPending ? "Reconnecting..." : "Reconnect"}
          </button>
          <button type="button" className={secondary} disabled={isBusy} onClick={() => void runGenerateQr()}>
            <QrCode className="h-4 w-4" aria-hidden="true" />
            Generate New QR
          </button>
          <button
            type="button"
            className={secondary}
            disabled={isBusy}
            onClick={() => setConfirmDialog("restart")}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Restart Service
          </button>
          <div className="ms-auto">
            <button
              type="button"
              className={danger}
              disabled={isBusy}
              onClick={() => setConfirmDialog("logout")}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Disconnect Device
            </button>
          </div>
        </div>
      )}

      <ConfirmActionDialog
        open={confirmDialog === "restart"}
        onOpenChange={(open) => setConfirmDialog(open ? "restart" : null)}
        title="Restart WhatsApp service?"
        description="The gateway will re-establish the WhatsApp session. Messaging may pause briefly while it restarts."
        confirmLabel="Restart"
        pending={pendingAction === "restart"}
        onConfirm={() => void runRestart()}
      />
      <ConfirmActionDialog
        open={confirmDialog === "logout"}
        onOpenChange={(open) => setConfirmDialog(open ? "logout" : null)}
        title="Disconnect WhatsApp?"
        description="This will disconnect the current WhatsApp session. Messaging will stop until the account is connected again."
        confirmLabel="Disconnect"
        pending={pendingAction === "logout"}
        onConfirm={() => void runLogout()}
      />
    </section>
  );
}
