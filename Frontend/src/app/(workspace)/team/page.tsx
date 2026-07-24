"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { authFetch, useAuthStore } from "@/stores/auth-store";
import type { RoleWithPermissions, TeamMember } from "@/types/admin";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function inviteMember(
  payload: { name: string; email: string; role: string },
  accessToken: string | null
): Promise<{ data: TeamMember; temporary_password: string }> {
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.message ?? "Failed to invite team member");
  }
  return json;
}

const STATUS_TONE = {
  active: "success",
  invited: "info",
  suspended: "danger",
  archived: "neutral",
} as const;

export default function TeamPage() {
  const queryClient = useQueryClient();
  const canInvite = useAuthStore((s) => s.hasPermission("users.invite"));
  const canSuspend = useAuthStore((s) => s.hasPermission("users.suspend"));
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["team-members"],
    queryFn: () => authFetch<TeamMember[]>("/users"),
  });

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: () => authFetch<RoleWithPermissions[]>("/roles"),
    enabled: showInvite || editing !== null,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["team-members"] });

  const inviteMutation = useMutation({
    mutationFn: (payload: { name: string; email: string; role: string }) =>
      inviteMember(payload, useAuthStore.getState().accessToken),
    onSuccess: (result) => {
      invalidate();
      setShowInvite(false);
      setTemporaryPassword(result.temporary_password);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: number; name?: string; role?: string }) =>
      authFetch<TeamMember>(`/users/${id}`, { method: "PATCH", body: payload }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "active" | "suspended" }) =>
      authFetch<TeamMember>(`/users/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: () => invalidate(),
  });

  return (
    <div>
      <PageHeader
        title="Team"
        description="Members of this workspace and their assigned roles."
        actions={
          canInvite && (
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"
            >
              <UserPlus size={15} /> Invite member
            </button>
          )
        }
      />

      {temporaryPassword && (
        <div className="mb-4 rounded-[10px] border border-primary/30 bg-primary-soft px-4 py-3 text-sm flex items-center justify-between">
          <span>
            Temporary password: <code className="font-mono">{temporaryPassword}</code> — share this with the new
            teammate securely.
          </span>
          <button onClick={() => setTemporaryPassword(null)} className="text-text-muted hover:text-text-primary">
            <X size={14} />
          </button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-[10px] bg-surface border border-border-muted animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          icon={Users}
          title="Couldn't load team members"
          description="You may not have the users.view permission, or the API is unreachable."
        />
      )}

      {data && data.length === 0 && (
        <EmptyState icon={Users} title="No team members yet" description="Invite your first teammate to get started." />
      )}

      {data && data.length > 0 && (
        <div className="rounded-[10px] border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Member</th>
                <th className="text-left font-medium px-4 py-3">Role</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Last login</th>
                <th className="text-right font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {data.map((member) => (
                <tr key={member.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-primary">
                        {member.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">{member.name}</p>
                        <p className="text-xs text-text-muted">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {member.roles.map((r) => r.name).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={member.status}
                      tone={STATUS_TONE[member.status as keyof typeof STATUS_TONE] ?? "neutral"}
                    />
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {member.last_login_at ? new Date(member.last_login_at).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {canInvite && (
                        <button
                          onClick={() => setEditing(member)}
                          className="text-xs text-text-secondary hover:text-text-primary"
                        >
                          Edit
                        </button>
                      )}
                      {canSuspend && (
                        <button
                          onClick={() =>
                            statusMutation.mutate({
                              id: member.id,
                              status: member.status === "suspended" ? "active" : "suspended",
                            })
                          }
                          className="text-xs text-text-secondary hover:text-text-primary"
                        >
                          {member.status === "suspended" ? "Restore" : "Suspend"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && (
        <Modal title="Invite team member" onClose={() => setShowInvite(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              inviteMutation.mutate({
                name: String(form.get("name") ?? ""),
                email: String(form.get("email") ?? ""),
                role: String(form.get("role") ?? ""),
              });
            }}
            className="space-y-3"
          >
            <Field label="Name" name="name" required />
            <Field label="Email" name="email" type="email" required />
            <RoleField roles={rolesQuery.data} />
            {inviteMutation.isError && (
              <p className="text-xs text-danger">Couldn't invite this teammate. Check the fields and try again.</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowInvite(false)} className="px-3 py-2 text-sm text-text-secondary">
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"
              >
                Send invite
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit team member" onClose={() => setEditing(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              updateMutation.mutate({
                id: editing.id,
                name: String(form.get("name") ?? ""),
                role: String(form.get("role") ?? ""),
              });
            }}
            className="space-y-3"
          >
            <Field label="Name" name="name" defaultValue={editing.name} required />
            <RoleField roles={rolesQuery.data} defaultValue={editing.roles[0]?.slug} />
            {updateMutation.isError && (
              <p className="text-xs text-danger">Couldn't save this change. Try again.</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="px-3 py-2 text-sm text-text-secondary">
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"
              >
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-[10px] border border-border bg-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-text-secondary">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}

function RoleField({ roles, defaultValue }: { roles?: RoleWithPermissions[]; defaultValue?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-text-secondary">Role</label>
      <select
        name="role"
        defaultValue={defaultValue}
        required
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      >
        <option value="" disabled>
          Select a role
        </option>
        {roles?.map((role) => (
          <option key={role.id} value={role.slug}>
            {role.name}
          </option>
        ))}
      </select>
    </div>
  );
}
