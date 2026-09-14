"use client";

import { RequirePermission } from "@/components/auth/require-permission";
import { JsonSettingsPanel } from "@/components/settings/json-settings-panel";
import { WorkspaceSettingsGate } from "@/components/settings/workspace-settings-gate";

export default function WorkspaceIntegrationsPage() {
  return (
    <RequirePermission permission="workspace.settings.manage">
      <WorkspaceSettingsGate>
        {(workspace) => (
          <JsonSettingsPanel
            field="integration_settings"
            title="Integrations"
            description="API keys, webhooks, CRM/payment integration notes, and third party app settings."
            value={workspace.integration_settings}
          />
        )}
      </WorkspaceSettingsGate>
    </RequirePermission>
  );
}