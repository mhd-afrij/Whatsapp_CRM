"use client";

import { Loader2, MessageSquareText, Plus, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequirePermission } from "@/components/auth/require-permission";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { AccountCardSkeleton } from "@/components/whatsapp/account-status-badge";
import { AccountCard } from "@/components/whatsapp/account-card";
import { AddAccountDialog } from "@/components/whatsapp/add-account-dialog";
import { AccountDetailsSheet } from "@/components/whatsapp/account-details-sheet";
import { ConfirmActionDialog } from "@/components/whatsapp/confirm-action-dialog";
import { ConnectWhatsAppModal } from "@/components/whatsapp/connect-whatsapp-modal";
import { ConnectionHealthCard } from "@/components/whatsapp/connection-health-card";
import { input, primary, secondary } from "@/components/settings/styles";
import { usePermission } from "@/hooks/use-permission";
import {
  useDeleteWorkspaceWhatsappAccount,
  useUpdateWorkspaceWhatsappAccount,
  useWorkspaceSettings,
} from "@/hooks/use-workspace-settings";
import {
  useDeleteWhatsappAccount,
  useDisconnectWhatsappAccount,
  useSetActiveWhatsappAccount,
  useUpdateWhatsappAccount,
  useWhatsappAccounts,
  whatsappAccountErrorMessage,
} from "@/hooks/use-whatsapp-accounts";
import { useWhatsappActions, useWhatsappStatus } from "@/hooks/use-whatsapp-connection";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { WhatsappAccount } from "@/lib/whatsapp-accounts-api";
import { useToast } from "@/providers/toast-provider";

type StatusFilter = "all" | "connected" | "connecting" | "disconnected" | "error";

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "connected", label: "Connected" },
  { key: "connecting", label: "Connecting" },
  { key: "disconnected", label: "Disconnected" },
  { key: "error", label: "Error" },
];

const FILTERED_STATUS_GROUPS: Record<Exclude<StatusFilter, "all" | "connected">, readonly string[]> = {
  connecting: ["connecting", "qr_pending", "reconnecting"],
  disconnected: ["disconnected"],
  error: ["error", "auth_required"],
};

function matchesFilter(account: WhatsappAccount, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "connected") return account.is_active && account.status === "connected";
  return FILTERED_STATUS_GROUPS[filter].includes(account.status ?? "");
}

export default function WorkspaceWhatsappPage() {
  const workspaceQuery = useWorkspaceSettings();
  const accountsQuery = useWhatsappAccounts();
  const statusQuery = useWhatsappStatus({ enabled: true });
  const { reconnect, logout, generateQr, checkNow } = useWhatsappActions();
  const updateAccount = useUpdateWhatsappAccount();
  const deleteAccount = useDeleteWhatsappAccount();
  const setActiveAccount = useSetActiveWhatsappAccount();
  const disconnectAccount = useDisconnectWhatsappAccount();
  const canManage = usePermission("whatsapp.connection.manage");
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [connectAccount, setConnectAccount] = useState<WhatsappAccount | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [detailsAccount, setDetailsAccount] = useState<WhatsappAccount | null>(null);
  const [editAccount, setEditAccount] = useState<WhatsappAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WhatsappAccount | null>(null);

  const workspace = workspaceQuery.data;
  const accounts = accountsQuery.data ?? [];

  // The workspace's single live session's health card still uses the
  // gateway status endpoint; the active account mirrors that session.
  const activeAccount = accounts.find((item) => item.is_active) ?? null;

  const visibleAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (!matchesFilter(account, filter)) return false;
      if (!query) return true;
      return [account.name, account.phone_number ?? "", account.assigned_team?.name ?? ""].some((value) =>
        value.toLowerCase().includes(query)
      );
    });
  }, [accounts, filter, search]);

  const openEdit = (account: WhatsappAccount) => {
    setEditAccount(account);
    setEditName(account.name);
  };

  const submitEdit = async () => {
    if (!editAccount || !editName.trim()) return;
    try {
      await updateAccount.mutateAsync({ id: editAccount.id, values: { name: editName.trim() } });
      toast("Account settings updated.", "success");
      setEditAccount(null);
    } catch (error) {
      toast(whatsappAccountErrorMessage(error, "Unable to update account."), "error");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAccount.mutateAsync(deleteTarget.id);
      toast("WhatsApp account deleted.", "success");
      setDeleteTarget(null);
    } catch (error) {
      toast(whatsappAccountErrorMessage(error, "Unable to delete account."), "error");
    }
  };

  // Set Active: every account now runs its own concurrent session,
  // so activation is purely a routing preference - no disconnect required.
  const handleSetActive = async (account: WhatsappAccount) => {
    try {
      await setActiveAccount.mutateAsync({ id: account.id });
      toast(`"${account.name}" is now the active WhatsApp account.`, "success");
    } catch (error) {
      toast(whatsappAccountErrorMessage(error, "Unable to set the active account."), "error");
    }
  };

  const handleDisconnect = async (account: WhatsappAccount) => {
    try {
      await disconnectAccount.mutateAsync(account.id);
      toast("WhatsApp account disconnected.", "success");
    } catch (error) {
      toast(whatsappAccountErrorMessage(error, "Unable to disconnect the account."), "error");
    }
  };

  // Skeletons only on the very first load; refetches keep the current list on
  // screen (no layout shift, no flicker).
  const initialLoading = accountsQuery.isPending;

  return (
    <RequirePermission permission="whatsapp.connection.manage">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <SettingsBreadcrumb
              items={[
                { label: "Settings", href: "/settings" },
                { label: "WhatsApp", href: "/settings/workspace/whatsapp" },
                { label: "Accounts" },
              ]}
            />
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-text">WhatsApp Accounts</h1>
            <p className="mt-1 text-sm text-muted">
              Manage WhatsApp connections, sessions, routing and account settings.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className={secondary}
              onClick={() => {
                void accountsQuery.refetch();
                checkNow.mutate();
              }}
              disabled={accountsQuery.isFetching}
              aria-label="Refresh accounts and connection status"
            >
              <RefreshCw className={cn("h-4 w-4", accountsQuery.isFetching && "animate-spin")} aria-hidden="true" />
              Refresh
            </button>
            {canManage && (
              <button type="button" className={primary} onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add WhatsApp Account
              </button>
            )}
          </div>
        </div>

        {accountsQuery.isError ? (
          <section className="rounded-2xl border border-border bg-surface p-8 text-center">
            <MessageSquareText className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-3 font-medium text-text">Unable to load WhatsApp accounts</p>
            <p className="mt-1 text-sm text-muted">We couldn&apos;t retrieve your WhatsApp account information.</p>
            <button type="button" className={cn(primary, "mt-4")} onClick={() => void accountsQuery.refetch()}>
              Retry
            </button>
          </section>
        ) : initialLoading ? (
          <div className="space-y-5">
            <div className="h-64 animate-pulse rounded-2xl bg-surface" aria-hidden="true" />
            {Array.from({ length: 2 }).map((_, index) => (
              <AccountCardSkeleton key={index} />
            ))}
          </div>
        ) : (
          <>
            <ConnectionHealthCard
              status={statusQuery.data}
              statusQuery={{
                isFetching: statusQuery.isFetching,
                isError: statusQuery.isError,
                refetch: () => void statusQuery.refetch(),
                lastCheckedAt: statusQuery.lastCheckedAt,
              }}
              activeAccount={
                activeAccount
                  ? {
                      id: activeAccount.id,
                      whatsapp_session_id: activeAccount.is_active ? (activeAccount.id as unknown as number) : null,
                      display_name: activeAccount.name,
                      assigned_team_id: activeAccount.assigned_team_id,
                      assigned_team: activeAccount.assigned_team,
                      is_default: activeAccount.is_active,
                      auto_reply_settings: { enabled: activeAccount.auto_reply_enabled, message: null },
                      status: activeAccount.status,
                      phone_number: activeAccount.phone_number,
                      device_id: activeAccount.device_name,
                      last_connected_at: activeAccount.last_connected_at,
                      last_disconnected_at: null,
                    }
                  : null
              }
              gatewayUnavailable={statusQuery.gatewayUnavailable}
              actions={{ reconnect, logout, generateQr, checkNow }}
              canManage={canManage}
            />

            {/* Accounts section */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-text">WhatsApp Accounts</h2>
                    <span className="rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-muted">
                      {accounts.length} {accounts.length === 1 ? "Account" : "Accounts"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    Manage connected WhatsApp numbers, team assignments, routing and automation.
                  </p>
                </div>
              </div>

              {accounts.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-0 flex-1 sm:max-w-xs">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                      aria-hidden="true"
                    />
                    <input
                      className={cn(input, "pl-9")}
                      placeholder="Search accounts..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      aria-label="Search accounts"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
                    {STATUS_FILTERS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setFilter(option.key)}
                        aria-pressed={filter === option.key}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          filter === option.key
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-bg text-muted hover:border-primary/40 hover:text-text",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {accounts.length === 0 ? (
                <section className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <MessageSquareText className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <p className="mt-4 font-semibold text-text">No WhatsApp accounts yet</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                    Connect a WhatsApp number to start sending and receiving customer messages.
                  </p>
                  {canManage && (
                    <button type="button" className={cn(primary, "mt-5")} onClick={() => setAddOpen(true)}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Connect WhatsApp Account
                    </button>
                  )}
                </section>
              ) : visibleAccounts.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
                  No accounts match your search or filter.
                </p>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {visibleAccounts.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      isActive={account.is_active}
                      onViewDetails={setDetailsAccount}
                      onEdit={openEdit}
                      onAssignTeam={(id, teamId) =>
                        updateAccount.mutate(
                          { id, values: { assigned_team_id: teamId } },
                          {
                            onSuccess: () => toast("Account settings updated.", "success"),
                            onError: () => toast("Unable to update account.", "error"),
                          },
                        )
                      }
                      onConnect={(account) => setConnectAccount(account)}
                      onDisconnect={(account) => void handleDisconnect(account)}
                      onSetActive={(account) => void handleSetActive(account)}
                      onDelete={setDeleteTarget}
                      updatePending={updateAccount.isPending}
                      actionPending={setActiveAccount.isPending}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* The Add wizard handles the full number -> method -> QR/pairing
            -> success flow (including the connect kickoff) internally. */}
        <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />

        <ConnectWhatsAppModal account={connectAccount} onOpenChange={(open) => (open ? undefined : setConnectAccount(null))} />

        <AccountDetailsSheet
          account={
            detailsAccount
              ? {
                  id: detailsAccount.id,
                  whatsapp_session_id: detailsAccount.is_active ? detailsAccount.id : null,
                  display_name: detailsAccount.name,
                  assigned_team_id: detailsAccount.assigned_team_id,
                  assigned_team: detailsAccount.assigned_team,
                  is_default: detailsAccount.is_active,
                  auto_reply_settings: { enabled: detailsAccount.auto_reply_enabled, message: null },
                  status: detailsAccount.status,
                  phone_number: detailsAccount.phone_number,
                  device_id: detailsAccount.device_name,
                  last_connected_at: detailsAccount.last_connected_at,
                  last_disconnected_at: null,
                }
              : null
          }
          workspaceName={workspace?.name ?? null}
          onOpenChange={(open) => {
            if (!open) setDetailsAccount(null);
          }}
        />

        {/* Edit-name dialog */}
        <Dialog
          open={editAccount !== null}
          onOpenChange={(open) => {
            if (!open) setEditAccount(null);
          }}
        >
          <DialogContent showCloseButton className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Account</DialogTitle>
              <DialogDescription>Rename this WhatsApp account.</DialogDescription>
            </DialogHeader>
            <div>
              <label htmlFor="wa-edit-name" className="mb-1.5 block text-xs font-medium text-muted">
                Account Display Name *
              </label>
              <input
                id="wa-edit-name"
                className={input}
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <button
                type="button"
                className={secondary}
                onClick={() => setEditAccount(null)}
                disabled={updateAccount.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className={primary}
                onClick={() => void submitEdit()}
                disabled={updateAccount.isPending || !editName.trim()}
              >
                {updateAccount.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Save Changes
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <ConfirmActionDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title={`Delete ${deleteTarget?.name ?? "WhatsApp account"}?`}
          description={`"${deleteTarget?.name ?? "This account"}" will be removed from this workspace. If it is currently connected, the gateway session is logged out first.`}
          confirmLabel="Delete Account"
          pending={deleteAccount.isPending}
          onConfirm={() => void confirmDelete()}
        />
      </div>
    </RequirePermission>
  );
}
