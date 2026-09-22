"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Download,
  FileText,
  Loader2,
  RotateCcw,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { SettingsCard, SettingRow } from "@/components/settings/settings-card";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsSaveBar } from "@/components/settings/settings-save-bar";
import { SettingsSkeleton, SettingsErrorState } from "@/components/settings/settings-states";
import { Toggle } from "@/components/settings/toggle";
import { Select } from "@/components/settings/select";
import { Modal } from "@/components/settings/modal";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { usePermission } from "@/hooks/use-permission";
import {
  useResetReportPreferences,
  useReportSettings,
  useUpdateReportPreferences,
} from "@/hooks/use-reports";
import type { ReportPreferences } from "@/lib/reports-api";
import { useToast } from "@/providers/toast-provider";
import {
  useAnalyticsSettings,
  useResetAnalyticsSettings,
  useUpdateAnalyticsSettings,
} from "@/hooks/use-analytics-settings";
import type {
  AnalyticsDefaultPeriod,
  AnalyticsDateFormat,
  AnalyticsSettings,
} from "@/lib/analytics-settings-api";

type TabKey = "general" | "dashboard" | "exports" | "permissions";

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "general", label: "General", icon: SlidersHorizontal },
  { key: "dashboard", label: "Dashboard", icon: BarChart3 },
  { key: "exports", label: "Reports & Exports", icon: Download },
  { key: "permissions", label: "Permissions", icon: Shield },
];

const TIMEZONE_OPTIONS = [
  "UTC",
  "Asia/Colombo",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Dubai",
  "Asia/Qatar",
  "Asia/Riyadh",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Jakarta",
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
].map((tz) => ({ value: tz, label: tz }));

const PERIOD_OPTIONS: Array<{ value: AnalyticsDefaultPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
];

const DATE_FORMAT_OPTIONS: Array<{ value: AnalyticsDateFormat; label: string }> = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
];

const CURRENCY_OPTIONS = ["LKR", "USD", "EUR", "GBP"].map((c) => ({ value: c, label: c }));

/** The settings this workspace actually consumes - see analytics-settings-api.ts. */
const LIVE_DEFAULTS: AnalyticsSettings = {
  analytics_enabled: true,
  timezone: "Asia/Colombo",
  default_period: "last_30_days",
  week_starts_on_monday: true,
  currency: "LKR",
  date_format: "DD/MM/YYYY",

  track_conversations: true,
  track_response_time: true,
  track_leads: true,
  track_won_leads: true,
  track_lost_leads: true,
  track_agent_performance: true,
};

function formErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errors && typeof error.errors === "object" && !Array.isArray(error.errors)) {
      const first = Object.values(error.errors).flat()[0];
      if (typeof first === "string") return first;
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

function normalizeSettings(raw: unknown): AnalyticsSettings {
  if (!raw || typeof raw !== "object") return LIVE_DEFAULTS;
  const picked: Partial<AnalyticsSettings> = {};
  for (const key of Object.keys(LIVE_DEFAULTS) as Array<keyof AnalyticsSettings>) {
    const value = (raw as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) (picked as Record<string, unknown>)[key] = value;
  }
  return { ...LIVE_DEFAULTS, ...picked };
}

/** Toggle row bound to a boolean settings key. */
function ToggleRow({
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <SettingRow
      label={label}
      description={description}
      control={<Toggle label={label} checked={value} disabled={disabled} onChange={onChange} />}
    />
  );
}

export default function WorkspaceAnalyticsSettingsPage() {
  return (
    <RequirePermission permission="workspace.settings.manage">
      <AnalyticsSettingsContent />
    </RequirePermission>
  );
}

function AnalyticsSettingsContent() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useAnalyticsSettings();
  const update = useUpdateAnalyticsSettings();
  const resetMutation = useResetAnalyticsSettings();

  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [draft, setDraft] = useState<AnalyticsSettings>(LIVE_DEFAULTS);
  const [syncedJson, setSyncedJson] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  const saved = useMemo(() => normalizeSettings(data?.settings), [data]);
  const savedJson = JSON.stringify(saved);
  if (data && savedJson !== syncedJson) {
    setSyncedJson(savedJson);
    setDraft(saved);
  }

  const dirty = syncedJson !== "" && JSON.stringify(draft) !== savedJson;

  const patch = (changes: Partial<AnalyticsSettings>) =>
    setDraft((current) => ({ ...current, ...changes }));

  // Unsaved-changes guard: warn before internal navigation.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const confirmLeave = () => {
    setShowLeaveModal(false);
    const href = pendingNavigation;
    setPendingNavigation(null);
    if (href) window.location.href = href;
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      const result = await update.mutateAsync(draft);
      setSyncedJson(JSON.stringify(normalizeSettings(result.settings)));
      setDraft(normalizeSettings(result.settings));
      toast("Analytics settings updated successfully.", "success");
    } catch (err) {
      const message = formErrorMessage(err);
      setSaveError(message);
      toast(message, "error");
    }
  };

  const handleReset = async () => {
    setShowResetModal(false);
    setSaveError(null);
    try {
      const result = await resetMutation.mutateAsync();
      setSyncedJson(JSON.stringify(normalizeSettings(result.settings)));
      setDraft(normalizeSettings(result.settings));
      toast("Analytics settings were reset to the recommended defaults.", "success");
    } catch (err) {
      const message = formErrorMessage(err);
      setSaveError(message);
      toast(message, "error");
    }
  };

  const handleNavClick = (href: string) => {
    if (dirty) {
      setPendingNavigation(href);
      setShowLeaveModal(true);
      return;
    }
    window.location.href = href;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link
          href="/settings"
          onClick={(e) => {
            if (dirty) {
              e.preventDefault();
              handleNavClick("/settings");
            }
          }}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text"
        >
          Back to Settings
        </Link>
        <SettingsBreadcrumb
          items={[
            { label: "Settings", href: "/settings" },
            { label: "System", href: "/settings" },
            { label: "Analytics" },
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text">Analytics Settings</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Configuration for the Reports dashboard and the Dashboard analytics widgets.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!dirty || update.isPending} onClick={() => setShowResetModal(true)}>
              Reset to Defaults
            </Button>
            <Button type="button" size="sm" disabled={!dirty || update.isPending} onClick={() => void handleSave()}>
              {update.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      {isLoading && <SettingsSkeleton rows={7} />}
      {isError && (
        <SettingsErrorState message="Unable to load analytics settings." onRetry={() => void refetch()} />
      )}

      {!isLoading && !isError && (
        <>
          <SettingsTabs tabs={TABS} active={activeTab} onChange={(key) => setActiveTab(key as TabKey)} />

          {activeTab === "general" && (
            <GeneralSection draft={draft} onChange={patch} />
          )}
          {activeTab === "dashboard" && (
            <DashboardSection draft={draft} onChange={patch} />
          )}
          {activeTab === "exports" && (
            <ExportsSection />
          )}
          {activeTab === "permissions" && (
            <PermissionsSection />
          )}

          <SettingsSaveBar
            dirty={dirty}
            saving={update.isPending}
            error={saveError}
            canSave
            onSave={() => void handleSave()}
            onReset={() => setDraft(saved)}
          />
        </>
      )}

      <Modal
        open={showResetModal}
        onClose={() => setShowResetModal(false)}
        title="Reset analytics settings?"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowResetModal(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={resetMutation.isPending} onClick={() => void handleReset()}>
              {resetMutation.isPending ? "Resetting…" : "Reset Settings"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text">
          Reset all analytics settings for this workspace to the recommended defaults?
        </p>
      </Modal>

      <Modal
        open={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        title="Unsaved changes"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowLeaveModal(false)}>
              Stay
            </Button>
            <Button type="button" variant="destructive" onClick={confirmLeave}>
              Leave Without Saving
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text">You have unsaved analytics settings. Leave without saving?</p>
      </Modal>
    </div>
  );
}

type SectionProps = {
  draft: AnalyticsSettings;
  onChange: (changes: Partial<AnalyticsSettings>) => void;
};

function GeneralSection({ draft, onChange }: SectionProps) {
  return (
    <div className="space-y-6">
      {draft.analytics_enabled === false && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            Analytics is disabled. The Reports dashboard shows an &quot;unavailable&quot; state and the
            Dashboard analytics widgets stop returning new data. Existing history is not deleted.
          </span>
        </div>
      )}
      <SettingsCard
        title="General Analytics"
        description="Values the Reports module and Dashboard analytics use for grouping, currency and display. Changes apply after saving."
      >
        <ToggleRow
          label="Enable analytics"
          description="Workspace-wide switch for the Reports dashboard and Dashboard analytics widgets. When off, reports show an unavailable state."
          value={draft.analytics_enabled}
          onChange={(v) => onChange({ analytics_enabled: v })}
        />
        <SettingRow
          label="Workspace timezone"
          description="All period grouping and daily series dates use this timezone."
          control={
            <Select
              className="w-full sm:w-56"
              aria-label="Workspace timezone"
              value={draft.timezone}
              options={TIMEZONE_OPTIONS}
              onChange={(e) => onChange({ timezone: e.target.value })}
            />
          }
        />
        <SettingRow
          label="Default analytics period"
          description="Initial date range used for the Reports dashboard."
          control={
            <Select
              className="w-full sm:w-44"
              aria-label="Default analytics period"
              value={draft.default_period}
              options={PERIOD_OPTIONS}
              onChange={(e) => onChange({ default_period: e.target.value as AnalyticsDefaultPeriod })}
            />
          }
        />
        <SettingRow
          label="Week starts on"
          description="Controls weekly revenue grouping."
          control={
            <Select
              className="w-full sm:w-44"
              aria-label="Week starts on"
              value={draft.week_starts_on_monday ? "monday" : "sunday"}
              options={[
                { value: "monday", label: "Monday" },
                { value: "sunday", label: "Sunday" },
              ]}
              onChange={(e) => onChange({ week_starts_on_monday: e.target.value === "monday" })}
            />
          }
        />
        <SettingRow
          label="Currency"
          description="Shown on revenue and deal value figures in reports and exports."
          control={
            <Select
              className="w-full sm:w-32"
              aria-label="Currency"
              value={draft.currency}
              options={CURRENCY_OPTIONS}
              onChange={(e) => onChange({ currency: e.target.value })}
            />
          }
        />
        <SettingRow
          label="Date format"
          control={
            <Select
              className="w-full sm:w-44"
              aria-label="Date format"
              value={draft.date_format}
              options={DATE_FORMAT_OPTIONS}
              onChange={(e) => onChange({ date_format: e.target.value as AnalyticsDateFormat })}
            />
          }
        />
      </SettingsCard>
      <ReportPreferencesCard />
    </div>
  );
}

const REPORT_PREFERENCE_ROWS: Array<{
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

function ReportPreferencesCard() {
  const { toast } = useToast();
  const canManageSettings = usePermission("reports.manage_settings");
  const settingsQuery = useReportSettings();
  const updatePreferences = useUpdateReportPreferences();
  const resetPreferences = useResetReportPreferences();
  const [overrides, setOverrides] = useState<Partial<ReportPreferences>>({});

  const saved = settingsQuery.data?.preferences;
  const draft: ReportPreferences = {
    include_weekends: true,
    allow_custom_periods: true,
    compare_previous: true,
    ...saved,
    ...overrides,
  };

  const dirty =
    saved != null && REPORT_PREFERENCE_ROWS.some((row) => draft[row.key] !== saved[row.key]);
  const saving = updatePreferences.isPending || resetPreferences.isPending;

  const handleSave = async () => {
    if (!saved || !canManageSettings) return;
    const changes: Partial<ReportPreferences> = {};
    for (const key of Object.keys(draft) as Array<keyof ReportPreferences>) {
      if (draft[key] !== saved[key]) changes[key] = draft[key];
    }
    try {
      await updatePreferences.mutateAsync(changes);
      setOverrides({});
      toast("Report preferences saved.", "success");
    } catch {
      toast("Couldn't save report preferences.", "error");
    }
  };

  const handleReset = async () => {
    if (!canManageSettings) return;
    try {
      await resetPreferences.mutateAsync();
      setOverrides({});
      toast("Report preferences reset to defaults.", "success");
    } catch {
      toast("Couldn't reset report preferences.", "error");
    }
  };

  if (settingsQuery.isLoading) {
    return <SettingsCard title="Report display preferences" description="Display options for the Reports page."><SettingsSkeleton rows={3} /></SettingsCard>;
  }

  return (
    <SettingsCard
      title="Report display preferences"
      description="Display options for the Reports page. Preferences save immediately."
    >
      {!canManageSettings && (
        <div className="mx-3 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-text">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          Changing report preferences requires the <code className="rounded bg-bg px-1 font-medium">reports.manage_settings</code> permission.
        </div>
      )}
      {REPORT_PREFERENCE_ROWS.map((row) => (
        <ToggleRow
          key={row.key}
          label={row.title}
          description={row.description}
          value={draft[row.key]}
          disabled={!canManageSettings || saving}
          onChange={(next) => setOverrides((current) => ({ ...current, [row.key]: next }))}
        />
      ))}
      <div className="flex gap-2 px-3 pb-3">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving || !canManageSettings}
          onClick={() => void handleSave()}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? "Saving…" : "Save preferences"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving || !canManageSettings}
          onClick={() => void handleReset()}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to defaults
        </Button>
      </div>
    </SettingsCard>
  );
}

function DashboardSection({ draft, onChange }: SectionProps) {
  return (
    <SettingsCard
      title="Dashboard Analytics"
      description="Per-topic availability for the Dashboard analytics widgets. Turning a topic off makes its widget report that data is unavailable; nothing is fabricated when tracking is off."
    >
      <ToggleRow
        label="Track conversations"
        description="Conversation volume widget (messages and conversation counts over time)."
        value={draft.track_conversations}
        onChange={(v) => onChange({ track_conversations: v })}
      />
      <ToggleRow
        label="Track response time"
        description="Response time trend widget (inbound message to first agent reply)."
        value={draft.track_response_time}
        onChange={(v) => onChange({ track_response_time: v })}
      />
      <ToggleRow
        label="Track leads"
        description="Lead tracking for the won-vs-lost widget. That widget also needs the two switches below."
        value={draft.track_leads}
        onChange={(v) => onChange({ track_leads: v })}
      />
      <ToggleRow
        label="Track won leads"
        description="Count leads converted to deals in the won-vs-lost widget."
        value={draft.track_won_leads}
        onChange={(v) => onChange({ track_won_leads: v })}
      />
      <ToggleRow
        label="Track lost leads"
        description="Count lost leads in the won-vs-lost widget."
        value={draft.track_lost_leads}
        onChange={(v) => onChange({ track_lost_leads: v })}
      />
      <ToggleRow
        label="Track agent performance"
        description="Agent performance widget (per-agent activity and response metrics)."
        value={draft.track_agent_performance}
        onChange={(v) => onChange({ track_agent_performance: v })}
      />
      <p className="px-3 pb-1 text-xs text-muted">
        The task completion widget follows the master Enable analytics switch only.
      </p>
    </SettingsCard>
  );
}

const EXPORT_FORMATS = [
  { label: "Daily metrics · CSV", description: "Per-day conversations, leads, conversions, response time and deal value." },
  { label: "Agent summary · CSV", description: "Agent leaderboard snapshot (conversations, tasks, deals won, value)." },
  { label: "Full report · PDF", description: "Key metrics, daily breakdown, lead distribution and top agents." },
];

function ExportsSection() {
  return (
    <div className="space-y-6">
      <SettingsCard title="Report exports" description="Exports run on the job queue and are delivered to the Reports page and your notifications.">
        <div className="divide-y divide-border/60">
          {EXPORT_FORMATS.map((format) => (
            <div key={format.label} className="flex items-start gap-3 px-3 py-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <div>
                <p className="text-sm font-medium text-text">{format.label}</p>
                <p className="text-xs text-muted">{format.description}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="px-3 pb-1 text-xs text-muted">
          Excel export is not currently available. Make sure your queue worker is running to produce
          exports.
        </p>
      </SettingsCard>
      <SettingsCard title="Where to go next" description="Open the Reports dashboard to use these settings.">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          Open Reports dashboard
        </Link>
      </SettingsCard>
    </div>
  );
}

const REPORT_PERMISSIONS = [
  { key: "reports.view", description: "View the Reports dashboard and overview." },
  { key: "reports.view_all_agents", description: "See every agent's numbers in reports; without it, users only see their own slice." },
  { key: "reports.manage_settings", description: "Change report preferences (include weekends, custom periods, compare previous)." },
  { key: "reports.export", description: "Queue and download report exports (CSV/PDF)." },
];

const ANALYTICS_PERMISSIONS = [
  { key: "analytics.view", description: "View the Dashboard analytics widgets." },
  { key: "analytics.export", description: "Request legacy on-demand analytics exports." },
];

function PermissionsSection() {
  return (
    <div className="space-y-6">
      <SettingsCard
        title="Analytics Access & Permissions"
        description="Integrates with the workspace Roles & Permissions system. Backend authorization always enforces these; hiding UI alone is never relied upon."
      >
        <SettingRow
          label="Analytics settings management"
          description="Only roles with workspace.settings.manage can read or change this page; the API enforces it on every request."
          control={<span className="text-xs font-medium text-muted">workspace.settings.manage</span>}
        />
        <SettingRow
          label="Agent data visibility"
          description="# of agents shown in reports and leaderboards is scoped server-side by reports.view_all_agents."
          control={<span className="text-xs font-medium text-muted">reports.view_all_agents</span>}
        />
      </SettingsCard>
      <SettingsCard title="Reports module permissions" description="Manage them in Roles & Permissions.">
        <ul className="space-y-2">
          {REPORT_PERMISSIONS.map((permission) => (
            <li key={permission.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-bg/70">
              <code className="rounded bg-bg px-1.5 py-0.5 text-xs text-text">{permission.key}</code>
              <span className="text-xs text-muted">{permission.description}</span>
            </li>
          ))}
        </ul>
      </SettingsCard>
      <SettingsCard title="Dashboard analytics permissions" description="Legacy dashboard analytics surface.">
        <ul className="space-y-2">
          {ANALYTICS_PERMISSIONS.map((permission) => (
            <li key={permission.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-bg/70">
              <code className="rounded bg-bg px-1.5 py-0.5 text-xs text-text">{permission.key}</code>
              <span className="text-xs text-muted">{permission.description}</span>
            </li>
          ))}
        </ul>
      </SettingsCard>
    </div>
  );
}