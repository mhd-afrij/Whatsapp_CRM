"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SettingsSaveBar } from "@/components/settings/settings-save-bar";
import { SettingsCard, SettingRow } from "@/components/settings/settings-card";
import {
  SettingsEmptyState,
  SettingsErrorState,
  SettingsSkeleton,
} from "@/components/settings/settings-states";
import { Toggle } from "@/components/settings/toggle";
import { TextInput, NumberInput } from "@/components/settings/text-input";
import { Select } from "@/components/settings/select";
import { SearchableSelect } from "@/components/settings/searchable-select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/api-client";
import { useInboxSettings, useUpdateInboxSettings } from "@/hooks/use-inbox-settings";
import {
  useCreateRoutingRule,
  useDeleteRoutingRule,
  useRoutingRules,
  useUpdateRoutingRule,
} from "@/hooks/use-routing-rules";
import type {
  InboxSettings,
  InboxPriority,
  WeekdayKey,
} from "@/lib/inbox-settings-api";
import type { RoutingRule, RoutingRuleCondition, RoutingRuleAction } from "@/lib/routing-rules-api";
import { useUsers } from "@/hooks/use-users";
import { useTeams } from "@/hooks/use-admin";
import { cn } from "@/lib/utils";

type TabKey = "general" | "routing" | "sla" | "working-hours";

const DEFAULT_INBOX_SETTINGS: InboxSettings = {
  general: {
    default_priority: "normal",
    show_customer_profile: true,
    enable_internal_notes: true,
    allow_file_attachments: true,
    allow_reassignment: true,
    allow_closing: true,
    auto_reopen_on_reply: true,
    show_typing_status: true,
    read_receipts: false,
  },
  routing: {
    enabled: true,
    strategy: "round_robin",
    team_id: null,
    max_active_per_agent: 25,
    when_limit_reached: "next_available",
    fallback: "round_robin",
    fallback_team_id: null,
    fallback_user_id: null,
  },
  sla: {
    enabled: false,
    first_response_minutes: 5,
    resolution_hours: 24,
    priorities: { low: 60, normal: 30, high: 10, urgent: 5 },
    pause_outside_hours: true,
    pause_waiting_customer: true,
    notify_before_minutes: 15,
    alert_assigned_agent: true,
    alert_team_manager: true,
    alert_admin: false,
  },
  working_hours: {
    timezone: "Asia/Colombo",
    days: {
      monday: { enabled: true, periods: [{ start: "09:00", end: "18:00" }] },
      tuesday: { enabled: true, periods: [{ start: "09:00", end: "18:00" }] },
      wednesday: { enabled: true, periods: [{ start: "09:00", end: "18:00" }] },
      thursday: { enabled: true, periods: [{ start: "09:00", end: "18:00" }] },
      friday: { enabled: true, periods: [{ start: "09:00", end: "18:00" }] },
      saturday: { enabled: false, periods: [] },
      sunday: { enabled: false, periods: [] },
    },
    holidays: [],
    after_hours: "queue",
    auto_reply_message:
      "Thanks for contacting us. Our team will get back to you during business hours.",
  },
};

const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const PRIORITY_OPTIONS: Array<{ value: InboxPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const ROUTING_STRATEGIES = [
  { value: "round_robin", label: "Round robin" },
  { value: "least_loaded", label: "Least loaded" },
  { value: "ticket_rotation", label: "Ticket rotation" },
];

const LIMIT_OPTIONS = [
  { value: "next_available", label: "Route to next available agent" },
  { value: "queue", label: "Queue conversation until an agent is free" },
];

const FALLBACK_OPTIONS = [
  { value: "round_robin", label: "Round robin" },
  { value: "least_loaded", label: "Least loaded" },
  { value: "team_leader", label: "Assign to team leader" },
];

const AFTER_HOURS_OPTIONS = [
  { value: "queue", label: "Queue until next business hours" },
  { value: "assign", label: "Auto-assign anyway" },
  { value: "auto_reply", label: "Send an automatic reply" },
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
  "Europe/Madrid",
  "Europe/Stockholm",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
].map((tz) => ({ value: tz, label: tz }));

function normalizeInboxSettings(raw: unknown): InboxSettings {
  const base = JSON.parse(JSON.stringify(DEFAULT_INBOX_SETTINGS)) as InboxSettings;
  if (!raw || typeof raw !== "object") return base;
  const patch = raw as Partial<InboxSettings>;
  return {
    general: { ...base.general, ...(patch.general ?? {}) },
    routing: { ...base.routing, ...(patch.routing ?? {}) },
    sla: { ...base.sla, priorities: { ...base.sla.priorities, ...(patch.sla?.priorities ?? {}) }, ...(patch.sla ?? {}) },
    working_hours: {
      ...base.working_hours,
      ...(patch.working_hours ?? {}),
      days: {
        ...base.working_hours.days,
        ...(patch.working_hours?.days ?? {}),
      },
    },
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

/* ------------------------------------------------------------------ */
/* General tab                                                         */
/* ------------------------------------------------------------------ */

function GeneralTab({
  settings,
  disabled,
  onChange,
}: {
  settings: InboxSettings;
  disabled: boolean;
  onChange: (next: InboxSettings) => void;
}) {
  const g = (patch: Partial<InboxSettings["general"]>) =>
    onChange({ ...settings, general: { ...settings.general, ...patch } });

  return (
    <div className="space-y-6">
      <SettingsCard title="Conversation defaults" description="How new conversations are handled in the inbox.">
        <SettingRow
          label="Default priority"
          description="Priority applied to new incoming conversations before any routing rule."
          control={
            <Select
              className="w-56"
              aria-label="Default priority"
              value={settings.general.default_priority}
              disabled={disabled}
              options={PRIORITY_OPTIONS}
              onChange={(e) => g({ default_priority: e.target.value as InboxPriority })}
            />
          }
        />
        <SettingRow
          label="Automatically reopen closed conversations on reply"
          control={<Toggle label="Auto-reopen on reply" checked={settings.general.auto_reopen_on_reply} disabled={disabled} onChange={(v) => g({ auto_reopen_on_reply: v })} />}
        />
        <SettingRow
          label="Show typing status"
          description="Indicate when the customer or agent is typing."
          control={<Toggle label="Show typing status" checked={settings.general.show_typing_status} disabled={disabled} onChange={(v) => g({ show_typing_status: v })} />}
        />
        <SettingRow
          label="Read receipts"
          description="Mark messages as read and expose read state to agents."
          control={<Toggle label="Read receipts" checked={settings.general.read_receipts} disabled={disabled} onChange={(v) => g({ read_receipts: v })} />}
        />
      </SettingsCard>

      <SettingsCard title="Customer panel" description="What agents see next to a conversation.">
        <SettingRow
          label="Show customer profile"
          description="Display the linked contact's details alongside the conversation."
          control={<Toggle label="Show customer profile" checked={settings.general.show_customer_profile} disabled={disabled} onChange={(v) => g({ show_customer_profile: v })} />}
        />
        <SettingRow
          label="Enable internal notes"
          control={<Toggle label="Enable internal notes" checked={settings.general.enable_internal_notes} disabled={disabled} onChange={(v) => g({ enable_internal_notes: v })} />}
        />
        <SettingRow
          label="Allow file attachments"
          control={<Toggle label="Allow file attachments" checked={settings.general.allow_file_attachments} disabled={disabled} onChange={(v) => g({ allow_file_attachments: v })} />}
        />
        <SettingRow
          label="Allow reassignment"
          control={<Toggle label="Allow reassignment" checked={settings.general.allow_reassignment} disabled={disabled} onChange={(v) => g({ allow_reassignment: v })} />}
        />
        <SettingRow
          label="Allow closing"
          control={<Toggle label="Allow closing" checked={settings.general.allow_closing} disabled={disabled} onChange={(v) => g({ allow_closing: v })} />}
        />
      </SettingsCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Routing tab                                                         */
/* ------------------------------------------------------------------ */

const CONDITION_FIELDS = [
  { value: "channel", label: "Channel" },
  { value: "priority", label: "Priority" },
  { value: "country", label: "Country / region" },
  { value: "status", label: "Status" },
  { value: "has_team", label: "Has team" },
];

const CONDITION_OPERATORS = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
];

const ACTION_TYPES = [
  { value: "assign_team", label: "Assign to team" },
  { value: "assign_user", label: "Assign to agent" },
  { value: "set_priority", label: "Set priority" },
];

const PRIORITY_VALUES = ["low", "normal", "high", "urgent"];

function RoutingTab({
  settings,
  disabled,
  onChange,
}: {
  settings: InboxSettings;
  disabled: boolean;
  onChange: (next: InboxSettings) => void;
}) {
  const { toast } = useToast();
  const r = (patch: Partial<InboxSettings["routing"]>) =>
    onChange({ ...settings, routing: { ...settings.routing, ...patch } });

  const { data: users } = useUsers();
  const { data: teams } = useTeams();

  const { data: rules, isLoading, isError, refetch } = useRoutingRules();
  const createRule = useCreateRoutingRule();
  const updateRule = useUpdateRoutingRule();
  const deleteRule = useDeleteRoutingRule();

  const [editing, setEditing] = useState<{ rule: RoutingRule | null; open: boolean }>({ rule: null, open: false });
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<RoutingRule | null>(null);

  const teamOptions = useMemo(
    () => [
      { value: "", label: "None" },
      ...(teams ?? []).map((t) => ({ value: String(t.id), label: t.name })),
    ],
    [teams]
  );

  const userOptions = useMemo(
    () => [
      { value: "", label: "None" },
      ...(users ?? []).map((u) => ({
        value: String(u.id),
        label: u.name,
        hint: u.email ?? undefined,
      })),
    ],
    [users]
  );

  const submitEditor = async (form: { name: string; conditions: RoutingRuleCondition[]; actions: RoutingRuleAction[] }) => {
    setFormError(null);
    try {
      const conditions = form.conditions.filter((c) => c.key && c.operator);
      const actions = form.actions.filter((a) => a.type);
      const payload = {
        name: form.name.trim(),
        is_active: true,
        conditions: conditions.length > 0 ? conditions : null,
        actions: actions.length > 0 ? actions : null,
      };
      if (editing.rule) {
        await updateRule.mutateAsync({ id: editing.rule.id, values: payload });
        toast("Routing rule updated.", "success");
      } else {
        await createRule.mutateAsync(payload);
        toast("Routing rule created.", "success");
      }
      setEditing({ rule: null, open: false });
    } catch (err) {
      setFormError(formErrorMessage(err));
    }
  };

  const toggleRuleActive = async (rule: RoutingRule, next: boolean) => {
    try {
      await updateRule.mutateAsync({ id: rule.id, values: { is_active: next } });
    } catch (err) {
      toast(formErrorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard title="Automatic assignment" description="How incoming conversations are routed to agents.">
        <SettingRow
          label="Enable automatic routing"
          description="Assign incoming conversations automatically based on the strategy below."
          control={<Toggle label="Enable automatic routing" checked={settings.routing.enabled} disabled={disabled} onChange={(v) => r({ enabled: v })} />}
        />
        <SettingRow
          label="Routing strategy"
          control={
            <Select
              className="w-56"
              aria-label="Routing strategy"
              value={settings.routing.strategy}
              disabled={disabled}
              options={ROUTING_STRATEGIES}
              onChange={(e) => r({ strategy: e.target.value as InboxSettings["routing"]["strategy"] })}
            />
          }
        />
        <SettingRow
          label="Route within team"
          description="Restrict assignment to a specific team."
          control={
            <SearchableSelect
              className="w-56"
              placeholder="Route within team"
              value={settings.routing.team_id === null ? "" : String(settings.routing.team_id)}
              disabled={disabled}
              options={teamOptions}
              onChange={(v) => r({ team_id: v === "" ? null : Number(v) })}
            />
          }
        />
        <SettingRow
          label="Max active conversations per agent"
          description="Stop assigning an agent once they reach this many open conversations."
          control={
            <NumberInput
              id="max-active"
              className="w-40"
              min={1}
              max={500}
              disabled={disabled}
              value={settings.routing.max_active_per_agent}
              onChange={(e) => r({ max_active_per_agent: Number(e.target.value) })}
            />
          }
        />
        <SettingRow
          label="When all agents are busy"
          control={
            <Select
              className="w-64"
              aria-label="When all agents are busy"
              value={settings.routing.when_limit_reached}
              disabled={disabled}
              options={LIMIT_OPTIONS}
              onChange={(e) => r({ when_limit_reached: e.target.value as InboxSettings["routing"]["when_limit_reached"] })}
            />
          }
        />
      </SettingsCard>

      <SettingsCard title="Fallback" description="What happens when no strategy target can be matched.">
        <SettingRow
          label="Fallback action"
          control={
            <Select
              className="w-56"
              aria-label="Fallback action"
              value={settings.routing.fallback}
              disabled={disabled}
              options={FALLBACK_OPTIONS}
              onChange={(e) => r({ fallback: e.target.value as InboxSettings["routing"]["fallback"] })}
            />
          }
        />
        <SettingRow
          label="Fallback team"
          control={
            <SearchableSelect
              className="w-56"
              placeholder="Fallback team"
              value={settings.routing.fallback_team_id === null ? "" : String(settings.routing.fallback_team_id)}
              disabled={disabled}
              options={teamOptions}
              onChange={(v) => r({ fallback_team_id: v === "" ? null : Number(v) })}
            />
          }
        />
        <SettingRow
          label="Fallback agent"
          control={
            <SearchableSelect
              className="w-56"
              placeholder="Fallback agent"
              value={settings.routing.fallback_user_id === null ? "" : String(settings.routing.fallback_user_id)}
              disabled={disabled}
              options={userOptions}
              onChange={(v) => r({ fallback_user_id: v === "" ? null : Number(v) })}
            />
          }
        />
      </SettingsCard>

      <SettingsCard
        title="Routing rules"
        description="Rules evaluated in priority order. The first matching rule's action is applied."
        action={
          <Button type="button" size="sm" disabled={disabled} onClick={() => { setFormError(null); setEditing({ rule: null, open: true }); }}>
            <Plus className="h-4 w-4" /> Add Rule
          </Button>
        }
      >
        {isLoading && <SettingsSkeleton rows={3} />}
        {isError && <SettingsErrorState message="Unable to load routing rules." onRetry={() => void refetch()} />}

        {!isLoading && !isError && (!rules || rules.length === 0) && (
          <SettingsEmptyState
            title="No routing rules"
            description="Add rules to override the default strategy for specific channels, priorities or customers."
            action={
              <Button type="button" onClick={() => { setFormError(null); setEditing({ rule: null, open: true }); }}>
                <Plus className="h-4 w-4" /> Add Rule
              </Button>
            }
          />
        )}

        {!isLoading && !isError && rules && rules.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead className="bg-bg text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">Rule</th>
                  <th className="px-4 py-3">Conditions</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-t border-border/70 transition-colors hover:bg-bg/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text">{rule.name}</p>
                      <p className="text-xs text-muted">Priority {rule.priority ?? 0}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {(rule.conditions ?? []).map((c) => `${c.key} ${c.operator} ${c.value}`).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {(rule.actions ?? []).map((a) => `${a.type}: ${a.value}`).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        label={`${rule.name} active`}
                        checked={rule.is_active}
                        disabled={disabled || updateRule.isPending}
                        onChange={(next) => void toggleRuleActive(rule, next)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={disabled}
                          onClick={() => { setFormError(null); setEditing({ rule, open: true }); }}
                        >
                          Edit
                        </Button>
                        <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={() => setDeleting(rule)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>

      {editing.open && (
        <RoutingRuleEditor
          title={editing.rule ? "Edit routing rule" : "Add routing rule"}
          rule={editing.rule}
          submitting={createRule.isPending || updateRule.isPending}
          error={formError}
          onSubmit={(form) => void submitEditor(form)}
          onClose={() => setEditing({ rule: null, open: false })}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-text">Delete routing rule</h2>
<p className="mt-1 text-sm text-muted">
                &quot;{deleting.name}&quot; will no longer be applied to incoming conversations.
              </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteRule.isPending}
                onClick={() => {
                  const rule = deleting;
                  setDeleting(null);
                  void deleteRule.mutateAsync(rule.id, {
                    onSuccess: () => toast("Routing rule deleted.", "success"),
                    onError: (err) => toast(formErrorMessage(err), "error"),
                  });
                }}
              >
                {deleteRule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Delete rule
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoutingRuleEditor({
  title,
  rule,
  submitting,
  error,
  onSubmit,
  onClose,
}: {
  title: string;
  rule: RoutingRule | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (form: { name: string; conditions: RoutingRuleCondition[]; actions: RoutingRuleAction[] }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [conditions, setConditions] = useState<RoutingRuleCondition[]>(
    rule?.conditions?.length
      ? rule.conditions.map((c) => ({ key: c.key, operator: c.operator, value: c.value }))
      : [{ key: "channel", operator: "eq", value: "whatsapp" }]
  );
  const [actions, setActions] = useState<RoutingRuleAction[]>(
    rule?.actions?.length
      ? rule.actions.map((a) => ({ type: a.type, value: a.value }))
      : [{ type: "assign_team", value: "" }]
  );

  const patchCondition = (index: number, patch: Partial<RoutingRuleCondition>) => {
    const next = [...conditions];
    next[index] = { ...next[index], ...patch };
    setConditions(next);
  };
  const patchAction = (index: number, patch: Partial<RoutingRuleAction>) => {
    const next = [...actions];
    next[index] = { ...next[index], ...patch };
    setActions(next);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-text">{title}</h2>
            <p className="text-xs text-muted">Rules run in priority order against each incoming conversation.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-bg hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <TextInput
            label="Rule name"
            description="A short label shown in the rules list."
            placeholder="e.g. High priority customers to VIP team"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="rounded-xl border border-border bg-bg/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-text">When…</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConditions([...conditions, { key: "priority", operator: "eq", value: "normal" }])}
              >
                <Plus className="h-3.5 w-3.5" /> Add condition
              </Button>
            </div>
            {conditions.length === 0 && <p className="text-xs text-muted">No conditions — matches every conversation.</p>}
            <div className="space-y-2">
              {conditions.map((c, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    className="w-32"
                    value={c.key}
                    options={CONDITION_FIELDS}
                    onChange={(e) => patchCondition(index, { key: e.target.value })}
                  />
                  <Select
                    className="w-24"
                    value={c.operator}
                    options={CONDITION_OPERATORS}
                    onChange={(e) => patchCondition(index, { operator: e.target.value })}
                  />
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    value={String(c.value ?? "")}
                    placeholder="Value"
                    onChange={(e) => patchCondition(index, { value: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label="Remove condition"
                    onClick={() => setConditions(conditions.filter((_, i) => i !== index))}
                    className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-bg/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-text">Then…</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActions([...actions, { type: "set_priority", value: "normal" }])}
              >
                <Plus className="h-3.5 w-3.5" /> Add action
              </Button>
            </div>
            <div className="space-y-2">
              {actions.map((a, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    className="w-40"
                    value={a.type}
                    options={ACTION_TYPES}
                    onChange={(e) => {
                      const type = e.target.value;
                      const defaultValue =
                        type === "set_priority" ? "normal" : type === "assign_team" ? "" : "";
                      patchAction(index, { type, value: defaultValue });
                    }}
                  />
                  {a.type === "set_priority" ? (
                    <Select
                      className="w-32"
                      value={String(a.value ?? "normal")}
                      options={PRIORITY_VALUES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))}
                      onChange={(e) => patchAction(index, { value: e.target.value })}
                    />
                  ) : (
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                      value={String(a.value ?? "")}
                      placeholder={a.type === "assign_team" ? "Team id" : "User id"}
                      onChange={(e) => patchAction(index, { value: e.target.value })}
                    />
                  )}
                  <button
                    type="button"
                    aria-label="Remove action"
                    onClick={() => setActions(actions.filter((_, i) => i !== index))}
                    className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!name.trim() || submitting} onClick={() => onSubmit({ name, conditions, actions })}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? "Saving…" : "Save rule"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SLA tab                                                             */
/* ------------------------------------------------------------------ */

function SlaTab({
  settings,
  disabled,
  onChange,
}: {
  settings: InboxSettings;
  disabled: boolean;
  onChange: (next: InboxSettings) => void;
}) {
  const sla = settings.sla;
  const setSla = (patch: Partial<InboxSettings["sla"]>) => onChange({ ...settings, sla: { ...sla, ...patch } });
  const setPriority = (key: InboxPriority, value: number) =>
    setSla({ priorities: { ...sla.priorities, [key]: value } });

  return (
    <div className="space-y-6">
      <SettingsCard title="SLA policy" description="Time-based service level agreements for conversations.">
        <SettingRow
          label="Enable SLA tracking"
          description="Start the clocks on every open conversation."
          control={<Toggle label="Enable SLA tracking" checked={sla.enabled} disabled={disabled} onChange={(v) => setSla({ enabled: v })} />}
        />
        <SettingRow
          label="First response target"
          description="Minutes allowed before a first response is expected."
          control={
            <NumberInput
              id="first-response"
              className="w-40"
              min={1}
              max={720}
              disabled={disabled}
              value={sla.first_response_minutes}
              onChange={(e) => setSla({ first_response_minutes: Number(e.target.value) })}
            />
          }
        />
        <SettingRow
          label="Resolution target"
          description="Hours allowed to resolve a conversation."
          control={
            <NumberInput
              id="resolution"
              className="w-40"
              min={1}
              max={720}
              disabled={disabled}
              value={sla.resolution_hours}
              onChange={(e) => setSla({ resolution_hours: Number(e.target.value) })}
            />
          }
        />
        <SettingRow
          label="Warn agent before breach"
          description="Notify the assigned agent this many minutes before the first-response target."
          control={
            <NumberInput
              id="notify-before"
              className="w-40"
              min={1}
              max={120}
              disabled={disabled}
              value={sla.notify_before_minutes}
              onChange={(e) => setSla({ notify_before_minutes: Number(e.target.value) })}
            />
          }
        />
        <SettingRow
          label="Pause outside business hours"
          description="Don't count time spent outside the configured working hours."
          control={<Toggle label="Pause outside business hours" checked={sla.pause_outside_hours} disabled={disabled} onChange={(v) => setSla({ pause_outside_hours: v })} />}
        />
        <SettingRow
          label="Pause while waiting for customer"
          control={<Toggle label="Pause while waiting for customer" checked={sla.pause_waiting_customer} disabled={disabled} onChange={(v) => setSla({ pause_waiting_customer: v })} />}
        />
      </SettingsCard>

      <SettingsCard title="First response targets by priority" description="Override the default first-response target per priority.">
        <div className="grid gap-3 sm:grid-cols-2">
          {PRIORITY_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-center justify-between gap-3 rounded-xl bg-bg/50 px-3 py-2.5">
              <span className="text-sm font-medium capitalize text-text">{opt.label}</span>
              <div className="flex items-center gap-2">
                <NumberInput
                  className="w-28"
                  min={1}
                  max={720}
                  disabled={disabled}
                  value={sla.priorities[opt.value]}
                  onChange={(e) => setPriority(opt.value, Number(e.target.value))}
                />
                <span className="text-xs text-muted">minutes</span>
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Breach alerts" description="Who gets notified when SLA targets are missed.">
        <SettingRow
          label="Alert assigned agent"
          control={<Toggle label="Alert assigned agent" checked={sla.alert_assigned_agent} disabled={disabled} onChange={(v) => setSla({ alert_assigned_agent: v })} />}
        />
        <SettingRow
          label="Alert team manager"
          control={<Toggle label="Alert team manager" checked={sla.alert_team_manager} disabled={disabled} onChange={(v) => setSla({ alert_team_manager: v })} />}
        />
        <SettingRow
          label="Alert workspace admin"
          control={<Toggle label="Alert workspace admin" checked={sla.alert_admin} disabled={disabled} onChange={(v) => setSla({ alert_admin: v })} />}
        />
      </SettingsCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Working Hours tab                                                   */
/* ------------------------------------------------------------------ */

function WorkingHoursTab({
  settings,
  disabled,
  onChange,
}: {
  settings: InboxSettings;
  disabled: boolean;
  onChange: (next: InboxSettings) => void;
}) {
  const wh = settings.working_hours;
  const setWh = (patch: Partial<InboxSettings["working_hours"]>) =>
    onChange({ ...settings, working_hours: { ...wh, ...patch } });

  const setDay = (day: WeekdayKey, patch: Partial<InboxSettings["working_hours"]["days"][WeekdayKey]>) =>
    setWh({ days: { ...wh.days, [day]: { ...wh.days[day], ...patch } } });

  const addPeriod = (day: WeekdayKey) =>
    setDay(day, { periods: [...wh.days[day].periods, { start: "09:00", end: "18:00" }] });

  const removePeriod = (day: WeekdayKey, index: number) =>
    setDay(day, { periods: wh.days[day].periods.filter((_, i) => i !== index) });

  const patchPeriod = (day: WeekdayKey, index: number, patch: Partial<{ start: string; end: string }>) => {
    const periods = [...wh.days[day].periods];
    periods[index] = { ...periods[index], ...patch };
    setDay(day, { periods });
  };

  const addHoliday = () =>
    setWh({ holidays: [...wh.holidays, { date: "", label: "" }] });

  const patchHoliday = (index: number, patch: Partial<{ date: string; label: string }>) => {
    const holidays = [...wh.holidays];
    holidays[index] = { ...holidays[index], ...patch };
    setWh({ holidays });
  };

  const removeHoliday = (index: number) => setWh({ holidays: wh.holidays.filter((_, i) => i !== index) });

  const hasInvalidHolidays = wh.holidays.some((h) => !h.date);

  return (
    <div className="space-y-6">
      <SettingsCard title="Business hours" description="When your team is expected to be available.">
        <SettingRow
          label="Timezone"
          control={
            <Select
              className="w-56"
              aria-label="Timezone"
              value={wh.timezone}
              disabled={disabled}
              options={TIMEZONE_OPTIONS}
              onChange={(e) => setWh({ timezone: e.target.value })}
            />
          }
        />
        <div className="mt-3 space-y-2">
          {Object.keys(WEEKDAY_LABELS).map((key) => {
            const day = key as WeekdayKey;
            const schedule = wh.days[day];
            return (
              <div key={day} className={cn("rounded-xl border border-border bg-bg/50 p-3", !schedule.enabled && "opacity-60")}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium text-text">{WEEKDAY_LABELS[day]}</span>
                  <Toggle
                    label={`${WEEKDAY_LABELS[day]} enabled`}
                    checked={schedule.enabled}
                    disabled={disabled}
                    onChange={(v) => setDay(day, { enabled: v })}
                  />
                </div>
                {schedule.enabled && (
                  <div className="mt-2 space-y-2">
                    {schedule.periods.map((period, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="time"
                          aria-label={`${WEEKDAY_LABELS[day]} start`}
                          value={period.start}
                          disabled={disabled}
                          onChange={(e) => patchPeriod(day, index, { start: e.target.value })}
                          className="h-8 rounded-lg border border-border bg-surface px-2.5 text-sm text-text outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                        />
                        <span className="text-xs text-muted">to</span>
                        <input
                          type="time"
                          aria-label={`${WEEKDAY_LABELS[day]} end`}
                          value={period.end}
                          disabled={disabled}
                          onChange={(e) => patchPeriod(day, index, { end: e.target.value })}
                          className="h-8 rounded-lg border border-border bg-surface px-2.5 text-sm text-text outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${WEEKDAY_LABELS[day]} period`}
                          disabled={disabled}
                          onClick={() => removePeriod(day, index)}
                          className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => addPeriod(day)}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add period
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Holidays"
        description="Days treated as non-working even if the weekday is enabled."
        action={
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={addHoliday}>
            <Plus className="h-4 w-4" /> Add holiday
          </Button>
        }
      >
        {wh.holidays.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-bg/40 p-4 text-sm text-muted">
            No holidays configured.
          </p>
        ) : (
          <ul className="space-y-2">
            {wh.holidays.map((holiday, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  aria-label="Holiday date"
                  value={holiday.date}
                  disabled={disabled}
                  onChange={(e) => patchHoliday(index, { date: e.target.value })}
                  className="h-8 rounded-lg border border-border bg-surface px-2.5 text-sm text-text outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
                <input
                  type="text"
                  aria-label="Holiday label"
                  placeholder="e.g. Public holiday"
                  value={holiday.label}
                  disabled={disabled}
                  onChange={(e) => patchHoliday(index, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
                <button
                  type="button"
                  aria-label="Remove holiday"
                  disabled={disabled}
                  onClick={() => removeHoliday(index)}
                  className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {hasInvalidHolidays && (
          <p className="mt-2 text-xs text-danger">Holidays need a date before saving.</p>
        )}
      </SettingsCard>

      <SettingsCard title="After hours" description="What happens outside business hours and holidays.">
        <SettingRow
          label="Handling"
          control={
            <Select
              className="w-64"
              aria-label="After hours handling"
              value={wh.after_hours}
              disabled={disabled}
              options={AFTER_HOURS_OPTIONS}
              onChange={(e) => setWh({ after_hours: e.target.value as InboxSettings["working_hours"]["after_hours"] })}
            />
          }
        />
        {wh.after_hours === "auto_reply" && (
          <SettingRow
            label="Automatic reply message"
            description="Sent once per conversation received outside business hours."
            control={
              <textarea
                value={wh.auto_reply_message}
                disabled={disabled}
                onChange={(e) => setWh({ auto_reply_message: e.target.value })}
                rows={3}
                aria-label="Automatic reply message"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
            }
          />
        )}
      </SettingsCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "general", label: "General" },
  { key: "routing", label: "Routing" },
  { key: "sla", label: "SLA" },
  { key: "working-hours", label: "Working Hours" },
];

export default function InboxSettingsPage() {
  const canManage = usePermission("workspace.settings.manage");
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useInboxSettings();
  const update = useUpdateInboxSettings();

  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [draft, setDraft] = useState<InboxSettings>(DEFAULT_INBOX_SETTINGS);
  const [syncedJson, setSyncedJson] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const saved = normalizeInboxSettings(data?.settings);
  const savedJson = JSON.stringify(saved);
  if (savedJson !== syncedJson) {
    setSyncedJson(savedJson);
    setDraft(saved);
  }

  const dirty = JSON.stringify(draft) !== savedJson && syncedJson !== "";

  const handleSave = async () => {
    setSaveError(null);
    try {
      await update.mutateAsync(draft);
      toast("Inbox settings saved.", "success");
    } catch (err) {
      const message = formErrorMessage(err);
      setSaveError(message);
      toast(message, "error");
    }
  };

  const handleReset = () => {
    setDraft(saved);
    setSaveError(null);
  };

  return (
    <RequirePermission permission="workspace.settings.manage">
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
              { label: "Communication", href: "/settings/workspace/inbox" },
              { label: "Inbox Settings" },
            ]}
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text">Inbox Settings</h1>
            <p className="mt-1 text-sm text-muted">
              Configure conversation defaults, routing, SLA targets and working hours.
            </p>
          </div>
        </div>

        <SettingsTabs tabs={TABS} active={activeTab} onChange={(key) => setActiveTab(key as TabKey)} />

        {isLoading && <SettingsSkeleton rows={6} />}
        {isError && (
          <SettingsErrorState message="Unable to load inbox settings." onRetry={() => void refetch()} />
        )}

        {!isLoading && !isError && (
          <>
            {activeTab === "general" && (
              <GeneralTab settings={draft} disabled={!canManage} onChange={setDraft} />
            )}
            {activeTab === "routing" && (
              <RoutingTab settings={draft} disabled={!canManage} onChange={setDraft} />
            )}
            {activeTab === "sla" && (
              <SlaTab settings={draft} disabled={!canManage} onChange={setDraft} />
            )}
            {activeTab === "working-hours" && (
              <WorkingHoursTab settings={draft} disabled={!canManage} onChange={setDraft} />
            )}
          </>
        )}

        <SettingsSaveBar
          dirty={dirty}
          saving={update.isPending}
          error={saveError}
          canSave={canManage}
          onSave={() => void handleSave()}
          onReset={handleReset}
        />
      </div>
    </RequirePermission>
  );
}