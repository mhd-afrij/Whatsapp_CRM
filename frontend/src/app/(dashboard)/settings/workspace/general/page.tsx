"use client";

import { Building2, Upload } from "lucide-react";
import { useState } from "react";
import { RequirePermission } from "@/components/auth/require-permission";
import { SaveButton } from "@/components/settings/save-button";
import { SettingsCard } from "@/components/settings/settings-card";
import { WorkspaceSettingsGate } from "@/components/settings/workspace-settings-gate";
import { input, secondary } from "@/components/settings/styles";
import {
  useUpdateWorkspaceSettings,
  useWorkspaceSettings,
} from "@/hooks/use-workspace-settings";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

function GeneralForm() {
  const workspace = useWorkspaceSettings();
  const update = useUpdateWorkspaceSettings();
  const [logo, setLogo] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    business_category: "",
    country: "",
    timezone: "",
    language: "en",
  });

  const settings = workspace.data;

  // Adjust form fields when the saved settings arrive/update (render-time
  // state adjustment per react.dev/learn/you-might-not-need-an-effect - no
  // cascading setState inside an effect body).
  const [syncedSettings, setSyncedSettings] = useState<typeof settings | undefined>(undefined);
  if (settings && settings !== syncedSettings) {
    setSyncedSettings(settings);
    setForm({
      name: settings.name,
      slug: settings.slug,
      business_category: settings.business_category ?? "",
      country: settings.country ?? "",
      timezone: settings.timezone,
      language: settings.language ?? "en",
    });
  }

  const save = async () => {
    try {
      await update.mutateAsync({
        ...form,
        business_category: form.business_category || null,
        country: form.country || null,
      });
      setMsg("Saved.");
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Unable to save settings.");
    }
  };

  const upload = async () => {
    if (!logo) return;
    await update.mutateAsync({ logo });
    setLogo(null);
    setMsg("Logo uploaded.");
  };

  return (
    <SettingsCard
      title="General"
      description="Workspace name, logo, URL, category, country, timezone, and language."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {(["name", "slug", "business_category", "country", "timezone", "language"] as const).map(
          (key) => (
            <label key={key} className="text-sm font-medium text-text">
              {key.replace(/_/g, " ")}
              <input
                className={cn(input, "mt-1")}
                value={form[key]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    [key]:
                      key === "slug"
                        ? e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "")
                        : e.target.value,
                  })
                }
              />
            </label>
          )
        )}
      </div>

      <div className="mt-5 grid gap-3 border-t border-border pt-5 md:grid-cols-[auto_1fr_auto]">
        {settings?.logo_url ? (
          <img
            src={settings.logo_url}
            alt="Workspace logo"
            className="h-14 w-14 rounded-lg border border-border object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-border">
            <Building2 className="h-5 w-5 text-muted" />
          </div>
        )}
        <label className={cn(input, "flex cursor-pointer items-center gap-2")}>
          <Upload className="h-4 w-4" />
          {logo?.name ?? "Choose workspace logo"}
          <input
            type="file"
            className="sr-only"
            accept="image/*"
            onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          className={secondary}
          disabled={!logo || update.isPending}
          onClick={() => void upload()}
        >
          Upload
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <SaveButton pending={update.isPending} onClick={() => void save()} />
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </SettingsCard>
  );
}

export default function WorkspaceGeneralPage() {
  return (
    <RequirePermission permission="workspace.settings.manage">
      <WorkspaceSettingsGate>{() => <GeneralForm />}</WorkspaceSettingsGate>
    </RequirePermission>
  );
}