"use client";

import { Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RequirePermission } from "@/components/auth/require-permission";
import { SettingsCard } from "@/components/settings/settings-card";
import { primary } from "@/components/settings/styles";
import { apiClient, unwrap } from "@/lib/api-client";

interface AutomationRule {
  id: number;
  name: string;
  trigger_type: string;
  is_active: boolean;
  run_count: number;
}

export default function WorkspaceAutomationPage() {
  const queryClient = useQueryClient();
  const rules = useQuery({
    queryKey: ["automation-rules"],
    queryFn: () => unwrap<AutomationRule[]>(apiClient.get("/automation-rules")),
  });
  const create = useMutation({
    mutationFn: () =>
      unwrap<AutomationRule>(
        apiClient.post("/automation-rules", {
          name: "New inbound message rule",
          trigger_type: "inbound_message",
          actions: [
            { type: "send_reply", value: "Thanks for your message. We will reply soon." },
          ],
          is_active: false,
        })
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-rules"] }),
  });

  return (
    <RequirePermission permission="workspace.settings.manage">
      <SettingsCard
        title="Automation"
        description="Chatbot rules, auto replies, workflows, trigger events, and scheduled message setup."
      >
        <button className={primary} type="button" onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="h-4 w-4" />
          Create Rule
        </button>

        <div className="mt-4 space-y-2">
          {rules.data?.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-border bg-bg p-3">
              <div className="flex justify-between">
                <p className="font-medium text-text">{rule.name}</p>
                <span className="text-xs text-muted">{rule.is_active ? "Active" : "Paused"}</span>
              </div>
              <p className="text-xs text-muted">
                Trigger: {rule.trigger_type} - Runs: {rule.run_count}
              </p>
            </div>
          ))}
        </div>
      </SettingsCard>
    </RequirePermission>
  );
}