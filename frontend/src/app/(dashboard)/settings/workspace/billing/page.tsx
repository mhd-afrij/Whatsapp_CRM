"use client";

import { CreditCard } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { SettingsCard } from "@/components/settings/settings-card";
import { WorkspaceSettingsGate } from "@/components/settings/workspace-settings-gate";

export default function WorkspaceBillingPage() {
  return (
    <RequirePermission permission="workspace.settings.manage">
      <WorkspaceSettingsGate>
        {(workspace) => (
          <SettingsCard
            title="Billing & Subscription"
            description="Current plan, upgrades, payment methods, usage limits, and invoice history."
          >
            <div className="rounded-lg border border-dashed border-border bg-bg p-5 text-sm text-muted">
              <CreditCard className="mb-3 h-5 w-5" />
              {workspace.billing?.message ?? "Billing is not configured for this workspace."}
            </div>
          </SettingsCard>
        )}
      </WorkspaceSettingsGate>
    </RequirePermission>
  );
}