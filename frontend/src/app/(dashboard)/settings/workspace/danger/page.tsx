"use client";

import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { RequirePermission } from "@/components/auth/require-permission";
import { DangerCard } from "@/components/settings/danger-card";
import { SettingsCard } from "@/components/settings/settings-card";
import { WorkspaceSettingsGate } from "@/components/settings/workspace-settings-gate";
import { danger, input, secondary } from "@/components/settings/styles";
import { useAdminUsers } from "@/hooks/use-admin";
import {
  useDisableWorkspace,
  useTransferWorkspaceOwnership,
} from "@/hooks/use-workspace-settings";
import { cn } from "@/lib/utils";

export default function WorkspaceDangerPage() {
  const users = useAdminUsers({ page: 1, per_page: 100 });
  const transfer = useTransferWorkspaceOwnership();
  const disable = useDisableWorkspace();
  const [userId, setUserId] = useState<number | "">("");
  const [confirmation, setConfirmation] = useState("");

  return (
    <RequirePermission permission="workspace.settings.manage">
      <WorkspaceSettingsGate>
        {(workspace) => (
          <SettingsCard
            title="Danger Zone"
            description="Transfer ownership or soft-disable this workspace. There is no delete endpoint by design; disabled workspaces can be re-enabled from the database."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-bg p-4">
                <h3 className="font-semibold text-text">Transfer Ownership</h3>
                <select
                  className={cn(input, "mt-3")}
                  value={userId}
                  onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Select member</option>
                  {users.data?.data.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} - {user.email}
                    </option>
                  ))}
                </select>
                <button
                  className={cn(secondary, "mt-3")}
                  type="button"
                  disabled={!userId || transfer.isPending}
                  onClick={() => transfer.mutate(Number(userId))}
                >
                  Transfer Ownership
                </button>
              </div>

              <DangerCard title="Disable Workspace">
                <p className="mt-1 text-xs text-muted">Type {workspace.slug} to disable access.</p>
                <input
                  className={cn(input, "mt-3")}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
                <button
                  className={cn(danger, "mt-3")}
                  type="button"
                  disabled={confirmation !== workspace.slug || disable.isPending}
                  onClick={() => disable.mutate(confirmation)}
                >
                  <ShieldAlert className="h-4 w-4" />
                  Disable Workspace
                </button>
              </DangerCard>
            </div>
          </SettingsCard>
        )}
      </WorkspaceSettingsGate>
    </RequirePermission>
  );
}