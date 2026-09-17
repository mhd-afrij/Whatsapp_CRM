"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SettingsSkeleton, SettingsEmptyState, SettingsErrorState } from "@/components/settings/settings-states";
import { SettingsSaveBar } from "@/components/settings/settings-save-bar";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface SettingsPageProps {
  title: string;
  description: string;
  backHref?: string;
  breadcrumbs: { label: string; href?: string }[];
  tabs: { key: string; label: string }[];
  tabContent: (active: string) => ReactNode;
  saving?: boolean;
  dirty?: boolean;
  saveError?: string | null;
  onSave?: () => void;
  onReset?: () => void;
  canSave?: boolean;
  className?: string;
}

export function SettingsPage({
  title,
  description,
  backHref,
  breadcrumbs,
  tabs,
  tabContent,
  saving = false,
  dirty = false,
  saveError = null,
  onSave,
  onReset,
  canSave = true,
  className,
}: SettingsPageProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? "general");

  const handleTabChange = (key: string) => {
    setActiveTab(key);
  };

  const handleSave = () => {
    onSave?.();
  };

  const handleReset = () => {
    onReset?.();
    setActiveTab(tabs[0]?.key ?? "general");
  };

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <SettingsBreadcrumb items={breadcrumbs} />
      <SettingsPageHeader
        title={title}
        description={description}
        backHref={backHref}
      />
      {tabs.length > 0 && (
        <SettingsTabs
          tabs={tabs}
          active={activeTab}
          onChange={handleTabChange}
        />
      )}
      <div className="animate-in fade-in-0 zoom-in-95 duration-200">
        {tabContent(activeTab)}
      </div>
      {tabs.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          {tabContent(activeTab)}
        </div>
      )}
      <SettingsSaveBar
        dirty={dirty}
        saving={saving}
        error={saveError}
        onSave={handleSave}
        onReset={handleReset}
        canSave={canSave}
      />
    </div>
  );
}
