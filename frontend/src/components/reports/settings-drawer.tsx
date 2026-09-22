"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Drawer } from "@/components/settings/drawer";
import { Toggle } from "@/components/settings/toggle";
import { useToast } from "@/providers/toast-provider";
import {
  useReportSettings,
  useResetReportPreferences,
  useUpdateReportPreferences,
} from "@/hooks/use-reports";
import type { ReportPreferences } from "@/lib/reports-api";
import { cn } from "@/lib/utils";

const PREFERENCE_ROWS: Array<{
  key: keyof ReportPreferences;
  title: string;
  description: string;
}> = [
  {
    key: "include_weekends",
    title: "Include weekends",
    description: "Show Saturday & Sunday in the daily breakdown and exports.",
  },
  {
    key: "allow_custom_periods",
    title: "Custom periods",
    description: "Allow choosing an exact from/to range instead of the presets.",
  },
  {
    key: "compare_previous",
    title: "Compare with previous period",
    description: "Default the period-over-period change badges on.",
  },
];

export function ReportSettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const settingsQuery = useReportSettings();
  const updatePreferences = useUpdateReportPreferences();
  const resetPreferences = useResetReportPreferences();

  const saved = settingsQuery.data?.preferences;
  const [overrides, setOverrides] = useState<Partial<ReportPreferences>>({});
  const draft: ReportPreferences = { include_weekends: true, allow_custom_periods: true, compare_previous: true, ...saved, ...overrides };

  const toggle = (key: keyof ReportPreferences, next: boolean) => {
    setOverrides((current) => ({ ...current, [key]: next }));
  };

  const dirty =
    saved != null &&
    (draft.include_weekends !== saved.include_weekends ||
      draft.allow_custom_periods !== saved.allow_custom_periods ||
      draft.compare_previous !== saved.compare_previous);

  const saving = updatePreferences.isPending || resetPreferences.isPending;

  const handleSave = async () => {
    if (!saved) return;
    const changes: Partial<ReportPreferences> = {};
    for (const key of Object.keys(draft) as Array<keyof ReportPreferences>) {
      if (draft[key] !== saved[key]) changes[key] = draft[key];
    }
    try {
      await updatePreferences.mutateAsync(changes);
      setOverrides({});
      toast("Report preferences saved.", "success");
      onClose();
    } catch {
      toast("Couldn't save report preferences.", "error");
    }
  };

  const handleReset = async () => {
    try {
      await resetPreferences.mutateAsync();
      setOverrides({});
      toast("Report preferences reset to defaults.", "success");
    } catch {
      toast("Couldn't reset report preferences.", "error");
    }
  };

  const analytics = settingsQuery.data?.analytics;

  return (
    <Drawer open={open} onClose={onClose} title="Report settings" description="Defaults and display options for the reports page.">
      <div className="space-y-6">
        {settingsQuery.isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-border/50" />
        ) : (
          <>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Preferences</h3>
              <div className="divide-y divide-border/60 rounded-xl border border-border">
                {PREFERENCE_ROWS.map(({ key, title, description }) => (
                  <div key={key} className="flex items-start justify-between gap-4 px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">{title}</p>
                      <p className="mt-0.5 text-xs text-muted">{description}</p>
                    </div>
                    <Toggle checked={draft?.[key] ?? false} onChange={(next) => toggle(key, next)} label={title} />
                  </div>
                ))}
              </div>
            </div>

            {analytics && (
              <div className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Workspace analytics</h3>
                <dl className="divide-y divide-border/60 rounded-xl border border-border text-sm">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <dt className="text-muted">Timezone</dt>
                    <dd className="font-medium text-text">{analytics.timezone}</dd>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <dt className="text-muted">Currency</dt>
                    <dd className="font-medium text-text">{analytics.currency}</dd>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <dt className="text-muted">Week starts</dt>
                    <dd className="font-medium text-text">{analytics.week_starts_on_monday ? "Monday" : "Sunday"}</dd>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <dt className="text-muted">Default period</dt>
                    <dd className="font-medium text-text">{analytics.default_period.replaceAll("_", " ")}</dd>
                  </div>
                </dl>
                <p className="text-[11px] text-muted">
                  Owned by the Analytics settings page · read-only here.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:pointer-events-none disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium text-text transition hover:bg-bg disabled:opacity-50"
                )}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to defaults
              </button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}