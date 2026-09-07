"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Users,
  UserCheck,
  ShieldCheck,
  MailPlus,
  Search,
  Plus,
  MoreVertical,
  Phone,
  Pencil,
  UserCog,
  UserX,
  UserCheck2,
  RefreshCw,
  Mail,
  X,
  Eye,
  Calendar,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { useAuth } from "@/context/auth-context";
import {
  useAdminUsers,
  useInviteUser,
  useReactivateUser,
  useResendInvitation,
  useRoles,
  useSuspendUser,
  useTeams,
  useUpdateAdminUser,
} from "@/hooks/use-admin";
import { ApiError } from "@/lib/api-client";
import type { AdminUser } from "@/lib/admin-api";
import { ErrorState } from "@/components/ui/error-state";

function isSuperAdminRole(role: { name: string; slug: string }) {
  return role.slug === "super_admin" || role.slug === "super-administrator" || role.name === "Super Administrator";
}

function isAdminUser(user: AdminUser) {
  return (user.role_keys?.includes("super_admin") ?? false) || (user.role_keys?.includes("admin") ?? false)
    || user.roles.some((r) => r.slug === "super_admin" || r.slug === "admin" || r.name.toLowerCase().includes("admin"));
}

// ── Small UI atoms ──────────────────────────────────────────────

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initial = name.trim().charAt(0).toUpperCase() || "U";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-muted font-semibold text-accent-text",
        size === "md" ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs"
      )}
    >
      {initial}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        active ? "bg-success/10 text-success" : "bg-bg text-muted"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-success" : "bg-muted")} />
      {active ? "Active" : "Suspended"}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = "text-primary",
  iconBg = "bg-primary-soft text-primary",
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  accent?: string;
  iconBg?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconBg)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className={cn("text-2xl font-bold tracking-tight", accent)}>{value}</p>
        <p className="text-xs font-medium text-muted">{label}</p>
      </div>
    </div>
  );
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Invite (Add User) modal ─────────────────────────────────────

function InviteUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: roles } = useRoles();
  const { user } = useAuth();
  const isSuperAdmin = user?.role_keys?.includes("super_admin") ?? false;
  const assignableRoles = roles?.filter((role) => isSuperAdmin || !isSuperAdminRole(role)) ?? [];
  const inviteMutation = useInviteUser();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setRoleId("");
      setError(null);
      setSuccess(null);
    }
  }, [open]);

  const onInvite = async () => {
    setError(null);
    setSuccess(null);
    if (!email.trim() || !roleId) return;
    try {
      await inviteMutation.mutateAsync({ email: email.trim(), role_id: Number(roleId) });
      setSuccess(`Invitation sent to ${email.trim()}.`);
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to send invitation.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite User">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted">Email address</label>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
            <Mail className="h-4 w-4 shrink-0 text-muted" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">Role</label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : "")}
            className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="">Select role…</option>
            {assignableRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {success && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{success}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text shadow-sm transition-colors hover:bg-bg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onInvite}
            disabled={inviteMutation.isPending || !email.trim() || !roleId}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-muted px-4 py-2.5 text-sm font-semibold text-accent-text shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:hover:translate-y-0"
          >
            <MailPlus className="h-4 w-4" />
            {inviteMutation.isPending ? "Sending…" : "Send Invitation"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Edit User modal ─────────────────────────────────────────────

function EditUserModal({
  user,
  open,
  onClose,
}: {
  user: AdminUser | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: roles } = useRoles();
  const { data: teams } = useTeams();
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role_keys?.includes("super_admin") ?? false;
  const assignableRoles = roles?.filter((role) => isSuperAdmin || !isSuperAdminRole(role)) ?? [];
  const updateMutation = useUpdateAdminUser();
  const suspendMutation = useSuspendUser();
  const reactivateMutation = useReactivateUser();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      setName(user.name);
      setEmail(user.email);
      setRoleId(user.roles[0]?.id ?? "");
      setTeamIds(user.teams.map((t) => t.id));
      setActive(user.is_active);
      setError(null);
    }
  }, [open, user]);

  if (!user) return null;

  const isSelf = String(currentUser?.id) === String(user.id);
  const canToggleActive = !isSelf;

  const toggleTeam = (id: number) => {
    setTeamIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const onSave = async () => {
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id: user.id,
        values: { name: name.trim(), email: email.trim(), role_id: roleId ? Number(roleId) : undefined, team_ids: teamIds },
      });
      if (canToggleActive && active !== user.is_active) {
        if (active) await reactivateMutation.mutateAsync(user.id);
        else await suspendMutation.mutateAsync(user.id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update user.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Edit ${user.name}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted">Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted">Role</label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : "")}
            className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {assignableRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>

        {teams && teams.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-muted">Teams</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => toggleTeam(team.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    teamIds.includes(team.id)
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface text-muted hover:bg-bg"
                  )}
                >
                  {team.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {canToggleActive && (
          <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text">Account status</p>
              <p className="text-xs text-muted">{active ? "User has full access" : "User is temporarily suspended"}</p>
            </div>
            <button
              type="button"
              onClick={() => setActive((v) => !v)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                active ? "bg-success" : "bg-muted/60"
              )}
              role="switch"
              aria-checked={active}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                  active ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
          </div>
        )}

        {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text shadow-sm transition-colors hover:bg-bg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={updateMutation.isPending || !name.trim() || !email.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-muted px-4 py-2.5 text-sm font-semibold text-accent-text shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:hover:translate-y-0"
          >
            <UserCheck className="h-4 w-4" />
            {updateMutation.isPending ? "Saving…" : "Save User"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── User table row ──────────────────────────────────────────────

function UserRow({
  user,
  onEdit,
  onView,
  canManage,
}: {
  user: AdminUser;
  onEdit: (u: AdminUser) => void;
  onView: (u: AdminUser) => void;
  canManage: boolean;
}) {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role_keys?.includes("super_admin") ?? false;
  const isProtectedSuperAdmin = (user.role_keys?.includes("super_admin") ?? false) && !isSuperAdmin;
  const isSelf = String(currentUser?.id) === String(user.id);
  const canEditUser = canManage && !isProtectedSuperAdmin;
  const canToggleActive = canEditUser && !isSelf;

  const suspendMutation = useSuspendUser();
  const reactivateMutation = useReactivateUser();
  const resendMutation = useResendInvitation();
  const [menuOpen, setMenuOpen] = useState(false);

  const onToggleActive = async () => {
    if (user.is_active && !window.confirm(`Suspend ${user.name}? They will immediately lose access.`)) return;
    try {
      if (user.is_active) await suspendMutation.mutateAsync(user.id);
      else await reactivateMutation.mutateAsync(user.id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Unable to update status.");
    }
    setMenuOpen(false);
  };

  return (
    <tr className="group border-b border-border transition-colors last:border-0 hover:bg-bg/40">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text">{user.name}</p>
            {isSelf && <p className="text-[11px] text-muted">You</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted">{user.email}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft/70 px-2.5 py-0.5 text-xs font-medium text-primary">
          <ShieldCheck className="h-3 w-3" />
          {user.roles.map((r) => r.name).join(", ") || "—"}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-muted">
        {user.teams.length > 0 ? user.teams.map((t) => t.name).join(", ") : "—"}
      </td>
      <td className="px-4 py-3 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-muted/60" /> —
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge active={user.is_active} />
      </td>
      <td className="px-4 py-3 text-xs text-muted">
        {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : "Never"}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={`Actions for ${user.name}`}
            className="rounded-md p-1.5 text-muted opacity-60 transition-opacity hover:bg-bg hover:text-text group-hover:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
              <button
                type="button"
                onClick={() => { onView(user); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text hover:bg-bg"
              >
                <Eye className="h-3.5 w-3.5 text-muted" /> View Profile
              </button>
              {canEditUser && (
                <button
                  type="button"
                  onClick={() => { onEdit(user); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text hover:bg-bg"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted" /> Edit User
                </button>
              )}
              {canEditUser && (
                <button
                  type="button"
                  onClick={() => { onEdit(user); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text hover:bg-bg"
                >
                  <UserCog className="h-3.5 w-3.5 text-muted" /> Change Role
                </button>
              )}
              {canToggleActive && (
                <button
                  type="button"
                  onClick={onToggleActive}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-bg",
                    user.is_active ? "text-danger" : "text-success"
                  )}
                >
                  {user.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck2 className="h-3.5 w-3.5" />}
                  {user.is_active ? "Deactivate User" : "Reactivate User"}
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => { resendMutation.mutate(user.id); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text hover:bg-bg"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-muted" /> Resend Invitation
                </button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main content ────────────────────────────────────────────────

function UserManagementContent() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [teamFilter, setTeamFilter] = useState<number | "">("");
  const [lastLoginFilter, setLastLoginFilter] = useState<"all" | "today" | "week" | "month" | "never">("all");
  const [page, setPage] = useState(1);
  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [viewingUser, setViewingUser] = useState<AdminUser | null>(null);

  const { data: roles } = useRoles();
  const { data: teams } = useTeams();
  const canManage = usePermission("users.manage");

  const { data, isLoading, isError, refetch } = useAdminUsers({
    search: search || undefined,
    role_id: roleFilter ? Number(roleFilter) : undefined,
    is_active: statusFilter === "all" ? undefined : statusFilter === "active",
    page,
    per_page: 20,
  });

  const filtered = useMemo(() => {
    const rows = data?.data ?? [];
    let out = rows;
    if (teamFilter) {
      out = out.filter((u) => u.teams.some((t) => t.id === Number(teamFilter)));
    }
    if (lastLoginFilter !== "all") {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      out = out.filter((u) => {
        if (!u.last_login_at) return lastLoginFilter === "never";
        const diff = now - new Date(u.last_login_at).getTime();
        if (lastLoginFilter === "today") return diff < day;
        if (lastLoginFilter === "week") return diff < 7 * day;
        if (lastLoginFilter === "month") return diff < 30 * day;
        return false;
      });
    }
    return out;
  }, [data, teamFilter, lastLoginFilter]);

  const stats = useMemo(() => {
    const rows = data?.data ?? [];
    return {
      total: data?.meta.total ?? 0,
      active: rows.filter((u) => u.is_active).length,
      admins: rows.filter(isAdminUser).length,
    };
  }, [data]);

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">User Management</h1>
          <p className="mt-1 text-sm text-muted">
            Manage users, teams, access levels, and account status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-gradient-to-r from-accent to-accent-muted px-4 py-2.5 text-sm font-semibold text-accent-text shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg sm:self-auto"
        >
          <Plus className="h-4 w-4" /> Add User
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total Users" value={stats.total} iconBg="bg-primary-soft text-primary" accent="text-text" />
        <StatCard icon={UserCheck2} label="Active Users" value={stats.active} iconBg="bg-success/10 text-success" accent="text-success" />
        <StatCard icon={ShieldCheck} label="Administrators" value={stats.admins} iconBg="bg-warning/10 text-warning" accent="text-warning" />
        <StatCard icon={MailPlus} label="Pending Invitations" value="—" iconBg="bg-warning/10 text-warning" accent="text-muted" />
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {/* Filters */}
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              placeholder="Search users…"
              className="w-full rounded-xl border border-border bg-bg/40 py-2.5 pl-9 pr-3 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value ? Number(e.target.value) : ""); resetPage(); }}
              className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-accent focus:outline-none"
            >
              <option value="">All roles</option>
              {(roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <select
              value={teamFilter}
              onChange={(e) => { setTeamFilter(e.target.value ? Number(e.target.value) : ""); resetPage(); }}
              className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-accent focus:outline-none"
            >
              <option value="">All teams</option>
              {(teams ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); resetPage(); }}
              className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-accent focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              value={lastLoginFilter}
              onChange={(e) => { setLastLoginFilter(e.target.value as typeof lastLoginFilter); resetPage(); }}
              className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-accent focus:outline-none"
            >
              <option value="all">Any last login</option>
              <option value="today">Last 24 hours</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="never">Never logged in</option>
            </select>
          </div>
        </div>

        {isLoading && <p className="p-6 text-sm text-muted">Loading…</p>}
        {isError && <div className="p-6"><ErrorState message="Unable to load users." onRetry={() => refetch()} /></div>}

        {!isLoading && !isError && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-bg/40 text-[11px] uppercase tracking-wider text-muted">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Team</th>
                    <th className="px-4 py-3 font-semibold">WhatsApp Number</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Last Login</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      canManage={canManage}
                      onEdit={(u) => setEditingUser(u)}
                      onView={(u) => setViewingUser(u)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {!isLoading && !isError && filtered.length === 0 && (
              <p className="py-10 text-center text-sm text-muted">No users match your filters.</p>
            )}
            {data && data.meta.last_page > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-50 hover:bg-bg"
                >
                  Previous
                </button>
                <span>Page {data.meta.current_page} of {data.meta.last_page}</span>
                <button
                  type="button"
                  disabled={page >= data.meta.last_page}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-50 hover:bg-bg"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* View profile modal */}
      <Modal open={!!viewingUser} onClose={() => setViewingUser(null)} title="User Profile">
        {viewingUser && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar name={viewingUser.name} size="md" />
              <div>
                <p className="text-base font-semibold text-text">{viewingUser.name}</p>
                <p className="text-sm text-muted">{viewingUser.email}</p>
              </div>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-border/60 pb-2">
                <dt className="flex items-center gap-2 text-muted"><ShieldCheck className="h-4 w-4" /> Role</dt>
                <dd className="font-medium text-text">{viewingUser.roles.map((r) => r.name).join(", ") || "—"}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 pb-2">
                <dt className="flex items-center gap-2 text-muted"><Users className="h-4 w-4" /> Teams</dt>
                <dd className="font-medium text-text">{viewingUser.teams.length ? viewingUser.teams.map((t) => t.name).join(", ") : "—"}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 pb-2">
                <dt className="flex items-center gap-2 text-muted"><Calendar className="h-4 w-4" /> Member since</dt>
                <dd className="font-medium text-text">{new Date(viewingUser.created_at).toLocaleDateString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="flex items-center gap-2 text-muted"><Clock className="h-4 w-4" /> Last login</dt>
                <dd className="font-medium text-text">{viewingUser.last_login_at ? new Date(viewingUser.last_login_at).toLocaleString() : "Never"}</dd>
              </div>
            </dl>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setViewingUser(null)}
                className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text shadow-sm transition-colors hover:bg-bg"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      <InviteUserModal open={showInvite} onClose={() => setShowInvite(false)} />
      <EditUserModal user={editingUser} open={!!editingUser} onClose={() => setEditingUser(null)} />
    </div>
  );
}

export default function UserManagementPage() {
  return (
    <RequirePermission permission="users.manage">
      <UserManagementContent />
    </RequirePermission>
  );
}
