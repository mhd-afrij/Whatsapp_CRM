"use client";

import { Eye, MoreHorizontal, Pencil, Phone, PlayCircle, Power, QrCode, StopCircle, Trash2, UserCog } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AccountStatusBadge } from "@/components/whatsapp/account-status-badge";
import { input, secondary } from "@/components/settings/styles";
import { useTeams } from "@/hooks/use-admin";
import { cn } from "@/lib/utils";
import type { WhatsappAccount } from "@/lib/whatsapp-accounts-api";

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * One managed WhatsApp connection. The gateway runs one live Baileys
 * session PER connection, so every account may show a live status
 * concurrently. `is_active` is a routing preference (the default inbox
 * account), not a "one live session" guard.
 */
export function AccountCard({
  account,
  isActive,
  onViewDetails,
  onEdit,
  onAssignTeam,
  onConnect,
  onDisconnect,
  onSetActive,
  onDelete,
  updatePending,
  actionPending,
}: {
  account: WhatsappAccount;
  isActive: boolean;
  onViewDetails: (account: WhatsappAccount) => void;
  onEdit: (account: WhatsappAccount) => void;
  onAssignTeam: (id: number, teamId: number | null) => void;
  onConnect: (account: WhatsappAccount) => void;
  onDisconnect: (account: WhatsappAccount) => void;
  onSetActive: (account: WhatsappAccount) => void;
  onDelete: (account: WhatsappAccount) => void;
  updatePending: boolean;
  actionPending: boolean;
}) {
  const teams = useTeams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [teamEditing, setTeamEditing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  // Every account runs its own session, so status is always available.
  const status = account.status;
  const isConnected = account.status === "connected";

  return (
    <article
      className={cn(
        "rounded-2xl border bg-surface p-4 transition-colors",
        isActive ? "border-primary/40" : "border-border hover:border-border/80 hover:bg-bg/40",
      )}
      aria-label={`WhatsApp account ${account.name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Phone className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold text-text">{account.name}</h3>
              {account.is_active && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  Active
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">{account.phone_number ?? "Not connected"}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <AccountStatusBadge status={status} />
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={`Actions for ${account.name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label={`Actions for ${account.name}`}
                className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
                  onClick={() => {
                    setMenuOpen(false);
                    onViewDetails(account);
                  }}
                >
                  <Eye className="h-4 w-4 text-muted" aria-hidden="true" />
                  View Details
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit(account);
                  }}
                >
                  <Pencil className="h-4 w-4 text-muted" aria-hidden="true" />
                  Edit
                </button>
                {isConnected ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
                    onClick={() => {
                      setMenuOpen(false);
                      onConnect(account);
                    }}
                  >
                    <QrCode className="h-4 w-4 text-muted" aria-hidden="true" />
                    Reconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
                    onClick={() => {
                      setMenuOpen(false);
                      onConnect(account);
                    }}
                  >
                    <PlayCircle className="h-4 w-4 text-muted" aria-hidden="true" />
                    Connect / Generate QR
                  </button>
                )}
                {!account.is_active && (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
                    onClick={() => {
                      setMenuOpen(false);
                      onSetActive(account);
                    }}
                  >
                    <Power className="h-4 w-4 text-muted" aria-hidden="true" />
                    Set Active
                  </button>
                )}
                {account.is_active && (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
                    onClick={() => {
                      setMenuOpen(false);
                      onDisconnect(account);
                    }}
                  >
                    <StopCircle className="h-4 w-4 text-muted" aria-hidden="true" />
                    Disconnect
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
                  onClick={() => {
                    setMenuOpen(false);
                    setTeamEditing((editing) => !editing);
                  }}
                >
                  <UserCog className="h-4 w-4 text-muted" aria-hidden="true" />
                  Assign Team
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-bg"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(account);
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-medium text-muted">Assigned Team</dt>
          <dd className="mt-0.5 font-medium text-text">{account.assigned_team?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Auto Reply</dt>
          <dd className="mt-0.5 font-medium text-text">{account.auto_reply_enabled ? "Enabled" : "Disabled"}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Last Activity</dt>
          <dd className="mt-0.5 font-medium text-text">{relativeTime(account.last_connected_at)}</dd>
        </div>
      </dl>

      {/* Connect CTA for slots that are not connected (only the active slot
          can hold a live session). */}
      {!isConnected && (
        <div className="mt-3 border-t border-border pt-3">
          <button
            type="button"
            className={cn(secondary, "w-full sm:w-auto")}
            disabled={actionPending}
            onClick={() => onConnect(account)}
          >
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            Connect WhatsApp
          </button>
        </div>
      )}

      {teamEditing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <label htmlFor={`team-select-${account.id}`} className="sr-only">
            Assign team
          </label>
          <select
            id={`team-select-${account.id}`}
            className={cn(input, "max-w-48 flex-1")}
            value={account.assigned_team_id ?? ""}
            onChange={(event) =>
              onAssignTeam(account.id, event.target.value ? Number(event.target.value) : null)
            }
          >
            <option value="">No assigned team</option>
            {(teams.data ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={secondary}
            disabled={updatePending}
            onClick={() => setTeamEditing(false)}
          >
            Done
          </button>
        </div>
      )}
    </article>
  );
}
