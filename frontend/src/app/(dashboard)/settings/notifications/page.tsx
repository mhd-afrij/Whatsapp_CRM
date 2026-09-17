"use client";

import { useState } from "react";
import { AlertTriangle, BellRing, Loader2 } from "lucide-react";
import Link from "next/link";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsCard, SettingRow } from "@/components/settings/settings-card";
import {
  SettingsErrorState,
  SettingsSkeleton,
} from "@/components/settings/settings-states";
import { SettingsSaveBar } from "@/components/settings/settings-save-bar";
import { Toggle } from "@/components/settings/toggle";
import { Select } from "@/components/settings/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/api-client";
import {
  useNotificationSettings,
  useUpdateNotificationSettingOne,
  useSaveNotificationSettings,
  useBulkNotificationPreferences,
} from "@/hooks/use-notification-settings";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_TYPE_LABELS } from "@/lib/notifications-api";
import type { NotificationPreferenceRow } from "@/lib/notifications-api";
import type { NotificationGlobalSettings } from "@/lib/notification-settings-api";

const DEFAULT_GLOBAL: NotificationGlobalSettings = {
  email_enabled: true,
  email_digest: "immediately",
  digest_time: "09:00",
  quiet_hours: {
    enabled: false,
    start: "21:00",
    end: "08:00",
    timezone: "Asia/Colombo",
    allow_critical: true,
  },
  in_app_sound: true,
  browser_notifications: false,
  show_unread_badge: true,
  auto_mark_read: false,
};

const DIGEST_OPTIONS = [
  { value: "immediately", label: "Send immediately" },
  { value: "hourly", label: "Hourly digest" },
  { value: "daily", label: "Daily digest" },
  { value: "never", label: "Never send email" },
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

function normalizeGlobal(raw: unknown): NotificationGlobalSettings {
  const base = JSON.parse(JSON.stringify(DEFAULT_GLOBAL)) as NotificationGlobalSettings;
  if (!raw || typeof raw !== "object") return base;
  const patch = raw as Partial<NotificationGlobalSettings>;
  return {
    ...base,
    ...patch,
    quiet_hours: { ...base.quiet_hours, ...(patch.quiet_hours ?? {}) },
  };
}

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

function PreferenceRow({
  pref,
  onToggle,
}: {
  pref: NotificationPreferenceRow;
  onToggle: (notificationType: string, channel: "in_app_enabled" | "email_enabled", value: boolean) => void;
}) {
  const label = NOTIFICATION_TYPE_LABELS[pref.notification_type] ?? pref.notification_type;
  return (
    <li className="flex items-center justify-between gap-4 border-b border-border/70 py-3 last:border-b-0">
      <span className="min-w-0 text-sm text-text">{label}</span>
      <div className="flex shrink-0 items-center gap-5">
        <label className="flex items-center gap-2 text-xs text-muted">
          In-app
          <Toggle
            label={`In-app notifications for ${pref.notification_type}`}
            checked={pref.in_app_enabled}
            onChange={(value) => onToggle(pref.notification_type, "in_app_enabled", value)}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          Email
          <Toggle
            label={`Email notifications for ${pref.notification_type}`}
            checked={pref.email_enabled}
            onChange={(value) => onToggle(pref.notification_type, "email_enabled", value)}
          />
        </label>
      </div>
    </li>
  );
}

export default function NotificationSettingsPage() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useNotificationSettings();
  const saveGlobal = useSaveNotificationSettings();
  const updateOne = useUpdateNotificationSettingOne();
  const bulk = useBulkNotificationPreferences();

  const [draft, setDraft] = useState<NotificationGlobalSettings>(DEFAULT_GLOBAL);
  const [syncedJson, setSyncedJson] = useState("");

  const saved = normalizeGlobal(data?.global);
  const savedJson = JSON.stringify(saved);
  if (data && savedJson !== syncedJson) {
    setSyncedJson(savedJson);
    setDraft(saved);
  }

  const dirty = syncedJson !== "" && JSON.stringify(draft) !== JSON.stringify(saved);
  const quietHoursInvalid = draft.quiet_hours.enabled && (!draft.quiet_hours.start || !draft.quiet_hours.end);
  const preferences = data?.preferences ?? [];

  const handleSaveGlobal = async () => {
    if (quietHoursInvalid) {
      toast("Set both a start and end time for quiet hours.", "error");
      return;
    }
    try {
      await saveGlobal.mutateAsync({ global: draft });
      toast("Notification preferences saved.", "success");
    } catch (err) {
      const message = formErrorMessage(err);
      toast(message, "error");
    }
  };

  const handleToggleOne = (
    notificationType: string,
    channel: "in_app_enabled" | "email_enabled",
    value: boolean
  ) => {
    updateOne.mutate(
      { notificationType, values: { [channel]: value } },
      {
        onError: (err) => {
          const message = formErrorMessage(err);
          toast(message, "error");
          setDraft((current) => current);
        },
      }
    );
  };

  const handleEnableAll = () => {
    bulk.mutate({ inApp: true, email: true }, {
      onError: (err) => toast(formErrorMessage(err), "error"),
    });
  };

  const handleDisableAll = () => {
    bulk.mutate({ inApp: false, email: false }, {
      onError: (err) => toast(formErrorMessage(err), "error"),
    });
  };

  const handleBrowserNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setDraft({ ...draft, browser_notifications: false });
      return;
    }
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast("Browser notifications are not supported in this browser.", "error");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setDraft({ ...draft, browser_notifications: true });
    } else {
      toast("Permission required. Enable browser notifications in your browser settings.", "error");
    }
  };

  const showBrowserWarning =
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission === "denied"
      : false;

  const grouped = NOTIFICATION_CATEGORIES.map((category) => ({
    ...category,
    rows: preferences.filter((pref) => category.types.includes(pref.notification_type)),
  })).concat({
    key: "other",
    label: "Other",
    types: [],
    rows: preferences.filter(
      (pref) => !NOTIFICATION_CATEGORIES.some((cat) => cat.types.includes(pref.notification_type))
    ),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text"
        >
          Back to Settings
        </Link>
        <SettingsBreadcrumb
          items={[
            { label: "Settings", href: "/settings" },
            { label: "Workspace", href: "/settings" },
            { label: "Notification Preferences" },
          ]}
        />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Notification Preferences</h1>
          <p className="mt-1 text-sm text-muted">
            Control how you&apos;re notified for different events. Toggle individual triggers below,
            or turn everything on and off at once.
          </p>
        </div>
      </div>

      {isLoading && <SettingsSkeleton rows={6} />}
      {isError && (
        <SettingsErrorState message="Unable to load notification preferences." onRetry={() => void refetch()} />
      )}

      {!isLoading && !isError && data && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <SettingsCard
              title="Delivery settings"
              description="How and when notifications are delivered to you."
            >
              <SettingRow
                label="Email notifications"
                description="Master switch for all email-based notifications."
                control={
                  <Toggle
                    label="Email notifications"
                    checked={draft.email_enabled}
                    onChange={(v) => setDraft({ ...draft, email_enabled: v })}
                  />
                }
              />
              <SettingRow
                label="Email frequency"
                control={
                  <Select
                    className="w-full sm:w-48"
                    aria-label="Email frequency"
                    value={draft.email_digest}
                    disabled={!draft.email_enabled}
                    options={DIGEST_OPTIONS}
                    onChange={(e) =>
                      setDraft({ ...draft, email_digest: e.target.value as NotificationGlobalSettings["email_digest"] })
                    }
                  />
                }
              />
              {draft.email_enabled && draft.email_digest !== "never" && draft.email_digest !== "immediately" && (
                <SettingRow
                  label="Digest time"
                  description="Local time at which the digest summary is delivered."
                  control={
                    <input
                      type="time"
                      aria-label="Digest time"
                      value={draft.digest_time}
                      onChange={(e) => setDraft({ ...draft, digest_time: e.target.value })}
                      className="h-9 w-36 rounded-lg border border-border bg-bg px-2.5 text-sm text-text outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                  }
                />
              )}
              <SettingRow
                label="Quiet hours"
                description="Suppress non-critical notifications during this window."
                control={
                  <Toggle
                    label="Quiet hours"
                    checked={draft.quiet_hours.enabled}
                    onChange={(v) => setDraft({ ...draft, quiet_hours: { ...draft.quiet_hours, enabled: v } })}
                  />
                }
              />
              {draft.quiet_hours.enabled && (
                <>
                  <SettingRow
                    label="Window"
                    control={
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          aria-label="Quiet hours start"
                          value={draft.quiet_hours.start}
                          onChange={(e) =>
                            setDraft({ ...draft, quiet_hours: { ...draft.quiet_hours, start: e.target.value } })
                          }
                          className="h-9 w-32 rounded-lg border border-border bg-bg px-2.5 text-sm text-text outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                        />
                        <span className="text-xs text-muted">to</span>
                        <input
                          type="time"
                          aria-label="Quiet hours end"
                          value={draft.quiet_hours.end}
                          onChange={(e) =>
                            setDraft({ ...draft, quiet_hours: { ...draft.quiet_hours, end: e.target.value } })
                          }
                          className="h-9 w-32 rounded-lg border border-border bg-bg px-2.5 text-sm text-text outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    }
                  />
                  <SettingRow
                    label="Timezone"
                    control={
                      <Select
                        className="w-full sm:w-48"
                        aria-label="Quiet hours timezone"
                        value={draft.quiet_hours.timezone}
                        options={TIMEZONE_OPTIONS}
                        onChange={(e) =>
                          setDraft({ ...draft, quiet_hours: { ...draft.quiet_hours, timezone: e.target.value } })
                        }
                      />
                    }
                  />
                  <SettingRow
                    label="Allow critical notifications"
                    description="SLA and security alerts are still delivered during quiet hours."
                    control={
                      <Toggle
                        label="Allow critical notifications"
                        checked={draft.quiet_hours.allow_critical}
                        onChange={(v) =>
                          setDraft({ ...draft, quiet_hours: { ...draft.quiet_hours, allow_critical: v } })
                        }
                      />
                    }
                  />
                </>
              )}
              {quietHoursInvalid && (
                <p className="flex items-center gap-2 px-4 pb-3 text-xs text-danger">
                  <AlertTriangle className="h-3.5 w-3.5" /> Quiet hours need both a start and end time.
                </p>
              )}
            </SettingsCard>

            <div className="mt-6">
              <SettingsCard title="In-app behavior" description="How the notification bell behaves.">
                <SettingRow
                  label="Play a sound"
                  control={
                    <Toggle
                      label="Play a sound"
                      checked={draft.in_app_sound}
                      onChange={(v) => setDraft({ ...draft, in_app_sound: v })}
                    />
                  }
                />
                <SettingRow
                  label="Browser notifications"
                  description="System notifications delivered by your browser."
                  control={
                    <Toggle
                      label="Browser notifications"
                      checked={draft.browser_notifications}
                      onChange={(v) => void handleBrowserNotifications(v)}
                    />
                  }
                />
                {showBrowserWarning && (
                  <p className="flex items-center gap-2 px-4 pb-3 text-xs text-danger">
                    <AlertTriangle className="h-3.5 w-3.5" /> Permission was denied in this browser. Allow it to receive
                    browser notifications.
                  </p>
                )}
                <SettingRow
                  label="Show unread badge"
                  control={
                    <Toggle
                      label="Show unread badge"
                      checked={draft.show_unread_badge}
                      onChange={(v) => setDraft({ ...draft, show_unread_badge: v })}
                    />
                  }
                />
                <SettingRow
                  label="Auto-mark as read"
                  description="Mark notifications read once the target page is opened."
                  control={
                    <Toggle
                      label="Auto-mark as read"
                      checked={draft.auto_mark_read}
                      onChange={(v) => setDraft({ ...draft, auto_mark_read: v })}
                    />
                  }
                />
              </SettingsCard>
            </div>
          </div>

          <div className="space-y-6 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-text">
                  <BellRing className="h-4 w-4 text-primary" /> Trigger preferences
                </h2>
                <p className="mt-0.5 text-sm text-muted">Apply the same In-app and Email choice to every trigger.</p>
              </div>
              <div className="flex items-center gap-2">
                {bulk.isPending && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                <Button type="button" variant="outline" size="sm" disabled={bulk.isPending} onClick={handleEnableAll}>
                  Enable All
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={bulk.isPending} onClick={handleDisableAll}>
                  Disable All
                </Button>
              </div>
            </div>

            {grouped
              .filter((group) => group.rows.length > 0)
              .map((group) => (
                <div key={group.key} className="rounded-xl border border-border bg-surface">
                  <div className="border-b border-border px-5 py-3">
                    <h3 className="text-sm font-semibold text-text">{group.label}</h3>
                  </div>
                  <ul className="px-5">
                    {group.rows.map((pref) => (
                      <PreferenceRow key={pref.notification_type} pref={pref} onToggle={handleToggleOne} />
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      )}

      <SettingsSaveBar
        dirty={dirty}
        saving={saveGlobal.isPending}
        error={null}
        canSave
        onSave={() => void handleSaveGlobal()}
        onReset={() => setDraft(saved)}
      />
    </div>
  );
}