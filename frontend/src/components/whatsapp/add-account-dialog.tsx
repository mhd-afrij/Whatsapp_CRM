"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { input, primary, secondary } from "@/components/settings/styles";
import { usePermission } from "@/hooks/use-permission";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/api-client";
import {
  useConnectWhatsappAccount,
  useCreateWhatsappAccount,
  useUpdateWhatsappAccount,
  useWhatsappAccountConnectionStatus,
  useWhatsappAccountQr,
  useWhatsappAccounts,
  whatsappAccountErrorMessage,
} from "@/hooks/use-whatsapp-accounts";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-connection";
import {
  resolveWhatsappQrState,
  whatsappQrStateHint,
  type WhatsappQrState,
} from "@/lib/whatsapp-qr-state";

type WizardStep = "connecting" | "qr" | "success";

/**
 * Simplified "Add WhatsApp Account" dialog — auto-creates an account slot
 * and immediately shows the QR code for scanning. No form required.
 *
 * Flow: open -> auto-create account -> connect -> show QR -> user scans -> success
 */
export function AddAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const canManage = usePermission("whatsapp.connection.manage");

  const createAccount = useCreateWhatsappAccount();
  const connectAccount = useConnectWhatsappAccount();
  const updateAccount = useUpdateWhatsappAccount();
  const qrMutation = useWhatsappAccountQr();
  const accountsQuery = useWhatsappAccounts({ enabled: open });

  const [step, setStep] = useState<WizardStep>("connecting");
  const [error, setError] = useState<string | null>(null);

  // The account created and its details.
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accountName, setAccountName] = useState("");

  // Track whether we've already initiated the connect for this dialog session.
  const kickoffRef = useRef<number | null>(null);

  // Live connection state: socket-pushed gateway status + polled connection
  // snapshot (covers missed socket events while the wizard is open).
  const statusQuery = useWhatsappStatus({ enabled: open && accountId !== null });
  const connectionStatusQuery = useWhatsappAccountConnectionStatus(accountId, {
    enabled: open && accountId !== null && step === "qr",
  });

  const live = statusQuery.data;
  const polled = connectionStatusQuery.data;

  const reset = () => {
    setStep("connecting");
    setError(null);
    setAccountId(null);
    setAccountName("");
    kickoffRef.current = null;
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  // Auto-create and connect when dialog opens (once per open).
  useEffect(() => {
    if (!open || kickoffRef.current !== null) return;

    let cancelled = false;

    (async () => {
      try {
        // 1) Create a managed slot - always DISCONNECTED until real gateway confirms.
        const account = await createAccount.mutateAsync({});

        if (cancelled) return;

        setAccountId(account.id);
        setAccountName(account.name);
        kickoffRef.current = account.id;

        // 2) Immediately map the slot onto the workspace's real gateway
        //    session and start pairing so the QR is ready.
        await connectAccount.mutateAsync(account.id);

        if (!cancelled) {
          setStep("qr");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            whatsappAccountErrorMessage(err, "Unable to start WhatsApp connection.")
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Gateway says connected -> success. Driven only by real gateway state.
  const gatewayConnected =
    live?.status === "connected" || (polled?.status === "connected" && polled?.connected === true);

  // Derived step: the gateway's real connection state overrides the wizard's
  // local navigation - the moment it reports a connected session, the wizard
  // shows success wherever it currently is.
  const effectiveStep: WizardStep =
    gatewayConnected && step !== "success" ? "success" : step;

  const displayNumber = live?.phoneNumber ?? polled?.phoneNumber ?? null;

  const refreshQr = () => {
    if (accountId === null) return;
    setError(null);
    qrMutation.mutate(accountId, {
      onSuccess: () => toast("A new QR code has been generated.", "success"),
      onError: (err) =>
        setError(err instanceof ApiError ? err.message : "Unable to refresh the QR code."),
    });
  };

  // QR state machine (generating | waiting | connecting | connected | expired | error)
  const qrState: WhatsappQrState = resolveWhatsappQrState({
    status: live?.status ?? polled?.status ?? null,
    qrCode: live?.qrCode ?? polled?.qrCode ?? null,
    qrExpiresAt: live?.qrExpiresAt ?? polled?.qrExpiresAt ?? null,
    error: error ?? (statusQuery.isError && !statusQuery.gatewayUnavailable ? "failed" : null),
  });

  const qrCode = live?.qrCode ?? polled?.qrCode ?? null;

  const retryConnection = () => {
    if (accountId === null) return;
    setError(null);
    connectAccount.mutate(accountId, {
      onSuccess: () => toast("Reconnecting to WhatsApp...", "success"),
      onError: (err) =>
        setError(err instanceof ApiError ? err.message : "WhatsApp connection failed."),
    });
  };

  const pending = createAccount.isPending || connectAccount.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent showCloseButton className="flex max-h-[90vh] flex-col overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {effectiveStep === "success" ? "WhatsApp Connected" : "Connect WhatsApp"}
          </DialogTitle>
          <DialogDescription>
            {effectiveStep === "success"
              ? "Your WhatsApp account is ready."
              : "Scan the QR code with your phone to connect."}
          </DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        {effectiveStep !== "connecting" && (
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= (effectiveStep === "success" ? 2 : 1) ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
        )}

        {/* ------------------------------------------------ CONNECTING */}
        {effectiveStep === "connecting" && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg p-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-text">Preparing connection...</p>
            <p className="mt-1 text-xs text-muted">Setting up your WhatsApp account.</p>
            {error && (
              <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        {/* ---------------------------------------------------- QR flow */}
        {effectiveStep === "qr" && (
          <div className="space-y-4">
            {qrState === "generating" && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg p-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-text">Generating QR...</p>
                <p className="mt-1 text-xs text-muted">The gateway is preparing your pairing code.</p>
              </div>
            )}

            {(qrState === "waiting" || qrState === "expired") && qrCode && (
              <div className="flex flex-col items-center rounded-xl border border-border bg-bg p-6">
                {/* Real QR from the gateway (Baileys) - rendered as-is. */}
                <img
                  src={qrCode}
                  alt="Scan this QR code to connect WhatsApp"
                  className="h-56 w-56 rounded-lg bg-white p-2"
                />
                <p className="mt-3 text-sm font-medium text-text">{whatsappQrStateHint(qrState)}</p>
                {qrState === "waiting" && (
                  <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-left text-xs text-muted">
                    <li>Open WhatsApp on your phone.</li>
                    <li>Open Settings / Menu.</li>
                    <li>Select Linked Devices.</li>
                    <li>Tap &ldquo;Link a device&rdquo;.</li>
                    <li>Scan this QR code.</li>
                  </ol>
                )}
                {qrState === "expired" && (
                  <button
                    type="button"
                    className={`${secondary} mt-3`}
                    onClick={refreshQr}
                    disabled={qrMutation.isPending}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Refresh QR
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

            {qrState === "error" && (
              <div className="flex flex-col items-center rounded-xl border border-danger/40 bg-danger/10 p-6">
                <AlertTriangle className="h-6 w-6 text-danger" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-text">Connection failed</p>
                <p className="mt-1 text-xs text-muted">{error ?? "An unexpected error occurred."}</p>
                <button
                  type="button"
                  className={`${secondary} mt-3`}
                  onClick={retryConnection}
                  disabled={connectAccount.isPending}
                >
                  {connectAccount.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Try Again
                </button>
              </div>
            )}

            {qrState !== "error" && qrState !== "connected" && (
              <p className="flex items-center justify-center gap-2 text-xs text-muted">
                {qrState === "connecting" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Connecting...
                  </>
                ) : (
                  <>Status: {whatsappQrStateHint(qrState)}</>
                )}
              </p>
            )}

            {error && qrState !== "error" && (
              <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        {/* ---------------------------------------------------- SUCCESS */}
        {effectiveStep === "success" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center rounded-xl border border-success/40 bg-success/10 p-6">
              <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-text">{accountName}</p>
              {displayNumber && <p className="mt-0.5 text-sm text-muted">{displayNumber}</p>}
              <div className="mt-3 flex items-center gap-1.5">
                <span className="rounded-full bg-success/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success">
                  Connected
                </span>
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                  Active
                </span>
              </div>
              <p className="mt-3 text-xs text-muted">Your WhatsApp account is ready.</p>
            </div>

            {/* Rename straight from the success screen */}
            <div className="flex items-center gap-2">
              <input
                className={input}
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                aria-label="Account display name"
              />
              <button
                type="button"
                className={secondary}
                disabled={
                  updateAccount.isPending ||
                  accountId === null ||
                  accountName.trim().length < 2 ||
                  accountName.trim() ===
                    (accountsQuery.data?.find((a) => a.id === accountId)?.name ?? accountName)
                }
                onClick={() => {
                  if (accountId === null) return;
                  updateAccount.mutate(
                    { id: accountId, values: { name: accountName.trim() } },
                    {
                      onSuccess: () => toast("Account renamed.", "success"),
                      onError: (err) =>
                        toast(
                          whatsappAccountErrorMessage(err, "Unable to rename the account."),
                          "error"
                        ),
                    }
                  );
                }}
              >
                {updateAccount.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>
        )}

        <DialogFooter>
          {effectiveStep === "success" && (
            <>
              <button type="button" className={secondary} onClick={() => router.push("/inbox")}>
                Go to Inbox
              </button>
              <button type="button" className={primary} onClick={close}>
                Done
              </button>
            </>
          )}

          {effectiveStep === "qr" && (
            <>
              {qrState === "waiting" && qrCode && (
                <button
                  type="button"
                  className={secondary}
                  onClick={refreshQr}
                  disabled={qrMutation.isPending}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Refresh QR
                </button>
              )}
              <button type="button" className={secondary} onClick={close}>
                Cancel
              </button>
            </>
          )}

          {effectiveStep === "connecting" && (
            <button type="button" className={secondary} onClick={close} disabled={pending}>
              Cancel
            </button>
          )}
        </DialogFooter>

        {!canManage && (
          <p className="text-xs text-muted">
            You need the WhatsApp manage permission to add or connect accounts.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
