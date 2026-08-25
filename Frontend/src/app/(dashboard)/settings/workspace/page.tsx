"use client";

import { useState } from "react";
import { RequirePermission } from "@/components/auth/require-permission";
import { useUpdateWorkspaceSettings, useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { ApiError } from "@/lib/api-client";
import type { WorkspaceSettings } from "@/lib/workspace-api";

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
];

function WorkspaceSettingsForm({ workspace }: { workspace: WorkspaceSettings }) {
  const updateMutation = useUpdateWorkspaceSettings();

  // Lazily seeded from the loaded workspace once (no effect needed - this
  // component only mounts after `workspace` is available, see the parent's
  // isLoading guard below).
  const [name, setName] = useState(workspace.name);
  const [timezone, setTimezone] = useState(workspace.timezone);
  const defaults = workspace.notification_defaults as { email?: boolean; in_app?: boolean } | null;
  const [notifyEmail, setNotifyEmail] = useState(defaults?.email ?? true);
  const [notifyInApp, setNotifyInApp] = useState(defaults?.in_app ?? true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSaveProfile = async () => {
    setError(null);
    setSaved(false);
    try {
      await updateMutation.mutateAsync({
        name: name.trim(),
        timezone,
        notification_defaults: { email: notifyEmail, in_app: notifyInApp },
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save workspace settings.");
    }
  };

  const onUploadLogo = async () => {
    if (!logoFile) return;
    setError(null);
    setSaved(false);
    try {
      await updateMutation.mutateAsync({ logo: logoFile });
      setLogoFile(null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to upload logo.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Workspace Settings</h1>
        <p className="text-sm text-muted">
          Manage your workspace profile, branding, notification defaults, and review
          security/storage configuration.
        </p>
      </div>

      {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {saved && !error && (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">Saved.</p>
      )}

      {/* Profile */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Profile</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted">Workspace name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={onSaveProfile}
            disabled={updateMutation.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            Save profile
          </button>
        </div>
      </section>

      {/* Logo */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Logo</h2>
        <div className="mt-3 flex items-center gap-4">
          {workspace.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={workspace.logo_url}
              alt="Workspace logo"
              className="h-16 w-16 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted">
              No logo
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="text-sm text-text"
            />
            <button
              type="button"
              onClick={onUploadLogo}
              disabled={!logoFile || updateMutation.isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              Upload
            </button>
          </div>
        </div>
      </section>

      {/* Notification defaults */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Notification defaults</h2>
        <p className="mt-1 text-xs text-muted">
          Workspace-wide defaults for new users. Individual users can still override these on
          their own Notifications page.
        </p>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.checked)}
            />
            Email notifications on by default
          </label>
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={notifyInApp}
              onChange={(e) => setNotifyInApp(e.target.checked)}
            />
            In-app notifications on by default
          </label>
        </div>
      </section>

      {/* Storage (read-only) */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Storage configuration</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Driver</dt>
          <dd className="text-text">{workspace.storage.driver}</dd>
          <dt className="text-muted">Bucket</dt>
          <dd className="text-text">{workspace.storage.bucket ?? "—"}</dd>
          <dt className="text-muted">Endpoint</dt>
          <dd className="break-all text-text">{workspace.storage.endpoint ?? "—"}</dd>
        </dl>
      </section>

      {/* Security (read-only) */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Security</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Session lifetime</dt>
          <dd className="text-text">{workspace.security.session_lifetime_minutes} minutes</dd>
          <dt className="text-muted">Expires on browser close</dt>
          <dd className="text-text">{workspace.security.session_expire_on_close ? "Yes" : "No"}</dd>
          <dt className="text-muted">API token expiration</dt>
          <dd className="text-text">
            {workspace.security.sanctum_token_expiration_minutes
              ? `${workspace.security.sanctum_token_expiration_minutes} minutes`
              : "Never"}
          </dd>
        </dl>
      </section>

      {/* Data retention (informational placeholder - no schema-backed policy yet) */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Data retention</h2>
        <p className="mt-1 text-sm text-muted">
          No configurable retention policy exists yet — conversation, contact, and audit-log
          data is retained indefinitely. A future migration is needed to add a
          workspace-level retention window before this section can offer real controls.
        </p>
      </section>
    </div>
  );
}

function WorkspaceSettingsContent() {
  const { data: workspace, isLoading, isError } = useWorkspaceSettings();

  if (isLoading) {
    return <p className="p-6 text-sm text-muted">Loading workspace settings…</p>;
  }

  if (isError || !workspace) {
    return <p className="p-6 text-sm text-danger">Unable to load workspace settings.</p>;
  }

  return <WorkspaceSettingsForm workspace={workspace} />;
}

export default function WorkspaceSettingsPage() {
  return (
    <RequirePermission permission="workspace.settings.manage">
      <WorkspaceSettingsContent />
    </RequirePermission>
  );
}
