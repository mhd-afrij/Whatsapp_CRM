"use client";

import { useState } from "react";
import { SaveButton } from "@/components/settings/save-button";
import { SettingsCard } from "@/components/settings/settings-card";
import { input } from "@/components/settings/styles";
import { useUpdateWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { cn } from "@/lib/utils";

type JsonField =
  | "inbox_settings"
  | "contact_settings"
  | "lead_sales_settings"
  | "integration_settings";

export function JsonSettingsPanel({
  field,
  title,
  description,
  value,
}: {
  field: JsonField;
  title: string;
  description: string;
  value: Record<string, unknown>;
}) {
  const update = useUpdateWorkspaceSettings();
  const [text, setText] = useState(JSON.stringify(value ?? {}, null, 2));
  const [msg, setMsg] = useState<string | null>(null);

  // Re-serialize when the panel receives a new value (render-time state
  // adjustment per react.dev/learn/you-might-not-need-an-effect - no
  // cascading setState inside an effect body).
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(JSON.stringify(value ?? {}, null, 2));
  }

  const save = async () => {
    try {
      await update.mutateAsync({ [field]: JSON.parse(text) });
      setMsg("Saved.");
    } catch {
      setMsg("Settings must be valid JSON.");
    }
  };

  return (
    <SettingsCard title={title} description={description}>
      <textarea
        className={cn(input, "min-h-56 font-mono text-xs")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-3 flex items-center gap-3">
        <SaveButton pending={update.isPending} onClick={() => void save()} label="Save Settings" />
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </SettingsCard>
  );
}