"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { RequirePermission } from "@/components/auth/require-permission";
import { SettingsCard } from "@/components/settings/settings-card";
import { input, primary } from "@/components/settings/styles";
import { useAdminUsers, useInviteUser, useRoles } from "@/hooks/use-admin";

export default function WorkspaceTeamPage() {
  const users = useAdminUsers({ page: 1, per_page: 100 });
  const roles = useRoles();
  const invite = useInviteUser();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");

  return (
    <RequirePermission permission="users.manage">
      <SettingsCard
        title="Team Management"
        description="Members, invite member, pending invitations, removal, and member activity."
      >
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input
            className={input}
            placeholder="member@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            className={input}
            value={roleId}
            onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select role</option>
            {roles.data?.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <button
            className={primary}
            type="button"
            disabled={!email || !roleId || invite.isPending}
            onClick={() =>
              invite.mutate(
                { email, role_id: Number(roleId) },
                { onSuccess: () => setEmail("") }
              )
            }
          >
            <Plus className="h-4 w-4" />
            Invite Member
          </button>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2">Member</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Activity</th>
              </tr>
            </thead>
            <tbody>
              {users.data?.data.map((user) => (
                <tr key={user.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <p className="font-medium text-text">{user.name}</p>
                    <p className="text-xs text-muted">{user.email}</p>
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {user.roles.map((r) => r.name).join(", ") || "-"}
                  </td>
                  <td className="px-3 py-2">{user.is_active ? "Active" : "Suspended"}</td>
                  <td className="px-3 py-2 text-muted">
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>
    </RequirePermission>
  );
}