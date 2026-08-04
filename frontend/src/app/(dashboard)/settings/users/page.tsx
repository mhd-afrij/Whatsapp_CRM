"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import {
  useAdminUsers,
  useInviteUser,
  useReactivateUser,
  useResendInvitation,
  useRoles,
  useSuspendUser,
  useUpdateAdminUser,
} from "@/hooks/use-admin";
import { ApiError } from "@/lib/api-client";
import type { AdminUser } from "@/lib/admin-api";
import { ErrorState } from "@/components/ui/error-state";

function InviteUserForm() {
  const { data: roles } = useRoles();
  const inviteMutation = useInviteUser();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onInvite = async () => {
    setError(null);
    setSuccess(null);
    if (!email.trim() || !roleId) return;
    try {
      await inviteMutation.mutateAsync({ email: email.trim(), role_id: Number(roleId) });
      setSuccess(`Invitation sent to ${email.trim()}.`);
      setEmail("");
      setRoleId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to send invitation.");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text">Invite a user</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
        />
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : "")}
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
        >
          <option value="">Select role…</option>
          {roles?.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onInvite}
          disabled={inviteMutation.isPending || !email.trim() || !roleId}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          Send invitation
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {success && <p className="mt-2 text-sm text-success">{success}</p>}
    </div>
  );
}

function EditUserRow({ user }: { user: AdminUser }) {
  const { data: roles } = useRoles();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [roleId, setRoleId] = useState<number | "">(user.roles[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useUpdateAdminUser();
  const suspendMutation = useSuspendUser();
  const reactivateMutation = useReactivateUser();
  const resendMutation = useResendInvitation();
  const canManage = usePermission("users.manage");

  const onSave = async () => {
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id: user.id,
        values: { name: name.trim(), role_id: roleId ? Number(roleId) : undefined },
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update user.");
    }
  };

  const onToggleActive = async () => {
    if (user.is_active && !window.confirm(`Suspend ${user.name}? They will immediately lose access.`)) {
      return;
    }
    setError(null);
    try {
      if (user.is_active) {
        await suspendMutation.mutateAsync(user.id);
      } else {
        await reactivateMutation.mutateAsync(user.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update status.");
    }
  };

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          />
        ) : (
          <span className="text-sm font-medium text-text">{user.name}</span>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-muted">{user.email}</td>
      <td className="px-3 py-2">
        {editing ? (
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          >
            {roles?.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-text">{user.roles.map((r) => r.name).join(", ") || "—"}</span>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-muted">
        {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}
      </td>
      <td className="px-3 py-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            user.is_active ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
          }`}
        >
          {user.is_active ? "Active" : "Suspended"}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {canManage && editing && (
            <>
              <button
                type="button"
                onClick={onSave}
                disabled={updateMutation.isPending}
                className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
              >
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:text-text">
                Cancel
              </button>
            </>
          )}
          {canManage && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-border px-2 py-1 text-xs text-text hover:bg-primary-soft"
            >
              Edit
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={onToggleActive}
              disabled={suspendMutation.isPending || reactivateMutation.isPending}
              className={cn(
                "rounded-md border px-2 py-1 text-xs disabled:opacity-50",
                user.is_active
                  ? "border-danger text-danger hover:bg-danger/10"
                  : "border-border text-text hover:bg-primary-soft"
              )}
            >
              {user.is_active ? "Suspend" : "Reactivate"}
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={() => resendMutation.mutate(user.id)}
              disabled={resendMutation.isPending}
              className="rounded-md border border-border px-2 py-1 text-xs text-text hover:bg-primary-soft disabled:opacity-50"
              title="Resend invitation (only applies if this user has a pending invitation)"
            >
              Resend invite
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </td>
    </tr>
  );
}

function UserManagementContent() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useAdminUsers({ search: search || undefined, page, per_page: 20 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">User Management</h1>
        <p className="mt-1 text-sm text-muted">
          Invite new users, assign roles, and suspend/reactivate accounts. Every action here is
          re-checked server-side against the <code className="rounded bg-primary-soft px-1 py-0.5 text-xs">users.manage</code>{" "}
          / <code className="rounded bg-primary-soft px-1 py-0.5 text-xs">invitations.manage</code> permissions.
        </p>
      </div>

      <InviteUserForm />

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text">Workspace users</h2>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or email…"
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text placeholder:text-muted"
          />
        </div>

        {isLoading && <p className="text-sm text-muted">Loading…</p>}
        {isError && (
          <ErrorState message="Unable to load users." onRetry={() => refetch()} />
        )}

        {!isLoading && !isError && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Last login</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.data.map((user) => (
                    <EditUserRow key={user.id} user={user} />
                  ))}
                </tbody>
              </table>
            </div>
            {data && data.data.length === 0 && (
              <p className="py-4 text-sm text-muted">No users match your search.</p>
            )}
            {data && data.meta.last_page > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm text-muted">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
                >
                  Previous
                </button>
                <span>
                  Page {data.meta.current_page} of {data.meta.last_page}
                </span>
                <button
                  type="button"
                  disabled={page >= data.meta.last_page}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
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
