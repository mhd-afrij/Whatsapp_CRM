"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  Info,
  Trash2,
  Upload,
} from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SaveButton } from "@/components/settings/save-button";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SettingsSkeleton, SettingsErrorState } from "@/components/settings/settings-states";
import { Toggle } from "@/components/settings/toggle";
import { WorkspaceSettingsGate } from "@/components/settings/workspace-settings-gate";
import { input, secondary } from "@/components/settings/styles";
import { ConfirmActionDialog } from "@/components/whatsapp/confirm-action-dialog";
import {
  useUpdateWorkspaceSettings,
  useWorkspaceSettings,
} from "@/hooks/use-workspace-settings";
import { usePipelines } from "@/hooks/use-pipelines";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Option lists                                                        */
/* ------------------------------------------------------------------ */

const BUSINESS_CATEGORIES = [
  "E-commerce",
  "Retail",
  "Professional Services",
  "Healthcare",
  "Education",
  "Real Estate",
  "Travel & Hospitality",
  "Food & Beverage",
  "Technology",
  "Financial Services",
  "Manufacturing",
  "Other",
];

const COUNTRIES = [
  "Sri Lanka",
  "India",
  "Pakistan",
  "Bangladesh",
  "United Arab Emirates",
  "Saudi Arabia",
  "Qatar",
  "Singapore",
  "Malaysia",
  "Indonesia",
  "Australia",
  "United Kingdom",
  "Germany",
  "France",
  "Netherlands",
  "United States",
  "Canada",
  "Brazil",
  "Other",
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "si", label: "Sinhala" },
  { value: "ta", label: "Tamil" },
  { value: "hi", label: "Hindi" },
  { value: "ar", label: "Arabic" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
];

const TIMEZONES = [
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
  "Europe/Madrid",
  "Europe/Stockholm",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
];

const AWAY_TRIGGERS = [
  { value: "outside_hours", label: "Outside business hours" },
  { value: "once_per_conversation", label: "Once per conversation" },
] as const;

const DEFAULT_BRANDING = {
  primary_color: "#0f766e",
  accent_color: "#14b8a6",
};

const DEFAULT_NOTIFICATION_DEFAULTS = {
  new_conversation: true,
  message_received: true,
  conversation_assigned: true,
  sla_breach: true,
  daily_digest: false,
};

type NotificationDefaultKey = keyof typeof DEFAULT_NOTIFICATION_DEFAULTS;

const NOTIFICATION_DEFAULT_LABELS: Record<NotificationDefaultKey, string> = {
  new_conversation: "New conversations",
  message_received: "New messages",
  conversation_assigned: "Conversations assigned to me",
  sla_breach: "SLA breaches",
  daily_digest: "Daily summary email",
};

/* ------------------------------------------------------------------ */
/* Shared field primitives                                             */
/* ------------------------------------------------------------------ */

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 py-2.5 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm font-medium text-text">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

const TABS = [
  { key: "general", label: "General" },
  { key: "messaging", label: "Messaging" },
  { key: "notifications", label: "Notification Defaults" },
  { key: "branding", label: "Branding" },
  { key: "system", label: "System" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface BrandingShape {
  primary_color?: string;
  accent_color?: string;
  [key: string]: unknown;
}

interface NotificationDefaultsShape {
  [key: string]: unknown;
}

function GeneralForm() {
  const workspaceQuery = useWorkspaceSettings();
  const update = useUpdateWorkspaceSettings();
  const pipelines = usePipelines();
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [logo, setLogo] = useState<File | null>(null);
  const [confirmRemoveLogo, setConfirmRemoveLogo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<"ok" | "err">("ok");

  const [form, setForm] = useState({
    name: "",
    slug: "",
    business_category: "",
    country: "",
    timezone: "UTC",
    language: "en",
  });
  const [away, setAway] = useState({
    away_message_enabled: false,
    away_message: "",
    away_message_trigger: "outside_hours" as "outside_hours" | "once_per_conversation",
  });
  const [branding, setBranding] = useState<BrandingShape>(DEFAULT_BRANDING);
  const [notificationDefaults, setNotificationDefaults] = useState<NotificationDefaultsShape>(
    DEFAULT_NOTIFICATION_DEFAULTS
  );
  const [defaultPipelineId, setDefaultPipelineId] = useState<number | null>(null);

  const settings = workspaceQuery.data;

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
    setAway({
      away_message_enabled: settings.away_message_enabled,
      away_message: settings.away_message ?? "",
      away_message_trigger: settings.away_message_trigger,
    });
    const savedBranding = (settings.branding ?? {}) as BrandingShape;
    setBranding({
      primary_color: typeof savedBranding.primary_color === "string" ? savedBranding.primary_color : DEFAULT_BRANDING.primary_color,
      accent_color: typeof savedBranding.accent_color === "string" ? savedBranding.accent_color : DEFAULT_BRANDING.accent_color,
    });
    const savedDefaults = (settings.notification_defaults ?? {}) as NotificationDefaultsShape;
    setNotificationDefaults({ ...DEFAULT_NOTIFICATION_DEFAULTS, ...savedDefaults });
    setDefaultPipelineId(settings.default_pipeline_id ?? null);
  }

  const pipelineOptions = useMemo(
    () =>
      (pipelines.data ?? []).map((pipeline) => ({
        value: String(pipeline.id),
        label: pipeline.name,
      })),
    [pipelines.data]
  );

  const save = async () => {
    setMsg(null);
    try {
      await update.mutateAsync({
        ...form,
        business_category: form.business_category || null,
        country: form.country || null,
        default_pipeline_id: defaultPipelineId,
        branding,
        notification_defaults: notificationDefaults,
        ...away,
      });
      setMsgKind("ok");
      setMsg("Saved.");
    } catch (err) {
      setMsgKind("err");
      setMsg(err instanceof ApiError ? err.message : "Unable to save settings.");
    }
  };

  const saveAwayOnly = async () => {
    setMsg(null);
    try {
      await update.mutateAsync({ ...away, away_message: away.away_message || null });
      setMsgKind("ok");
      setMsg("Away message saved.");
    } catch (err) {
      setMsgKind("err");
      setMsg(err instanceof ApiError ? err.message : "Unable to save away message.");
    }
  };

  const saveBranding = async () => {
    setMsg(null);
    try {
      await update.mutateAsync({ branding });
      setMsgKind("ok");
      setMsg("Branding saved.");
    } catch (err) {
      setMsgKind("err");
      setMsg(err instanceof ApiError ? err.message : "Unable to save branding.");
    }
  };

  const saveNotificationDefaults = async () => {
    setMsg(null);
    try {
      await update.mutateAsync({ notification_defaults: notificationDefaults });
      setMsgKind("ok");
      setMsg("Notification defaults saved.");
    } catch (err) {
      setMsgKind("err");
      setMsg(err instanceof ApiError ? err.message : "Unable to save notification defaults.");
    }
  };

  const uploadLogo = async () => {
    if (!logo) return;
    setMsg(null);
    try {
      await update.mutateAsync({ logo });
      setLogo(null);
      setMsgKind("ok");
      setMsg("Logo uploaded.");
    } catch (err) {
      setMsgKind("err");
      setMsg(err instanceof ApiError ? err.message : "Unable to upload logo.");
    }
  };

  const removeLogo = async () => {
    setMsg(null);
    try {
      await update.mutateAsync({ remove_logo: true });
      setConfirmRemoveLogo(false);
      setMsgKind("ok");
      setMsg("Logo removed.");
    } catch (err) {
      setMsgKind("err");
      setMsg(err instanceof ApiError ? err.message : "Unable to remove logo.");
    }
  };

  const busy = update.isPending;

  if (workspaceQuery.isLoading) {
    return (
      <RequirePermission permission="workspace.settings.manage">
        <div className="space-y-6">
          <SettingsSkeleton rows={6} />
        </div>
      </RequirePermission>
    );
  }

  if (workspaceQuery.isError || !settings) {
    const reason = workspaceQuery.error instanceof ApiError ? workspaceQuery.error.message : null;
    return (
      <div className="space-y-6">
        <SettingsErrorState
          message={reason ? `Unable to load workspace settings: ${reason}` : "Unable to load workspace settings."}
          onRetry={() => void workspaceQuery.refetch()}
        />
      </div>
    );
  }

  const tabContent: Record<TabKey, React.ReactNode> = {
    general: (
      <SettingsCard
        title="Workspace profile"
        description="Identity, location and locale used across the app."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Workspace name" htmlFor="ws-name">
            <input
              id="ws-name"
              className={input}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Acme Inc."
            />
          </Field>
          <Field label="Workspace URL (slug)" htmlFor="ws-slug" hint="Lowercase letters, numbers, dashes.">
            <input
              id="ws-slug"
              className={input}
              value={form.slug}
              onChange={(e) =>
                setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })
              }
              placeholder="acme"
            />
          </Field>
          <Field label="Business category" htmlFor="ws-category">
            <select
              id="ws-category"
              className={input}
              value={form.business_category}
              onChange={(e) => setForm({ ...form, business_category: e.target.value })}
            >
              <option value="">Not specified</option>
              {BUSINESS_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Country" htmlFor="ws-country">
            <select
              id="ws-country"
              className={input}
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            >
              <option value="">Not specified</option>
              {COUNTRIES.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Timezone" htmlFor="ws-timezone">
            <select
              id="ws-timezone"
              className={input}
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              {TIMEZONES.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Language" htmlFor="ws-language">
            <select
              id="ws-language"
              className={input}
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
            >
              {LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Workspace logo" htmlFor="ws-logo">
          <div className="flex flex-wrap items-center gap-3">
            {settings.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
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
            <label className={cn(input, "flex max-w-xs cursor-pointer items-center gap-2")}>
              <Upload className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {logo?.name ?? (settings.logo_url ? "Change logo" : "Choose workspace logo")}
              </span>
              <input
                type="file"
                className="sr-only"
                accept="image/*"
                onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
              />
            </label>
            {settings.logo_url && (
              <button
                type="button"
                className={cn(secondary, "w-auto border-danger/30 text-danger hover:bg-danger/10")}
                disabled={busy}
                onClick={() => setConfirmRemoveLogo(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            )}
            {logo && (
              <button
                type="button"
                className={secondary}
                disabled={busy}
                onClick={() => void uploadLogo()}
              >
                {busy ? "Uploading…" : "Upload"}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            PNG or JPG, max 2 MB. Uploading replaces the current logo.
          </p>
        </Field>

        <div className="mt-4 flex items-center gap-3">
          <SaveButton pending={busy} onClick={() => void save()} />
          {msg && (
            <span className={cn("text-sm", msgKind === "err" ? "text-danger" : "text-muted")}>{msg}</span>
          )}
        </div>
      </SettingsCard>
    ),

    messaging: (
      <SettingsCard
        title="Away message"
        description="Automatic reply sent on WhatsApp when your team is unavailable."
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg px-4 py-3">
          <div>
            <p className="text-sm font-medium text-text">Enable away message</p>
            <p className="text-xs text-muted">When disabled, no automatic replies are sent.</p>
          </div>
          <Toggle
            label="Enable away message"
            checked={away.away_message_enabled}
            onChange={(v) => setAway({ ...away, away_message_enabled: v })}
          />
        </div>

        {away.away_message_enabled && (
          <div className="mt-4 space-y-4">
            <Field label="Send trigger" htmlFor="away-trigger">
              <select
                id="away-trigger"
                className={input}
                value={away.away_message_trigger}
                onChange={(e) =>
                  setAway({
                    ...away,
                    away_message_trigger: e.target.value as typeof away.away_message_trigger,
                  })
                }
              >
                {AWAY_TRIGGERS.map((trigger) => (
                  <option key={trigger.value} value={trigger.value}>
                    {trigger.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Message" htmlFor="away-message">
              <textarea
                id="away-message"
                className={cn(input, "min-h-28 resize-y")}
                rows={4}
                maxLength={2000}
                value={away.away_message}
                onChange={(e) => setAway({ ...away, away_message: e.target.value })}
                placeholder="Thanks for contacting us. Our team is currently offline and will respond during business hours."
              />
            </Field>
            <div className="rounded-xl bg-bg p-4">
              <p className="mb-1 text-xs font-medium text-muted">Preview</p>
              <p className="whitespace-pre-wrap text-sm text-text">
                {away.away_message || "No message configured."}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <SaveButton pending={busy} onClick={() => void saveAwayOnly()} label="Save Away Message" />
          {msg && (
            <span className={cn("text-sm", msgKind === "err" ? "text-danger" : "text-muted")}>{msg}</span>
          )}
        </div>
      </SettingsCard>
    ),

    notifications: (
      <SettingsCard
        title="Notification defaults"
        description="Workspace-wide starting point applied to new members. Each member can override these in their personal notification preferences."
      >
        <div className="divide-y divide-border">
          {(Object.keys(NOTIFICATION_DEFAULT_LABELS) as NotificationDefaultKey[]).map((key) => (
            <div key={key} className="flex items-center justify-between gap-3 py-3">
              <span className="text-sm text-text">{NOTIFICATION_DEFAULT_LABELS[key]}</span>
              <Toggle
                label={NOTIFICATION_DEFAULT_LABELS[key]}
                checked={Boolean(notificationDefaults[key])}
                onChange={(v) => setNotificationDefaults({ ...notificationDefaults, [key]: v })}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <SaveButton pending={busy} onClick={() => void saveNotificationDefaults()} label="Save Defaults" />
          {msg && (
            <span className={cn("text-sm", msgKind === "err" ? "text-danger" : "text-muted")}>{msg}</span>
          )}
        </div>
      </SettingsCard>
    ),

    branding: (
      <SettingsCard
        title="Branding"
        description="Accent colors used for the workspace preview and email templates."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary color" htmlFor="branding-primary">
            <div className="flex items-center gap-2">
              <input
                id="branding-primary"
                type="color"
                className="h-9 w-14 cursor-pointer rounded-lg border border-border bg-bg p-1"
                value={String(branding.primary_color ?? DEFAULT_BRANDING.primary_color)}
                onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
              />
              <input
                className={cn(input, "font-mono")}
                value={String(branding.primary_color ?? "")}
                onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
              />
            </div>
          </Field>
          <Field label="Accent color" htmlFor="branding-accent">
            <div className="flex items-center gap-2">
              <input
                id="branding-accent"
                type="color"
                className="h-9 w-14 cursor-pointer rounded-lg border border-border bg-bg p-1"
                value={String(branding.accent_color ?? DEFAULT_BRANDING.accent_color)}
                onChange={(e) => setBranding({ ...branding, accent_color: e.target.value })}
              />
              <input
                className={cn(input, "font-mono")}
                value={String(branding.accent_color ?? "")}
                onChange={(e) => setBranding({ ...branding, accent_color: e.target.value })}
              />
            </div>
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <SaveButton pending={busy} onClick={() => void saveBranding()} label="Save Branding" />
          {msg && (
            <span className={cn("text-sm", msgKind === "err" ? "text-danger" : "text-muted")}>{msg}</span>
          )}
        </div>
      </SettingsCard>
    ),

    system: (
      <div className="space-y-6">
        <SettingsCard
          title="Default pipeline"
          description="Pipeline preselected when agents create new deals."
        >
          <Field label="Pipeline" htmlFor="default-pipeline">
            <select
              id="default-pipeline"
              className={cn(input, "sm:max-w-sm")}
              value={defaultPipelineId === null ? "" : String(defaultPipelineId)}
              onChange={(e) => setDefaultPipelineId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">No default pipeline</option>
              {pipelineOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          {pipelines.isError && (
            <p className="mt-2 text-xs text-danger">Unable to load pipelines. Save will keep the current value.</p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <SaveButton pending={busy} onClick={() => void save()} />
            {msg && (
              <span className={cn("text-sm", msgKind === "err" ? "text-danger" : "text-muted")}>{msg}</span>
            )}
          </div>
        </SettingsCard>

        <div className="grid gap-6 md:grid-cols-2">
          <SettingsCard title="Storage" description="Where workspace files are stored.">
            <div className="flex items-start gap-2 rounded-xl bg-bg p-3 text-xs text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Managed by the server administrator. Shown here for reference.
            </div>
            <div className="mt-3">
              <InfoRow label="Driver" value={settings.storage.driver} />
              <InfoRow label="Bucket" value={settings.storage.bucket ?? "—"} />
              <InfoRow label="Endpoint" value={settings.storage.endpoint ?? "—"} />
            </div>
          </SettingsCard>

          <SettingsCard title="Security" description="Session and token policy.">
            <InfoRow
              label="Session lifetime"
              value={`${Math.round(settings.security.session_lifetime_minutes / 60)} h (${settings.security.session_lifetime_minutes} min)`}
            />
            <InfoRow
              label="Expire on close"
              value={settings.security.session_expire_on_close ? "Yes" : "No"}
            />
            <InfoRow
              label="API token expiration"
              value={
                settings.security.sanctum_token_expiration_minutes
                  ? `${settings.security.sanctum_token_expiration_minutes} min`
                  : "No expiration"
              }
            />
          </SettingsCard>
        </div>
      </div>
    ),
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SettingsBreadcrumb
          items={[
            { label: "Settings", href: "/settings" },
            { label: "Workspace", href: "/settings/workspace/general" },
            { label: "General" },
          ]}
        />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Workspace General Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Workspace name, logo, category, country, timezone, language, away message, branding and system info.
          </p>
        </div>
      </div>

      <SettingsTabs
        tabs={TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
        active={activeTab}
        onChange={(key) => setActiveTab(key as TabKey)}
      />

      {tabContent[activeTab]}

      <ConfirmActionDialog
        open={confirmRemoveLogo}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmRemoveLogo(false);
        }}
        title="Remove workspace logo"
        description="This permanently deletes the current logo. You can upload a new one afterward."
        confirmLabel="Remove logo"
        pending={busy}
        onConfirm={() => void removeLogo()}
      />
    </div>
  );
}

export default function WorkspaceGeneralPage() {
  return (
    <RequirePermission permission="workspace.settings.manage">
      <WorkspaceSettingsGate>{() => <GeneralForm />}</WorkspaceSettingsGate>
    </RequirePermission>
  );
}
