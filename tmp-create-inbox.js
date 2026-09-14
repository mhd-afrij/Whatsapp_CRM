const fs = require('fs');

const inboxContent = `"use client";

import { useState } from "react";
import Link from "next/link";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { SettingsCard, SettingRow } from "@/components/settings/settings-card";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsSaveBar } from "@/components/settings/settings-save-bar";
import { Toggle } from "@/components/settings/toggle";
import { ArrowLeft } from "lucide-react";

type TabKey = "general" | "routing" | "sla" | "working-hours";

export default function InboxSettingsPage() {
  const canManage = usePermission("conversations.manage");
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const tabs = [
    { key: "general" as TabKey, label: "General" },
    { key: "routing" as TabKey, label: "Routing" },
    { key: "sla" as TabKey, label: "SLA" },
    { key: "working-hours" as TabKey, label: "Working Hours" },
  ];

  const handleReset = () => { setHasChanges(false); setSaveError(null); };
  const handleSave = async () => { 
    setIsSaving(true); 
    setSaveError(null); 
    try { 
      await new Promise<void>((resolve) => setTimeout(resolve, 1000)); 
      setHasChanges(false); 
    } catch (error) { 
      setSaveError("Failed to save inbox settings."); 
    } finally { 
      setIsSaving(false); 
    } 
  };

  return (
    <RequirePermission permission="conversations.manage">
      <div className="space-y-4">
        <div className="space-y-4">
          <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Settings
          </Link>
          <SettingsBreadcrumb items={[{ label: "Settings", href: "/settings" }, { label: "Communication", href: "/settings/workspace/inbox" }, { label: "Inbox Settings" }]} />
          <div><h1 className="text-2xl font-bold tracking-tight text-text">Inbox Settings</h1><p className="mt-1 text-sm text-muted">Configure conversation assignment, routing, SLA and working hours.</p></div>
        </div>
        <SettingsTabs tabs={tabs} active={activeTab} onChange={(key) => setActiveTab(key as TabKey)} />
        <SettingsSaveBar dirty={hasChanges} saving={isSaving} error={saveError} onSave={handleSave} onReset={handleReset} canSave={canManage} />
        
        {activeTab === "general" && (
          <div className="mt-6 space-y-6">
            <SettingsCard title="General Settings">
              <SettingRow label="Default priority" description="Priority for new incoming conversations" control={<Toggle checked={true} disabled aria-label="Normal priority" />} />
              <SettingRow label="Show customer profile" control={<Toggle checked={true} disabled aria-label="Show customer profile" />} />
              <SettingRow label="Enable internal notes" control={<Toggle checked={true} disabled aria-label="Internal notes" />} />
              <SettingRow label="Allow file attachments" control={<Toggle checked={true} disabled aria-label="File attachments" />} />
            </SettingsCard>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}
`;

fs.writeFileSync('frontend/src/app/(dashboard)/settings/workspace/inbox/page.tsx', inboxContent);
console.log('Inbox Settings created!');