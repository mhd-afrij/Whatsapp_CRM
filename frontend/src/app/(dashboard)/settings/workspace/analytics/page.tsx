"use client";

import { Database } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { RequirePermission } from "@/components/auth/require-permission";
import { SettingsCard } from "@/components/settings/settings-card";
import { secondary } from "@/components/settings/styles";
import { requestReportExport } from "@/lib/analytics-api";

export default function WorkspaceAnalyticsPage() {
  const exportMutation = useMutation({
    mutationFn: (type: "contacts" | "deals" | "tasks") => requestReportExport(type, {}),
  });

  return (
    <RequirePermission permission="analytics.view">
      <SettingsCard
        title="Analytics & Reports"
        description="Team performance, response time, conversation reports, sales reports, and exports."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {(["contacts", "deals", "tasks"] as const).map((type) => (
            <button
              key={type}
              className={secondary}
              type="button"
              onClick={() => exportMutation.mutate(type)}
              disabled={exportMutation.isPending}
            >
              <Database className="h-4 w-4" />
              Export {type}
            </button>
          ))}
        </div>
        {exportMutation.isSuccess && (
          <p className="mt-3 text-sm text-success">
            Export requested. The notification bell will show the download.
          </p>
        )}
      </SettingsCard>
    </RequirePermission>
  );
}