"use client";

import { useState } from "react";
import Link from "next/link";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsSaveBar } from "@/components/settings/settings-save-bar";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle } from "lucide-react";
import { ArrowLeft } from "lucide-react";

type TabKey = "quick-replies" | "whatsapp";

export default function TemplatesSettingsPage() {
  const canManage = usePermission("templates.manage");
  const [activeTab, setActiveTab] = useState<TabKey>("quick-replies");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const tabs = [
    { key: "quick-replies" as TabKey, label: "Quick Replies" },
    { key: "whatsapp" as TabKey, label: "WhatsApp Templates" },
  ];

  const handleReset = () => { setHasChanges(false); setSaveError(null); };
  const handleSave = async () => { 
    setIsSaving(true); 
    setSaveError(null); 
    try { 
      await new Promise<void>((resolve) => setTimeout(resolve, 1000)); 
      setHasChanges(false); 
    } catch (error) { 
      setSaveError("Failed to save template settings."); 
    } finally { 
      setIsSaving(false); 
    } 
  };

  return (
    <RequirePermission permission="templates.manage">
      <div className="space-y-4">
        <div className="space-y-4">
          <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Settings
          </Link>
          <SettingsBreadcrumb items={[{ label: "Settings", href: "/settings" }, { label: "Communication", href: "/settings/workspace/templates" }, { label: "Templates" }]} />
          <div><h1 className="text-2xl font-bold tracking-tight text-text">Templates</h1><p className="mt-1 text-sm text-muted">Create reusable replies and manage WhatsApp templates.</p></div>
        </div>
        <SettingsTabs tabs={tabs} active={activeTab} onChange={(key) => setActiveTab(key as TabKey)} />
        <SettingsSaveBar dirty={hasChanges} saving={isSaving} error={saveError} onSave={handleSave} onReset={handleReset} canSave={canManage} />
        
        {activeTab === "quick-replies" && (
          <div className="mt-6">
            <SettingsCard title="Quick Replies" action={<Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> New Reply</Button>}>
              <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
                <span className="font-medium text-text">Welcome Message</span>
                <span className="ml-3 text-xs text-muted">/welcome</span>
              </div>
              <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm mt-2">
                <span className="font-medium text-text">Price Details</span>
                <span className="ml-3 text-xs text-muted">/price</span>
              </div>
              <div className="mt-4 p-3 text-sm text-muted">
                <AlertTriangle className="mb-2 inline-block h-4 w-4" /> Quick replies help you respond faster with consistent messaging.
              </div>
            </SettingsCard>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}
