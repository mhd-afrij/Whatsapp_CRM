"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Clock3, Loader2, LogOut, Plus, QrCode, RefreshCw, RotateCcw, Smartphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { RequirePermission } from "@/components/auth/require-permission";
import { SettingsCard } from "@/components/settings/settings-card";
import { Toggle } from "@/components/settings/toggle";
import { SyncStatusCard } from "@/components/whatsapp/sync-status-card";
import { danger, input, secondary } from "@/components/settings/styles";
import { useTeams } from "@/hooks/use-admin";
import { useCreateWorkspaceWhatsappAccount, useDeleteWorkspaceWhatsappAccount, useUpdateWorkspaceWhatsappAccount, useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { useWhatsappActions, useWhatsappStatus } from "@/hooks/use-whatsapp-connection";

const STATUS_LABELS = {
  idle: "Not connected",
  connecting: "Connecting",
  qr_pending: "Awaiting QR scan",
  connected: "Connected",
  disconnected: "Disconnected",
  reconnecting: "Reconnecting",
  auth_required: "Re-authentication required",
  error: "Connection error",
} as const;

const STATUS_STYLES = {
  idle: "bg-muted",
  connecting: "bg-warning animate-pulse",
  qr_pending: "bg-warning animate-pulse",
  connected: "bg-success",
  disconnected: "bg-danger",
  reconnecting: "bg-warning animate-pulse",
  auth_required: "bg-danger",
  error: "bg-danger",
} as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function WorkspaceWhatsappPage() {
  const workspaceQuery = useWorkspaceSettings();
  const teams = useTeams();
  const createAccount = useCreateWorkspaceWhatsappAccount();
  const updateAccount = useUpdateWorkspaceWhatsappAccount();
  const deleteAccount = useDeleteWorkspaceWhatsappAccount();
const statusQuery = useWhatsappStatus();
  const { reconnect, logout, generateQr, checkNow } = useWhatsappActions();
  const [name, setName] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const workspace = workspaceQuery.data;
  const accounts = [...(workspace?.whatsapp_accounts ?? []), ...(workspace?.detached_whatsapp_accounts ?? [])];
  const account = accounts.find((item) => item.is_default) ?? accounts[0];
const status = statusQuery.data?.status ?? "idle";
  const isGatewayUnavailable = statusQuery.gatewayUnavailable;
  const isBusy = reconnect.isPending || logout.isPending || generateQr.isPending;

  const runReconnect = async (label: string) => {
    setActionMessage(null);
    setActionError(false);
    try {
      await reconnect.mutateAsync();
      setActionMessage(label + " started.");
    } catch {
      setActionError(true);
      setActionMessage(label + " failed. Please try again.");
    }
  };

  const runGenerateQr = async () => {
    setActionMessage(null);
    setActionError(false);
    try {
      await generateQr.mutateAsync();
      setActionMessage("New QR code generated.");
    } catch {
      setActionError(true);
      setActionMessage("Unable to generate a new QR code.");
    }
  };

  const runLogout = async () => {
    setActionMessage(null);
    setActionError(false);
    try {
      await logout.mutateAsync();
      setActionMessage("Device logged out.");
    } catch {
      setActionError(true);
      setActionMessage("Unable to log out the device.");
    }
  };

  return (
    <RequirePermission permission="whatsapp.connection.manage">
      <div className="space-y-4">
<section className="rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Connection Status</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={"h-2.5 w-2.5 rounded-full " + (isGatewayUnavailable ? STATUS_STYLES.reconnecting : STATUS_STYLES[status])} />
                <h2 className="text-lg font-semibold text-text">{isGatewayUnavailable ? "WhatsApp gateway temporarily unavailable" : STATUS_LABELS[status]}</h2>
              </div>
            </div>
            {statusQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Refreshing connection status" />}
          </div>

          {isGatewayUnavailable && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <div>
                  <p className="font-medium text-text">WhatsApp gateway is temporarily unavailable.</p>
                  <p className="mt-0.5 text-sm text-muted">Trying again automatically.</p>
                  <p className="mt-1 text-xs text-muted">
                    Last checked: {statusQuery.lastCheckedAt?.toLocaleString() ?? "Not yet"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={secondary}
                disabled={checkNow.isPending}
                onClick={() => void checkNow.mutate()}
              >
                <RefreshCw className={`h-4 w-4 ${checkNow.isPending ? "animate-spin" : ""}`} />
                {checkNow.isPending ? "Checking..." : "Retry now"}
              </button>
            </div>
          )}

          <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
            <div><p className="flex items-center gap-2 text-xs font-medium text-muted"><Smartphone className="h-3.5 w-3.5" />Device</p><p className="mt-1 text-sm font-medium text-text">{account?.device_id ?? "Not detected"}</p></div>
            <div><p className="flex items-center gap-2 text-xs font-medium text-muted"><QrCode className="h-3.5 w-3.5" />Phone</p><p className="mt-1 text-sm font-medium text-text">{statusQuery.data?.phoneNumber ?? account?.phone_number ?? "Not paired"}</p></div>
            <div><p className="flex items-center gap-2 text-xs font-medium text-muted"><Clock3 className="h-3.5 w-3.5" />Last Connected</p><p className="mt-1 text-sm font-medium text-text">{formatDate(account?.last_connected_at)}</p></div>
          </div>

          {statusQuery.data?.qrCode && (
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-bg p-4">
              <img src={statusQuery.data.qrCode} alt="Scan this QR code to connect WhatsApp" className="h-40 w-40 rounded-md bg-white p-2" />
              <div><p className="font-medium text-text">Scan to connect</p><p className="mt-1 text-sm text-muted">Use WhatsApp on your phone to scan this code.</p>{statusQuery.data.qrExpiresAt && <p className="mt-1 text-xs text-muted">QR expires {formatDate(statusQuery.data.qrExpiresAt)}</p>}</div>
            </div>
          )}
          {statusQuery.data?.sync !== undefined && <div className="mt-4"><SyncStatusCard sync={statusQuery.data.sync} /></div>}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <button type="button" className={secondary} disabled={isBusy} onClick={() => void runReconnect("Reconnect")}><RefreshCw className="h-4 w-4" />Reconnect</button>
            <button type="button" className={secondary} disabled={isBusy} onClick={() => void runGenerateQr()}><QrCode className="h-4 w-4" />Generate New QR</button>
            <button type="button" className={secondary} disabled={isBusy} onClick={() => void runReconnect("Restart service")}><RotateCcw className="h-4 w-4" />Restart Service</button>
            <button type="button" className={danger} disabled={isBusy} onClick={() => void runLogout()}><LogOut className="h-4 w-4" />Logout Device</button>
          </div>
          {actionMessage && <p className={"mt-3 flex items-center gap-2 text-sm " + (actionError ? "text-danger" : "text-success")}>{actionError ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{actionMessage}</p>}
        </section>

        <SettingsCard title="WhatsApp Accounts" description="Connected numbers, QR connection, status, team assignment, auto reply, and disconnect controls.">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Account display name" />
            <button className={secondary} type="button" disabled={!name || createAccount.isPending} onClick={() => createAccount.mutate({ display_name: name }, { onSuccess: () => setName("") })}><Plus className="h-4 w-4" />Create Account Slot</button>
          </div>
          <div className="mt-5 space-y-3">
            {accounts.length === 0 && <p className="rounded-lg border border-dashed border-border bg-bg p-4 text-sm text-muted">No WhatsApp accounts yet.</p>}
            {accounts.map((item, index) => (
              <div key={String(item.id ?? "pending") + "-" + String(item.whatsapp_session_id ?? index)} className="rounded-lg border border-border bg-bg p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="font-semibold text-text">{item.display_name}</h3><p className="text-xs text-muted">{item.phone_number ?? "Not paired"} - {item.status ?? "slot only"}</p></div>
                  <div className="flex items-center gap-2">{item.is_default && <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">Default</span>}{item.id && <button type="button" className={danger} disabled={deleteAccount.isPending} onClick={() => deleteAccount.mutate(item.id!)}><Trash2 className="h-4 w-4" />Delete</button>}</div>
                </div>
                {item.id && <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <select className={input} value={item.assigned_team_id ?? ""} onChange={(e) => updateAccount.mutate({ id: item.id!, values: { assigned_team_id: e.target.value ? Number(e.target.value) : null } })}>
                    <option value="">No assigned team</option>
                    {teams.data?.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                  <button type="button" className={secondary} onClick={() => updateAccount.mutate({ id: item.id!, values: { is_default: true } })}>Set Default</button>
                  <Toggle label="Auto reply" checked={Boolean(item.auto_reply_settings?.enabled)} onChange={(enabled) => updateAccount.mutate({ id: item.id!, values: { auto_reply_settings: { ...item.auto_reply_settings, enabled } } })} />
                </div>}
              </div>
            ))}
          </div>
        </SettingsCard>
      </div>
    </RequirePermission>
  );
}

