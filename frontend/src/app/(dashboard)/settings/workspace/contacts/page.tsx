"use client";

import { useState } from "react";
import Link from "next/link";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { SettingsCard, SettingRow } from "@/components/settings/settings-card";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsSaveBar } from "@/components/settings/settings-save-bar";
import { Toggle } from "@/components/settings/toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Plus, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "general" | "custom-fields" | "lifecycle" | "duplicates";

export default function ContactSettingsPage() {
  const canManage = usePermission("contacts.manage");
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const tabs = [
    { key: "general" as TabKey, label: "General" },
    { key: "custom-fields" as TabKey, label: "Custom Fields" },
    { key: "lifecycle" as TabKey, label: "Lifecycle" },
    { key: "duplicates" as TabKey, label: "Duplicates" },
  ];

  const handleReset = () => { setHasChanges(false); setSaveError(null); };
  const handleSave = async () => { 
    setIsSaving(true); 
    setSaveError(null); 
    try { 
      await new Promise<void>((resolve) => setTimeout(resolve, 1000)); 
      setHasChanges(false); 
    } catch (error) { 
      setSaveError("Failed to save contact settings."); 
    } finally { 
      setIsSaving(false); 
    } 
  };

  return (
    <RequirePermission permission="contacts.manage">
      <div className="space-y-4">
        <div className="space-y-4">
          <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Settings
          </Link>
          <SettingsBreadcrumb items={[{ label: "Settings", href: "/settings" }, { label: "CRM", href: "/settings/workspace/contacts" }, { label: "Contact Settings" }]} />
          <div><h1 className="text-2xl font-bold tracking-tight text-text">Contact Settings</h1><p className="mt-1 text-sm text-muted">Configure contact fields.</p></div>
        </div>
        <SettingsTabs tabs={tabs} active={activeTab} onChange={(key) => setActiveTab(key as TabKey)} />
        <SettingsSaveBar dirty={hasChanges} saving={isSaving} error={saveError} onSave={handleSave} onReset={handleReset} canSave={canManage} />
      </div>
    </RequirePermission>
  );
}
