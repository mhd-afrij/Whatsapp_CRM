"use client";

import { useState, useEffect } from "react";
import { Clock, Save } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import {
  fetchBusinessHours,
  updateBusinessHours,
  type BusinessHoursConfig,
  type DayConfig,
} from "@/lib/business-hours-api";
import { ApiError } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/error-state";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const TIMEZONES = [
  "UTC",
  "Asia/Colombo",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

function DayRow({
  day,
  config,
  onChange,
}: {
  day: string;
  config: DayConfig;
  onChange: (config: DayConfig) => void;
}) {
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="w-24">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm font-medium text-text capitalize">{day}</span>
        </label>
      </div>
      {config.enabled ? (
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={config.open}
            onChange={(e) => onChange({ ...config, open: e.target.value })}
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text"
          />
          <span className="text-muted">to</span>
          <input
            type="time"
            value={config.close}
            onChange={(e) => onChange({ ...config, close: e.target.value })}
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text"
          />
        </div>
      ) : (
        <span className="text-sm text-muted">Closed</span>
      )}
    </div>
  );
}

function BusinessHoursManager() {
  const [config, setConfig] = useState<BusinessHoursConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchBusinessHours()
      .then(setConfig)
      .catch(() => setError("Unable to load business hours."))
      .finally(() => setIsLoading(false));
  }, []);

  const handleDayChange = (day: string, dayConfig: DayConfig) => {
    if (!config) return;
    setConfig({
      ...config,
      days: {
        ...config.days,
        [day]: dayConfig,
      },
    });
  };

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      await updateBusinessHours(config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save business hours.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-border/60" />
        <div className="h-4 w-96 animate-pulse rounded bg-border/60" />
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-bg" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !config) {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  if (!config) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Business Hours</h1>
        <p className="mt-1 text-sm text-muted">
          Configure your team&apos;s working hours. Messages received outside business hours
          can trigger away messages and affect SLA calculations.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
        <div>
          <label htmlFor="timezone" className="mb-1 block text-xs font-medium text-muted">
            Timezone
          </label>
          <select
            id="timezone"
            value={config.timezone}
            onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          {DAYS.map((day) => (
            <DayRow
              key={day}
              day={day}
              config={config.days[day]}
              onChange={(dayConfig) => handleDayChange(day, dayConfig)}
            />
          ))}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {saveSuccess && <p className="text-sm text-success">Business hours saved successfully.</p>}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BusinessHoursPage() {
  return (
    <RequirePermission permission="workspace.settings.manage">
      <BusinessHoursManager />
    </RequirePermission>
  );
}
