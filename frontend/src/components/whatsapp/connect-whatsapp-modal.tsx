"use client";

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AccountStatusBadge } from "@/components/whatsapp/account-status-badge";
import { danger, secondary } from "@/components/settings/styles";
import { usePermission } from "@/hooks/use-permission";
import { useToast } from "@/providers/toast-provider";
import {
  useConnectWhatsappAccount,
  useReconnectWhatsappAccount,
  useWhatsappAccountQr,
  useWhatsappAccounts,
} from "@/hooks/use-whatsapp-accounts";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-connection";
import { resolveWhatsappQrState, whatsappQrStateHint, type WhatsappQrState } from "@/lib/whatsapp-qr-state";
import { ApiError } from "@/lib/api-client";
import type { WhatsappAccount } from "@/lib/whatsapp-accounts-api";

/**
 * "Connect WhatsApp" modal for a managed account. All connection data comes
 * from the real backend/gateway: the modal never generates or fakes a QR
 * code. The gateway's live status (Socket.IO `connection.updated` via
 * useWhatsappStatus) drives the state transitions after the initial
 * connect/QR request.
 */
export function ConnectWhatsAppModal({
  account,
  onOpenChange,
}: {
  account: WhatsappAccount | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const canManage = usePermission("whatsapp.connection.manage");
  const connectMutation = useConnectWhatsappAccount();
  const reconnectMutation = useReconnectWhatsappAccount();
  const qrMutation = useWhatsappAccountQr();
  const statusQuery = useWhatsappStatus({ enabled: account !== null });
  const accountsQuery = useWhatsappAccounts({ enabled: account !== null });

  const [error, setError] = useState<string | null>(null);

  // Kick off a real pairing the first time the modal opens for an account.
  // The mutation id is keyed to the account so re-opening the modal for the
  // same account (or switching accounts) re-triggers exactly once.
  const kickoffRef = useRef<number | null>(null);
  useEffect(() => {
    if (!account || kickoffRef.current === account.id) return;
    kickoffRef.current = account.id;
    connectMutation.mutate(account.id, {
      onSuccess: () => toast("QR pairing initiated. Scan the code with your phone.", "success"),
      onError: (err) => {
        kickoffRef.current = null;
        setError(err instanceof ApiError ? err.message : "Unable to start WhatsApp connection.");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  if (!account) return null;

  const liveAccount = accountsQuery.data?.find((item) => item.id === account.id) ?? account;
  const live = statusQuery.data;

  const qrState: WhatsappQrState = resolveWhatsappQrState({
    status: live?.status ?? liveAccount.status,
    qrCode: live?.qrCode ?? null,
    qrExpiresAt: live?.qrExpiresAt ?? null,
    error: error ?? (statusQuery.isError && !statusQuery.gatewayUnavailable ? "failed" : null),
  });

  const close = () => onOpenChange(false);
  const isBusy = connectMutation.isPending || qrMutation.isPending;

  const refreshQr = () => {
    setError(null);
    qrMutation.mutate(liveAccount.id, {
      onSuccess: () => toast("A new QR code has been generated.", "success"),
      onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to refresh the QR code."),
    });
  };

  const retryConnection = () => {
    setError(null);
    reconnectMutation.mutate(liveAccount.id, {
      onSuccess: () => toast("Reconnecting to WhatsApp...", "success"),
      onError: (err) => setError(err instanceof ApiError ? err.message : "WhatsApp connection failed."),
    });
  };

  return (
    <Dialog open={account !== null} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent showCloseButton className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect {liveAccount.name}</DialogTitle>
          <DialogDescription>
            Link this account to WhatsApp through the gateway&apos;s secure pairing flow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {qrState === "generating" && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-text">Generating QR...</p>
              <p className="mt-1 text-xs text-muted">The gateway is preparing your pairing code.</p>
            </div>
          )}

          {(qrState === "waiting" || qrState === "expired") && live?.qrCode && (
            <div className="flex flex-col items-center rounded-xl border border-border bg-bg p-6">
              {/* QR comes from the gateway (Baileys) - rendered as-is. */}
              <img
                src={live.qrCode}
                alt="Scan this QR code to connect WhatsApp"
                className="h-48 w-48 rounded-lg bg-white p-2"
              />
              <p className="mt-3 text-sm font-medium text-text">{whatsappQrStateHint(qrState)}</p>
              {qrState === "waiting" && (
                <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-muted">
                  <li>Open WhatsApp on your phone.</li>
                  <li>Go to Settings &rarr; Linked Devices.</li>
                  <li>Tap Link a Device.</li>
                  <li>Scan this QR code.</li>
                </ol>
              )}
              {qrState === "expired" && (
                <button type="button" className={`${secondary} mt-3`} onClick={refreshQr} disabled={isBusy}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Generate New QR
                </button>
              )}
            </div>
          )}

          {qrState === "connecting" && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg p-8">
              <Loader2 className="h-6 w-6 animate-spin text-warning" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-text">Connecting...</p>
              <p className="mt-1 text-xs text-muted">Finishing the WhatsApp handshake.</p>
            </div>
          )}

          {qrState === "connected" && (
            <div className="flex flex-col items-center rounded-xl border border-success/40 bg-success/10 p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-success">
                ✓
              </span>
              <p className="mt-3 text-sm font-semibold text-text">WhatsApp connected successfully.</p>
              {live?.phoneNumber && <p className="mt-1 text-sm text-muted">{live.phoneNumber}</p>}
              <div className="mt-2">
                <AccountStatusBadge status="connected" />
              </div>
            </div>
          )}

          {qrState === "error" && (
            <div className="flex flex-col items-center rounded-xl border border-danger/40 bg-danger/10 p-6">
              <AlertTriangle className="h-6 w-6 text-danger" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-text">WhatsApp connection failed.</p>
              <p className="mt-1 text-xs text-muted">{error ?? "An unexpected error occurred."}</p>
              <button type="button" className={`${danger} mt-3`} onClick={retryConnection} disabled={reconnectMutation.isPending}>
                {reconnectMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                Try Again
              </button>
            </div>
          )}

          {!canManage && (
            <p className="text-xs text-muted">
              You can view the connection state but need the WhatsApp manage permission to connect.
            </p>
          )}
        </div>

        <DialogFooter>
          <button type="button" className={secondary} onClick={close}>
            {qrState === "connected" ? "Done" : "Cancel"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
