"use client";

import { useMemo, useState } from "react";
import { RefreshCw, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { ErrorState } from "@/components/ui/error-state";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsCard } from "@/components/settings/settings-card";
import { danger, input, primary, secondary } from "@/components/settings/styles";
import { ApiError } from "@/lib/api-client";
import { useAdminUsers, useInvitations, useInviteUser, useReactivateUser, useRemoveWorkspaceUser, useRoles, useSuspendUser, useUpdateAdminUser } from "@/hooks/use-admin";

function statusFor(isActive: boolean) {
  return isActive ? "ACTIVE" : "SUSPENDED";
}

function UsersPageContent() {
  const users = useAdminUsers({ page: 1, per_page: 100 });
  const roles = useRoles();
  const invitations = useInvitations();
  const invite = useInviteUser();
  const updateUser = useUpdateAdminUser();
  const suspend = useSuspendUser();
  const reactivate = useReactivateUser();
  const removeUser = useRemoveWorkspaceUser();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [message, setMessage] = useState<string | null>(null);

  const activeUsers = useMemo(() => users.data?.data ?? [], [users.data?.data]);
  const summary = useMemo(() => ({
    total: activeUsers.length,
    active: activeUsers.filter((u) => u.is_active).length,
    suspended: activeUsers.filter((u) => !u.is_active).length,
  }), [activeUsers]);

  const pendingInviteCount = invitations.data?.filter((row) => row.status === "pending").length ?? 0;

  const onInvite = async () => {
    if (!email || !roleId) return;
    setMessage(null);
    try {
      await invite.mutateAsync({ email, role_id: Number(roleId), send_email: true });
      setEmail("");
      setRoleId("");
      setMessage("Invitation sent.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Unable to send invitation.");
    }
  };

  const onRoleChange = async (userId: number, nextRoleId: number) => {
    setMessage(null);
    try {
      await updateUser.mutateAsync({ id: userId, values: { role_id: nextRoleId } });
      setMessage("User role updated.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Unable to update role.");
    }
  };

  const onRemove = async (userId: number, name: string) => {
    if (!window.confirm(`Remove ${name} from this workspace? They will lose access here but historical activity remains.`)) return;
    setMessage(null);
    try {
      await removeUser.mutateAsync(userId);
      setMessage("User removed from workspace.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Unable to remove user.");
    }
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 p-2 sm:p-4">
      <div className="space-y-4">
        <SettingsBreadcrumb
          items={[
            { label: "Settings", href: "/settings" },
            { label: "System", href: "/settings" },
            { label: "Users & Permissions" },
          ]}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Users &amp; Permissions</h1>
            <p className="mt-1 text-sm text-muted">Manage workspace members, roles, access and account status.</p>
          </div>
          <button className={primary} type="button" onClick={onInvite} disabled={!email || !roleId || invite.isPending}>
            <UserPlus className="h-4 w-4" /> Invite User
          </button>
        </div>
      </div>

      <SettingsCard>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Total Users", summary.total],
            ["Active", summary.active],
            ["Pending Invites", pendingInviteCount],
            ["Suspended", summary.suspended],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-bg p-4">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-text">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input className={input} placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className={input} value={roleId} onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Select role</option>
            {roles.data?.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
          <button className={secondary} type="button" onClick={() => { users.refetch(); roles.refetch(); invitations.refetch(); }}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-muted">{message}</p>}
      </SettingsCard>

      {users.isLoading && <SettingsCard><div className="h-32 animate-pulse rounded-lg bg-bg" /></SettingsCard>}
      {users.isError && <ErrorState message="Unable to load users." onRetry={() => users.refetch()} />}

      {!users.isLoading && !users.isError && (
        <SettingsCard>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr><th className="py-3">User</th><th>Email</th><th>Role</th><th>Status</th><th>Last Active</th><th>Joined</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {activeUsers.map((user) => (
                  <tr key={user.id} className="border-b border-border/70">
                    <td className="py-3 font-medium text-text">{user.name}</td>
                    <td className="text-muted">{user.email}</td>
                    <td>
                      <select className={input} value={user.roles[0]?.id ?? ""} onChange={(e) => onRoleChange(user.id, Number(e.target.value))}>
                        {roles.data?.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                      </select>
                    </td>
                    <td><span className="rounded-full border border-border px-2 py-1 text-xs text-muted">{statusFor(user.is_active)}</span></td>
                    <td className="text-muted">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}</td>
                    <td className="text-muted">{new Date(user.created_at).toLocaleDateString()}</td>
                    <td className="flex flex-wrap gap-2 py-3">
                      {user.is_active ? <button className={secondary} onClick={() => suspend.mutate(user.id)}>Suspend</button> : <button className={secondary} onClick={() => reactivate.mutate(user.id)}>Reactivate</button>}
                      <button className={danger} onClick={() => onRemove(user.id, user.name)}><UserMinus className="h-4 w-4" />Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">
            {activeUsers.map((user) => (
              <div key={user.id} className="rounded-lg border border-border bg-bg p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-medium text-text">{user.name}</p><p className="text-xs text-muted">{user.email}</p></div><span className="text-xs text-muted">{statusFor(user.is_active)}</span></div>
                <p className="mt-3 text-xs text-muted"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />{user.roles.map((r) => r.name).join(", ") || "No role"}</p>
              </div>
            ))}
          </div>
        </SettingsCard>
      )}
    </div>
  );
}

export default function WorkspaceUsersPage() {
  return <RequirePermission permission="users.view"><UsersPageContent /></RequirePermission>;
}
