const fs = require('fs');

const salesContent = `"use client";

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

type TabKey = "pipeline" | "lead-fields" | "assignment" | "automation";

export default function LeadSalesSettingsPage() {
  const canManage = usePermission("leads.manage");
  const [activeTab, setActiveTab] = useState<TabKey>("pipeline");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const tabs = [
    { key: "pipeline" as TabKey, label: "Pipeline" },
    { key: "lead-fields" as TabKey, label: "Lead Fields" },
    { key: "assignment" as TabKey, label: "Assignment" },
    { key: "automation" as TabKey, label: "Automation" },
  ];

  const handleReset = () => { setHasChanges(false); setSaveError(null); };
  const handleSave = async () => { 
    setIsSaving(true); 
    setSaveError(null); 
    try { 
      await new Promise<void>((resolve) => setTimeout(resolve, 1000)); 
      setHasChanges(false); 
    } catch (error) { 
      setSaveError("Failed to save lead settings."); 
    } finally { 
      setIsSaving(false); 
    } 
  };

  return (
    <RequirePermission permission="leads.manage">
      <div className="space-y-4">
        <div className="space-y-4">
          <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Settings
          </Link>
          <SettingsBreadcrumb items={[{ label: "Settings", href: "/settings" }, { label: "CRM", href: "/settings/workspace/sales" }, { label: "Lead Settings" }]} />
          <div><h1 className="text-2xl font-bold tracking-tight text-text">Lead Settings</h1><p className="mt-1 text-sm text-muted">Configure pipelines, stages, assignment and automation.</p></div>
        </div>
        <SettingsTabs tabs={tabs} active={activeTab} onChange={(key) => setActiveTab(key as TabKey)} />
        <SettingsSaveBar dirty={hasChanges} saving={isSaving} error={saveError} onSave={handleSave} onReset={handleReset} canSave={canManage} />
      </div>
    </RequirePermission>
  );
}
`;

fs.writeFileSync('frontend/src/app/(dashboard)/settings/workspace/sales/page.tsx', salesContent);
console.log('Lead Sales Settings created!');