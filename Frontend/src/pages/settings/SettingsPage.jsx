import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "../../services/settingsService.js";
import { authFetch } from "../../store/index.js";
import { Button } from "../../components/common/Button.jsx";
import { Tabs } from "../../components/common/Tabs.jsx";

const DEFAULT_SETTINGS = {
  workspace_name: "",
  workspace_slug: "",
  business_hours_open: "09:00",
  business_hours_close: "17:00",
  default_language: "en",
  notify_conversation_assigned: true,
  notify_message_received: true,
  notify_task_due: true,
  notify_lead_stage_change: true,
  session_timeout: "30m",
  require_2fa: false,
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsService.list(),
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: () => authFetch("/auth/sessions"),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => settingsService.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      alert("Settings saved.");
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (id) => authFetch(`/auth/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings((prev) => ({ ...prev, ...settingsQuery.data }));
    }
  }, [settingsQuery.data]);

  const updateSetting = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));

  const saveGeneral = () => {
    updateMutation.mutate({
      workspace_name: settings.workspace_name,
      business_hours_open: settings.business_hours_open,
      business_hours_close: settings.business_hours_close,
      default_language: settings.default_language,
    });
  };

  const saveNotifications = () => {
    updateMutation.mutate({
      notify_conversation_assigned: settings.notify_conversation_assigned,
      notify_message_received: settings.notify_message_received,
      notify_task_due: settings.notify_task_due,
      notify_lead_stage_change: settings.notify_lead_stage_change,
    });
  };

  const saveSecurity = () => {
    updateMutation.mutate({
      session_timeout: settings.session_timeout,
      require_2fa: settings.require_2fa,
    });
  };

  const Toggle = ({ checked, onChange, disabled }) => (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-surface-raised border border-border"
      } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
    </button>
  );

  const tabs = [
    {
      id: "general",
      label: "General",
      content: (
        <div className="space-y-4 max-w-lg">
          <div>
            <label className="text-sm text-text-secondary block mb-1.5">Workspace name</label>
            <input
              type="text"
              value={settings.workspace_name}
              onChange={(e) => updateSetting("workspace_name", e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-sm text-text-secondary block mb-1.5">Slug</label>
            <input
              type="text"
              value={settings.workspace_slug}
              disabled
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-muted"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-text-secondary block mb-1.5">Opening hours</label>
              <input
                type="time"
                value={settings.business_hours_open}
                onChange={(e) => updateSetting("business_hours_open", e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-sm text-text-secondary block mb-1.5">Closing hours</label>
              <input
                type="time"
                value={settings.business_hours_close}
                onChange={(e) => updateSetting("business_hours_close", e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-text-secondary block mb-1.5">Default language</label>
            <select
              value={settings.default_language}
              onChange={(e) => updateSetting("default_language", e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="en">English</option>
              <option value="ar">Arabic</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
            </select>
          </div>
          <Button onClick={saveGeneral} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save general settings"}
          </Button>
        </div>
      ),
    },
    {
      id: "notifications",
      label: "Notifications",
      content: (
        <div className="space-y-4 max-w-lg">
          {[
            { key: "notify_conversation_assigned", label: "New conversation assigned" },
            { key: "notify_message_received", label: "Message received" },
            { key: "notify_task_due", label: "Task due" },
            { key: "notify_lead_stage_change", label: "Lead stage change" },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between py-2">
              <span className="text-sm text-text-primary">{item.label}</span>
              <Toggle checked={settings[item.key]} onChange={(v) => updateSetting(item.key, v)} />
            </div>
          ))}
          <Button onClick={saveNotifications} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save notification settings"}
          </Button>
        </div>
      ),
    },
    {
      id: "security",
      label: "Security",
      content: (
        <div className="space-y-6 max-w-lg">
          <div>
            <label className="text-sm text-text-secondary block mb-1.5">Session timeout</label>
            <select
              value={settings.session_timeout}
              onChange={(e) => updateSetting("session_timeout", e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="15m">15 minutes</option>
              <option value="30m">30 minutes</option>
              <option value="1h">1 hour</option>
              <option value="4h">4 hours</option>
            </select>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-text-primary">Require two-factor authentication</p>
              <p className="text-xs text-text-muted">Enforce 2FA for all team members</p>
            </div>
            <Toggle checked={settings.require_2fa} onChange={(v) => updateSetting("require_2fa", v)} />
          </div>
          <Button onClick={saveSecurity} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save security settings"}
          </Button>

          <div>
            <h3 className="text-sm font-medium text-text-primary mb-3">Active Sessions</h3>
            {sessionsQuery.data && sessionsQuery.data.length > 0 ? (
              <div className="space-y-2">
                {sessionsQuery.data.map((session) => (
                  <div key={session.id} className="flex items-center justify-between rounded-[10px] border border-border bg-surface p-3">
                    <div>
                      <p className="text-sm text-text-primary truncate max-w-xs">
                        {session.user_agent?.substring(0, 60) ?? "Unknown device"}
                      </p>
                      <p className="text-xs text-text-muted">
                        IP: {session.ip_address} · Created: {new Date(session.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => revokeSessionMutation.mutate(session.id)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted">No active sessions.</p>
            )}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-sm text-text-muted mt-1">Manage your workspace settings and preferences.</p>
      </div>

      {settingsQuery.isLoading ? (
        <div className="h-64 rounded-[10px] bg-surface border border-border-muted animate-pulse" />
      ) : (
        <div className="rounded-[10px] border border-border bg-surface p-6">
          <Tabs tabs={tabs} defaultTab="general" />
        </div>
      )}
    </div>
  );
}
