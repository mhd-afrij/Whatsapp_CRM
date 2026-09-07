"use client";

import { useState, useEffect } from "react";
import { Clock, MessageSquare, Plus, Pencil, Trash2, Save } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import {
  fetchBusinessHours,
  updateBusinessHours,
  type BusinessHoursConfig,
  type DayConfig,
} from "@/lib/business-hours-api";
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import {
  useCreateSlaConfig,
  useDeleteSlaConfig,
  useSlaConfigs,
  useUpdateSlaConfig,
} from "@/hooks/use-sla";
import { ApiError, apiClient } from "@/lib/api-client";
import type { SlaConfig } from "@/lib/sla-api";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "business-hours", label: "Business Hours", icon: Clock },
  { id: "away-message", label: "Away Message", icon: MessageSquare },
  { id: "sla", label: "SLA Rules", icon: Clock },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ──────────────────────────────────────────────
// Business Hours Tab
// ──────────────────────────────────────────────

const BH_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

const BH_TIMEZONES = [
  "UTC", "Asia/Colombo", "Asia/Kolkata", "Asia/Dubai",
  "Europe/London", "America/New_York", "America/Los_Angeles", "Australia/Sydney",
];

function DayRow({ day, config, onChange }: { day: string; config: DayConfig; onChange: (c: DayConfig) => void }) {
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
          <input type="time" value={config.open} onChange={(e) => onChange({ ...config, open: e.target.value })} className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text" />
          <span className="text-muted">to</span>
          <input type="time" value={config.close} onChange={(e) => onChange({ ...config, close: e.target.value })} className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text" />
        </div>
      ) : (
        <span className="text-sm text-muted">Closed</span>
      )}
    </div>
  );
}

function BusinessHoursTab() {
  const [config, setConfig] = useState<BusinessHoursConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchBusinessHours().then(setConfig).catch(() => setError("Unable to load business hours.")).finally(() => setIsLoading(false));
  }, []);

  const handleDayChange = (day: string, dayConfig: DayConfig) => {
    if (!config) return;
    setConfig({ ...config, days: { ...config.days, [day]: dayConfig } });
  };

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateBusinessHours(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save business hours.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-64 animate-pulse rounded bg-border/60" />
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
    <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
      <div>
        <label htmlFor="bh-timezone" className="mb-1 block text-xs font-medium text-muted">Timezone</label>
        <select
          id="bh-timezone"
          value={config.timezone}
          onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
        >
          {BH_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        {BH_DAYS.map((day) => (
          <DayRow key={day} day={day} config={config.days[day]} onChange={(dayConfig) => handleDayChange(day, dayConfig)} />
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-success">Business hours saved.</p>}

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-accent to-accent-muted px-3 py-2 text-sm font-semibold text-accent-text shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Away Message Tab
// ──────────────────────────────────────────────

function AwayMessageTab() {
  const { data: workspace, isLoading } = useWorkspaceSettings();
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [trigger, setTrigger] = useState<"outside_hours" | "once_per_conversation">("outside_hours");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (workspace) {
      setEnabled(workspace.away_message_enabled ?? false);
      setMessage(workspace.away_message ?? "");
      setTrigger(workspace.away_message_trigger ?? "outside_hours");
    }
  }, [workspace]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiClient.patch("/workspace", {
        away_message_enabled: enabled,
        away_message: message,
        away_message_trigger: trigger,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save away message settings.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-bg" />;
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="away-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor="away-enabled" className="text-sm font-medium text-text">
          Enable away message
        </label>
      </div>

      {enabled && (
        <>
          <div>
            <label htmlFor="away-trigger" className="mb-1 block text-xs font-medium text-muted">Send trigger</label>
            <select
              id="away-trigger"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as typeof trigger)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
            >
              <option value="outside_hours">Outside business hours</option>
              <option value="once_per_conversation">Once per conversation</option>
            </select>
          </div>

          <div>
            <label htmlFor="away-message" className="mb-1 block text-xs font-medium text-muted">Message</label>
            <textarea
              id="away-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Thanks for contacting us. Our team is currently offline and will respond during business hours."
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
            />
          </div>

          <div className="rounded-md bg-bg p-3">
            <p className="text-xs font-medium text-muted mb-1">Preview</p>
            <div className="flex items-start gap-2">
              <MessageSquare className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-text whitespace-pre-wrap">{message || "No message configured."}</p>
            </div>
          </div>
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-success">Away message settings saved.</p>}

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-accent to-accent-muted px-3 py-2 text-sm font-semibold text-accent-text shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// SLA Tab
// ──────────────────────────────────────────────

function SlaConfigRow({ config, onEdit }: { config: SlaConfig; onEdit: (c: SlaConfig) => void }) {
  const deleteMutation = useDeleteSlaConfig();
  const updateMutation = useUpdateSlaConfig();

  const onDelete = async () => {
    if (!window.confirm(`Delete "${config.name}"? This action cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync(config.id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Unable to delete SLA config.");
    }
  };

  const toggleActive = async () => {
    try {
      await updateMutation.mutateAsync({ id: config.id, values: { is_active: !config.is_active } });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Unable to update SLA config.");
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-bg px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 min-w-0 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Clock className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-text">{config.name}</span>
          <p className="mt-1 text-xs text-muted">
            First response: {config.first_response_minutes}min | Follow-up: {config.followup_response_minutes}min
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleActive}
          disabled={updateMutation.isPending}
          className={cn("rounded-md px-2 py-1 text-xs font-medium hover:opacity-80 disabled:opacity-50", config.is_active ? "bg-success/10 text-success" : "bg-bg text-muted")}
        >
          {config.is_active ? "Active" : "Inactive"}
        </button>
        <button type="button" onClick={() => onEdit(config)} className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-text" aria-label={`Edit ${config.name}`}>
          <Pencil className="h-4 w-4" />
        </button>
        <button type="button" onClick={onDelete} disabled={deleteMutation.isPending} aria-label={`Delete ${config.name}`} className="rounded-md p-1.5 text-danger hover:bg-danger/10 disabled:opacity-50">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function SlaConfigForm({ initial, onClose }: { initial?: SlaConfig; onClose: () => void }) {
  const createMutation = useCreateSlaConfig();
  const updateMutation = useUpdateSlaConfig();
  const [name, setName] = useState(initial?.name ?? "");
  const [firstResponse, setFirstResponse] = useState(initial?.first_response_minutes ?? 60);
  const [followupResponse, setFollowupResponse] = useState(initial?.followup_response_minutes ?? 240);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(initial);
  const mutation = isEditing ? updateMutation : createMutation;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: initial!.id, values: { name: name.trim(), first_response_minutes: firstResponse, followup_response_minutes: followupResponse } });
      } else {
        await createMutation.mutateAsync({ name: name.trim(), first_response_minutes: firstResponse, followup_response_minutes: followupResponse });
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save SLA config.");
    }
  };

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-surface p-4 space-y-4">
      <h3 className="text-sm font-semibold text-text">{isEditing ? "Edit SLA config" : "New SLA config"}</h3>
      <div>
        <label htmlFor="sla-name" className="mb-1 block text-xs font-medium text-muted">Name *</label>
        <input id="sla-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Default SLA" required className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sla-first" className="mb-1 block text-xs font-medium text-muted">First Response (minutes) *</label>
          <input id="sla-first" type="number" value={firstResponse} onChange={(e) => setFirstResponse(parseInt(e.target.value) || 60)} min={1} required className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text" />
        </div>
        <div>
          <label htmlFor="sla-followup" className="mb-1 block text-xs font-medium text-muted">Follow-up Response (minutes) *</label>
          <input id="sla-followup" type="number" value={followupResponse} onChange={(e) => setFollowupResponse(parseInt(e.target.value) || 240)} min={1} required className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text" />
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={mutation.isPending || !name.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-accent to-accent-muted px-3 py-2 text-sm font-semibold text-accent-text shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50">
          {mutation.isPending ? "Saving..." : isEditing ? "Update" : "Create"}
        </button>
        <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-muted hover:text-text">Cancel</button>
      </div>
    </form>
  );
}

function SlaTab() {
  const { data: configs, isLoading, isError, refetch } = useSlaConfigs();
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SlaConfig | null>(null);

  const handleEdit = (config: SlaConfig) => { setEditingConfig(config); setShowForm(true); };
  const handleCloseForm = () => { setShowForm(false); setEditingConfig(null); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => { setEditingConfig(null); setShowForm(true); }}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-accent to-accent-muted px-3 py-2 text-sm font-semibold text-accent-text shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
        >
          <Plus className="h-4 w-4" /> New SLA
        </button>
      </div>

      {showForm && <SlaConfigForm initial={editingConfig ?? undefined} onClose={handleCloseForm} />}

      <div className="rounded-lg border border-border bg-surface p-4">
        {isLoading && <p className="text-sm text-muted">Loading...</p>}
        {isError && <ErrorState message="Unable to load SLA configs." onRetry={() => refetch()} />}
        {!isLoading && !isError && (configs?.length ?? 0) === 0 && (
          <div className="py-8 text-center">
            <Clock className="mx-auto h-8 w-8 text-muted/50" />
            <p className="mt-2 text-sm text-muted">No SLA configurations yet.</p>
            <p className="text-xs text-muted">Create your first SLA above.</p>
          </div>
        )}
        {!isLoading && !isError && configs && configs.length > 0 && (
          <ul className="space-y-2">
            {configs.map((config) => (
              <SlaConfigRow key={config.id} config={config} onEdit={handleEdit} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Operations Page
// ──────────────────────────────────────────────

function OperationsContent() {
  const [activeTab, setActiveTab] = useState<TabId>("business-hours");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">Operations</h1>
        <p className="text-sm text-muted">
          Configure working hours, auto-replies, and response time targets.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg border border-border bg-bg p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-surface text-text shadow-sm"
                  : "text-muted hover:text-text"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "business-hours" && <BusinessHoursTab />}
      {activeTab === "away-message" && <AwayMessageTab />}
      {activeTab === "sla" && <SlaTab />}
    </div>
  );
}

export default function OperationsPage() {
  return (
    <RequirePermission permission="workspace.settings.manage">
      <OperationsContent />
    </RequirePermission>
  );
}
