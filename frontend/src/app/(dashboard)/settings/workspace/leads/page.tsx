"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { SettingsCard, SettingRow } from "@/components/settings/settings-card";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsSaveBar } from "@/components/settings/settings-save-bar";
import { SettingsSkeleton, SettingsEmptyState, SettingsErrorState } from "@/components/settings/settings-states";
import { Toggle } from "@/components/settings/toggle";
import { TextInput, NumberInput } from "@/components/settings/text-input";
import { Select, SelectField } from "@/components/settings/select";
import { SearchableSelect, type SearchableOption } from "@/components/settings/searchable-select";
import { Modal } from "@/components/settings/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";
import { useUsers } from "@/hooks/use-users";
import { useTeams } from "@/hooks/use-admin";
import { useQuery } from "@tanstack/react-query";
import { fetchPipelines } from "@/lib/pipelines-api";
import {
  useCreateCustomFieldDefinition,
  useDeleteCustomFieldDefinition,
  useCustomFieldDefinitions,
  useReorderCustomFieldDefinitions,
  useUpdateCustomFieldDefinition,
  fieldTypeLabel,
} from "@/hooks/use-custom-fields";
import type { CustomFieldDefinition } from "@/lib/custom-fields-api";
import {
  AUTOMATION_TRIGGER_LABELS,
  type AutomationTriggerType,
  type LeadAssignmentRule,
  type LeadAutomation,
  type LeadScoringRule,
  type LeadSettings,
  type LeadSource,
  type LeadStatus,
  type RuleAction,
  type RuleCondition,
  type ScoreRange,
} from "@/lib/lead-settings-api";
import {
  useCreateLeadAssignmentRule,
  useCreateLeadAutomation,
  useCreateLeadScoringRule,
  useCreateLeadSource,
  useCreateLeadStatus,
  useDeleteLeadAssignmentRule,
  useDeleteLeadAutomation,
  useDeleteLeadScoringRule,
  useDeleteLeadSource,
  useDeleteLeadStatus,
  useLeadAssignmentRules,
  useLeadAutomations,
  useLeadScoringRules,
  useLeadSettings,
  useLeadSources,
  useLeadStatuses,
  useReorderLeadAssignmentRules,
  useReorderLeadSources,
  useReorderLeadStatuses,
  useSetLeadAutomationActive,
  useUpdateLeadAssignmentRule,
  useUpdateLeadAutomation,
  useUpdateLeadScoringRule,
  useUpdateLeadSource,
  useUpdateLeadStatus,
  useUpdateLeadSettings,
} from "@/hooks/use-lead-settings";

type TabKey = "general" | "statuses" | "sources" | "assignment" | "scoring" | "conversion" | "automation" | "fields";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "general", label: "General" },
  { key: "statuses", label: "Statuses" },
  { key: "sources", label: "Sources" },
  { key: "assignment", label: "Assignment" },
  { key: "scoring", label: "Scoring" },
  { key: "conversion", label: "Conversion" },
  { key: "automation", label: "Automation" },
  { key: "fields", label: "Custom Fields" },
];

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

const DEFAULT_LEAD_SETTINGS: LeadSettings = {
  general: {
    default_status_id: null,
    default_priority: "normal",
    default_owner_type: "none",
    default_owner_id: null,
    auto_create_from_whatsapp_contact: true,
    auto_create_from_conversation: true,
    prevent_duplicate_active_leads: true,
    duplicate_fields: { contact: true, phone: true, email: false },
    require_owner: false,
    require_source: false,
    allow_manual_creation: true,
    allow_deletion: false,
  },
  assignment: {
    enabled: true,
    strategy: "round_robin",
    user_ids: [],
    team_id: null,
    skip_offline: true,
    skip_on_leave: false,
    period: "today",
    team_strategy: "round_robin",
    max_per_user: 50,
    when_limit_reached: "next_available",
  },
  scoring: {
    enabled: true,
    ranges: [
      { name: "Cold", min: 0, max: 29, color: "#64748b" },
      { name: "Warm", min: 30, max: 59, color: "#f59e0b" },
      { name: "Hot", min: 60, max: 79, color: "#ef4444" },
      { name: "Very Hot", min: 80, max: 100, color: "#22c55e" },
    ],
  },
  conversion: {
    enabled: true,
    create: { relationship: true, deal: true, task: false, follow_up: false },
    create_deal_automatically: true,
    default_pipeline_id: null,
    default_stage_id: null,
    deal_title_template: "{{contact_name}} - {{lead_source}}",
    deal_value: "estimated",
    fixed_value: null,
    converted_status_id: null,
    copy: {
      owner: true,
      source: true,
      notes: true,
      tags: true,
      estimated_value: true,
      custom_fields: true,
    },
    after_conversion: "keep",
  },
};

function normalizeSettings(settings?: LeadSettings): LeadSettings {
  if (!settings) return DEFAULT_LEAD_SETTINGS;
  return {
    general: { ...DEFAULT_LEAD_SETTINGS.general, ...settings.general },
    assignment: { ...DEFAULT_LEAD_SETTINGS.assignment, ...settings.assignment },
    scoring: { ...DEFAULT_LEAD_SETTINGS.scoring, ...settings.scoring },
    conversion: { ...DEFAULT_LEAD_SETTINGS.conversion, ...settings.conversion },
  };
}

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const OWNER_TYPE_OPTIONS = [
  { value: "none", label: "No default owner" },
  { value: "current_user", label: "Current user (agent creating the lead)" },
  { value: "user", label: "Specific user" },
  { value: "team", label: "A team (assign to lead owner later)" },
];

const STRATEGY_OPTIONS = [
  { value: "round_robin", label: "Round robin" },
  { value: "least_assigned", label: "Least assigned" },
  { value: "least_active", label: "Least active" },
  { value: "random", label: "Random" },
  { value: "user", label: "Assign to specific users" },
  { value: "team", label: "Assign to a team" },
];

const PERIOD_OPTIONS = [
  { value: "today", label: "Today (daily)" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

const LIMIT_OPTIONS = [
  { value: "unassigned", label: "Leave unassigned" },
  { value: "next_available", label: "Assign to next available" },
  { value: "anyway", label: "Assign anyway (over the limit)" },
];

const TEAM_STRATEGY_OPTIONS = [
  { value: "round_robin", label: "Round robin within team" },
  { value: "least_assigned", label: "Least assigned within team" },
];

const DEAL_VALUE_OPTIONS = [
  { value: "estimated", label: "Use estimated value" },
  { value: "blank", label: "Leave blank" },
  { value: "fixed", label: "Fixed value" },
];

const AFTER_CONVERSION_OPTIONS = [
  { value: "keep", label: "Keep the lead visible" },
  { value: "archive", label: "Archive the lead" },
  { value: "hide", label: "Hide the lead" },
];

/* ------------------------------------------------------------------ */
/* General                                                             */
/* ------------------------------------------------------------------ */

function GeneralTab({
  settings,
  disabled,
  onChange,
}: {
  settings: LeadSettings;
  disabled: boolean;
  onChange: (next: LeadSettings) => void;
}) {
  const statuses = useLeadStatuses();
  const users = useUsers();
  const teams = useTeams();
  const g = (patch: Partial<LeadSettings["general"]>) =>
    onChange({ ...settings, general: { ...settings.general, ...patch } });

  const statusOptions: SearchableOption[] =
    statuses.data?.map((s) => ({ value: String(s.id), label: s.name })) ?? [];

  const ownerType = settings.general.default_owner_type;

  return (
    <div className="space-y-6">
      <SettingsCard title="Defaults" description="How new leads are started.">
        <SettingRow
          label="Default status"
          description="Status applied to newly created leads when none is specified."
          control={
            <div className="w-56">
              <SearchableSelect
                options={statusOptions}
                value={settings.general.default_status_id ? String(settings.general.default_status_id) : ""}
                placeholder="Select status…"
                disabled={disabled || statuses.isLoading}
                onChange={(v) => g({ default_status_id: v ? Number(v) : null })}
              />
            </div>
          }
        />
        <SettingRow
          label="Default priority"
          control={
            <Select
              className="w-56"
              aria-label="Default priority"
              value={settings.general.default_priority}
              disabled={disabled}
              options={PRIORITY_OPTIONS}
              onChange={(e) => g({ default_priority: e.target.value as LeadSettings["general"]["default_priority"] })}
            />
          }
        />
        <SettingRow
          label="Default owner"
          description="Who owns new leads by default."
          control={
            <div className="w-56">
              <SelectField
                value={ownerType}
                disabled={disabled}
                options={OWNER_TYPE_OPTIONS}
                onChange={(v) =>
                  g({ default_owner_type: v as LeadSettings["general"]["default_owner_type"], default_owner_id: null })
                }
              />
            </div>
          }
        />
        {ownerType === "user" && (
          <div className="pl-3">
            <SearchableSelect
              options={
                users.data?.map((u) => ({ value: String(u.id), label: u.name, hint: u.email })) ?? []
              }
              value={settings.general.default_owner_id ? String(settings.general.default_owner_id) : ""}
              placeholder="Select user…"
              disabled={disabled || users.isLoading}
              onChange={(v) => g({ default_owner_id: v ? Number(v) : null })}
            />
          </div>
        )}
        {ownerType === "team" && (
          <div className="pl-3">
            <SearchableSelect
              options={teams.data?.map((t) => ({ value: String(t.id), label: t.name })) ?? []}
              value={settings.general.default_owner_id ? String(settings.general.default_owner_id) : ""}
              placeholder="Select team…"
              disabled={disabled || teams.isLoading}
              onChange={(v) => g({ default_owner_id: v ? Number(v) : null })}
            />
          </div>
        )}
        <SettingRow
          label="Require owner for new leads"
          description="Block creating a lead without an assigned owner."
          control={<Toggle label="Require owner" checked={settings.general.require_owner} disabled={disabled} onChange={(v) => g({ require_owner: v })} />}
        />
        <SettingRow
          label="Require source for new leads"
          control={<Toggle label="Require source" checked={settings.general.require_source} disabled={disabled} onChange={(v) => g({ require_source: v })} />}
        />
        <SettingRow
          label="Allow manual lead creation"
          control={<Toggle label="Manual creation" checked={settings.general.allow_manual_creation} disabled={disabled} onChange={(v) => g({ allow_manual_creation: v })} />}
        />
        <SettingRow
          label="Allow lead deletion"
          description="When off (default), leads can only be closed or converted, never deleted."
          control={<Toggle label="Allow deletion" checked={settings.general.allow_deletion} disabled={disabled} onChange={(v) => g({ allow_deletion: v })} />}
        />
      </SettingsCard>

      <SettingsCard title="Lead creation from conversations" description="Automatic lead behavior.">
        <SettingRow
          label="Create a lead from new WhatsApp contacts"
          control={<Toggle label="Auto-create from WhatsApp contact" checked={settings.general.auto_create_from_whatsapp_contact} disabled={disabled} onChange={(v) => g({ auto_create_from_whatsapp_contact: v })} />}
        />
        <SettingRow
          label="Create a lead from new conversations"
          control={<Toggle label="Auto-create from conversation" checked={settings.general.auto_create_from_conversation} disabled={disabled} onChange={(v) => g({ auto_create_from_conversation: v })} />}
        />
      </SettingsCard>

      <SettingsCard title="Duplicates" description="Preventing duplicate leads.">
        <SettingRow
          label="Prevent duplicate active leads"
          description="Block creating a new lead while an identical active lead already exists."
          control={<Toggle label="Prevent duplicates" checked={settings.general.prevent_duplicate_active_leads} disabled={disabled} onChange={(v) => g({ prevent_duplicate_active_leads: v })} />}
        />
        <div className="space-y-2 border-t border-border/70 pt-3">
          {(
            [
              ["contact", settings.general.duplicate_fields.contact, "Linked contact"],
              ["phone", settings.general.duplicate_fields.phone, "Phone number"],
              ["email", settings.general.duplicate_fields.email, "Email address"],
            ] as const
          ).map(([key, value, label]) => (
            <SettingRow
              key={key}
              label={`Match on ${label}`}
              control={
                <Toggle
                  label={`Match on ${label}`}
                  checked={value}
                  disabled={disabled || !settings.general.prevent_duplicate_active_leads}
                  onChange={(v) =>
                    g({ duplicate_fields: { ...settings.general.duplicate_fields, [key]: v } })
                  }
                />
              }
            />
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Statuses                                                            */
/* ------------------------------------------------------------------ */

function StatusFormModal({
  editing,
  onClose,
}: {
  editing: LeadStatus | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateLeadStatus();
  const update = useUpdateLeadStatus();
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<LeadStatus["type"]>(editing?.type ?? "open");
  const [color, setColor] = useState(editing?.color ?? "#6366f1");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [isDefault, setIsDefault] = useState(editing?.is_default ?? false);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError("A name is required.");
      return;
    }
    const values = { name: name.trim(), type, color, description: description.trim() || null, is_default: isDefault, is_active: isActive };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, values });
      else await create.mutateAsync(values);
      toast(editing ? "Lead status updated." : "Lead status created.", "success");
      onClose();
    } catch (err) {
      setError(formErrorMessage(err));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit status" : "Add status"}
      description="Statuses appear in the lead pipeline and drive conversion."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add status"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput label="Name" placeholder="e.g. Qualified" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-4">
          <div className="flex-1">
            <SelectField
              label="Type"
              options={[
                { value: "open", label: "Open (in progress)" },
                { value: "won", label: "Won" },
                { value: "lost", label: "Lost" },
              ]}
              value={type}
              onChange={(v) => setType(v as LeadStatus["type"])}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-text">Color</label>
            <input
              type="color"
              aria-label="Color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-20 cursor-pointer rounded-lg border border-border bg-surface"
            />
          </div>
        </div>
        <TextInput label="Description" placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Toggle label="Set as default status" checked={isDefault} onChange={setIsDefault} />
        <Toggle label="Active" checked={isActive} onChange={setIsActive} />
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function DeleteStatusModal({
  status,
  onClose,
}: {
  status: LeadStatus;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const statuses = useLeadStatuses();
  const del = useDeleteLeadStatus();
  const others = statuses.data?.filter((s) => s.id !== status.id) ?? [];
  const [replacementId, setReplacementId] = useState<string>(others[0] ? String(others[0].id) : "");
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!replacementId) {
      setError("Choose a status to move existing leads to.");
      return;
    }
    try {
      await del.mutateAsync({ id: status.id, replacementStatusId: Number(replacementId) });
      toast("Lead status deleted; leads moved.", "success");
      onClose();
    } catch (err) {
      setError(formErrorMessage(err));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete "${status.name}"`}
      description="Existing leads on this status will be moved to the replacement status."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={del.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={del.isPending || others.length === 0}>
            {del.isPending ? "Deleting…" : "Delete status"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {others.length === 0 ? (
          <p className="text-sm text-muted">This is the only status. Add another status before deleting this one.</p>
        ) : (
          <SelectField
            label="Move existing leads to"
            options={others.map((s) => ({ value: String(s.id), label: s.name }))}
            value={replacementId}
            onChange={setReplacementId}
          />
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function StatusesTab({ disabled }: { disabled: boolean }) {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useLeadStatuses();
  const reorder = useReorderLeadStatuses();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LeadStatus | null>(null);
  const [deleting, setDeleting] = useState<LeadStatus | null>(null);

  const move = async (index: number, direction: -1 | 1) => {
    if (!data) return;
    const next = [...data];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await reorder.mutateAsync(next.map((s) => s.id));
      toast("Status order saved.", "success");
    } catch (err) {
      toast(formErrorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Lead statuses"
        description="Stages a lead moves through. One status can be the default for new leads."
        action={
          <Button size="sm" onClick={() => setCreating(true)} disabled={disabled}>
            <Plus data-slot="icon" /> Add status
          </Button>
        }
      >
        {isLoading && <SettingsSkeleton rows={5} />}
        {isError && <SettingsErrorState message="Unable to load lead statuses." onRetry={() => void refetch()} />}
        {!isLoading && !isError && (!data || data.length === 0) && (
          <SettingsEmptyState title="No statuses yet" description="Add your first lead status to get started." />
        )}
        {!isLoading && !isError && data && data.length > 0 && (
          <div className="divide-y divide-border/70">
            {data.map((status, i) => (
              <div key={status.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">
                      {status.name}
                      {status.is_default && (
                        <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                          Default
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {status.type === "open" ? "Open" : status.type === "won" ? "Won" : "Lost"} · {status.leads_count ?? 0} leads
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => void move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === data.length - 1} onClick={() => void move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(status)} disabled={disabled}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete status" onClick={() => setDeleting(status)} disabled={disabled}>
                    <Trash2 className="text-danger" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {creating && <StatusFormModal editing={null} onClose={() => setCreating(false)} />}
      {editing && <StatusFormModal editing={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteStatusModal status={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

function SourceFormModal({
  editing,
  onClose,
}: {
  editing: LeadSource | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateLeadSource();
  const update = useUpdateLeadSource();
  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState(editing?.color ?? "#22c55e");
  const [icon, setIcon] = useState(editing?.icon ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [isDefault, setIsDefault] = useState(editing?.is_default ?? false);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError("A name is required.");
      return;
    }
    const values = { name: name.trim(), color, icon: icon.trim() || null, description: description.trim() || null, is_default: isDefault, is_active: isActive };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, values });
      else await create.mutateAsync(values);
      toast(editing ? "Lead source updated." : "Lead source created.", "success");
      onClose();
    } catch (err) {
      setError(formErrorMessage(err));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit source" : "Add source"}
      description="Sources identify where a lead came from."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add source"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput label="Name" placeholder="e.g. Google Ads" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-text">Color</label>
            <input
              type="color"
              aria-label="Color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-20 cursor-pointer rounded-lg border border-border bg-surface"
            />
          </div>
          <div className="flex-1">
            <TextInput label="Icon name (optional)" placeholder="e.g. globe" value={icon} onChange={(e) => setIcon(e.target.value)} />
          </div>
        </div>
        <TextInput label="Description" placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Toggle label="Set as default source" checked={isDefault} onChange={setIsDefault} />
        <Toggle label="Active" checked={isActive} onChange={setIsActive} />
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function SourcesTab({ disabled }: { disabled: boolean }) {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useLeadSources();
  const reorder = useReorderLeadSources();
  const del = useDeleteLeadSource();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LeadSource | null>(null);
  const [deleting, setDeleting] = useState<LeadSource | null>(null);

  const move = async (index: number, direction: -1 | 1) => {
    if (!data) return;
    const next = [...data];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await reorder.mutateAsync(next.map((s) => s.id));
      toast("Source order saved.", "success");
    } catch (err) {
      toast(formErrorMessage(err), "error");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast("Lead source deleted.", "success");
      setDeleting(null);
    } catch (err) {
      toast(formErrorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Lead sources"
        description="Where leads come from. One source can be the default for new leads."
        action={
          <Button size="sm" onClick={() => setCreating(true)} disabled={disabled}>
            <Plus data-slot="icon" /> Add source
          </Button>
        }
      >
        {isLoading && <SettingsSkeleton rows={5} />}
        {isError && <SettingsErrorState message="Unable to load lead sources." onRetry={() => void refetch()} />}
        {!isLoading && !isError && (!data || data.length === 0) && (
          <SettingsEmptyState title="No sources yet" description="Add your first lead source to get started." />
        )}
        {!isLoading && !isError && data && data.length > 0 && (
          <div className="divide-y divide-border/70">
            {data.map((source, i) => (
              <div key={source.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: source.color }} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">
                      {source.name}
                      {source.is_default && (
                        <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                          Default
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">{source.leads_count ?? 0} leads</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => void move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === data.length - 1} onClick={() => void move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(source)} disabled={disabled}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete source" onClick={() => setDeleting(source)} disabled={disabled}>
                    <Trash2 className="text-danger" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {creating && <SourceFormModal editing={null} onClose={() => setCreating(false)} />}
      {editing && <SourceFormModal editing={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title={`Delete "${deleting.name}"`}
          description="Leads using this source will be moved to the default 'Other' source."
          footer={
            <>
              <Button variant="outline" onClick={() => setDeleting(null)} disabled={del.isPending}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void confirmDelete()} disabled={del.isPending}>
                {del.isPending ? "Deleting…" : "Delete source"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted">This action cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rules (assignment / scoring / automation shared builders)           */
/* ------------------------------------------------------------------ */

const CONDITION_FIELD_OPTIONS = [
  { value: "stage", label: "Status" },
  { value: "source", label: "Source" },
  { value: "priority", label: "Priority" },
  { value: "score", label: "Score" },
  { value: "owner", label: "Owner" },
  { value: "team", label: "Team" },
  { value: "tags", label: "Tags" },
  { value: "country", label: "Country" },
  { value: "city", label: "City" },
  { value: "channel", label: "Channel" },
  { value: "created_at", label: "Created date" },
  { value: "assigned_at", label: "Assigned date" },
];

const CONDITION_OPERATOR_OPTIONS = [
  { value: "is", label: "is" },
  { value: "is_not", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "is_any_of", label: "is any of (comma-separated)" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "between", label: "between (min,max)" },
  { value: "is_empty", label: "is empty" },
];

const ASSIGNMENT_ACTION_OPTIONS = [
  { value: "assign_to_user", label: "Assign to user" },
  { value: "assign_to_team", label: "Assign to team" },
  { value: "add_tag", label: "Add tag" },
  { value: "set_status", label: "Set status (slug)" },
  { value: "set_source", label: "Set source (slug)" },
  { value: "set_priority", label: "Set priority" },
  { value: "increase_score", label: "Increase score" },
  { value: "send_whatsapp_message", label: "Send WhatsApp message" },
];

const AUTOMATION_ACTION_OPTIONS = [
  ...ASSIGNMENT_ACTION_OPTIONS,
  { value: "decrease_score", label: "Decrease score" },
  { value: "create_task", label: "Create task" },
  { value: "create_follow_up", label: "Create follow-up" },
];

const EMPTY_CONDITION: RuleCondition = { field: "stage", operator: "is", value: "" };

function ConditionsEditor({
  value,
  onChange,
  disabled,
}: {
  value: RuleCondition[];
  onChange: (next: RuleCondition[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text">Conditions</p>
      {value.length === 0 && <p className="text-xs text-muted">No conditions — rule applies to all leads.</p>}
      {value.map((cond, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Select
            className="w-36"
            aria-label="Field"
            value={cond.field}
            disabled={disabled}
            options={CONDITION_FIELD_OPTIONS}
            onChange={(e) => onChange(value.map((c, j) => (j === i ? { ...c, field: e.target.value } : c)))}
          />
          <Select
            className="w-44"
            aria-label="Operator"
            value={cond.operator}
            disabled={disabled}
            options={CONDITION_OPERATOR_OPTIONS}
            onChange={(e) => onChange(value.map((c, j) => (j === i ? { ...c, operator: e.target.value } : c)))}
          />
          <TextInput
            className="w-40"
            placeholder="Value"
            value={cond.value === null || cond.value === undefined ? "" : String(cond.value)}
            disabled={disabled || cond.operator === "is_empty"}
            onChange={(e) => onChange(value.map((c, j) => (j === i ? { ...c, value: e.target.value } : c)))}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove condition"
            disabled={disabled || value.length <= 1}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...value, { ...EMPTY_CONDITION }])}>
        <Plus data-slot="icon" /> Add condition
      </Button>
    </div>
  );
}

function ActionsEditor({
  value,
  onChange,
  actionOptions,
  disabled,
}: {
  value: RuleAction[];
  onChange: (next: RuleAction[]) => void;
  actionOptions: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text">Actions</p>
      {value.length === 0 && <p className="text-xs text-muted">No actions yet.</p>}
      {value.map((action, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Select
            className="w-52"
            aria-label="Action"
            value={action.type}
            disabled={disabled}
            options={actionOptions}
            onChange={(e) => onChange(value.map((a, j) => (j === i ? { ...a, type: e.target.value } : a)))}
          />
          <TextInput
            className="w-44"
            placeholder="Value (user id, tag, message…) — leave blank if none"
            value={action.value === null || action.value === undefined ? "" : String(action.value)}
            disabled={disabled}
            onChange={(e) => onChange(value.map((a, j) => (j === i ? { ...a, value: e.target.value } : a)))}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove action"
            disabled={disabled || value.length <= 1}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...value, { type: actionOptions[0].value, value: "" }])}>
        <Plus data-slot="icon" /> Add action
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Assignment                                                          */
/* ------------------------------------------------------------------ */

function AssignmentTab({
  settings,
  disabled,
  onChange,
}: {
  settings: LeadSettings;
  disabled: boolean;
  onChange: (next: LeadSettings) => void;
}) {
  const { toast } = useToast();
  const users = useUsers();
  const teams = useTeams();
  const rules = useLeadAssignmentRules();
  const create = useCreateLeadAssignmentRule();
  const update = useUpdateLeadAssignmentRule();
  const del = useDeleteLeadAssignmentRule();
  const reorder = useReorderLeadAssignmentRules();
  const [editing, setEditing] = useState<LeadAssignmentRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPriority, setEditPriority] = useState(0);
  const [editConditions, setEditConditions] = useState<RuleCondition[]>([]);
  const [editActions, setEditActions] = useState<RuleAction[]>([]);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const a = (patch: Partial<LeadSettings["assignment"]>) =>
    onChange({ ...settings, assignment: { ...settings.assignment, ...patch } });

  const strategy = settings.assignment.strategy;
  const selectedUserIds = settings.assignment.user_ids;

  const openCreate = () => {
    setEditing(null);
    setEditName("");
    setEditPriority(0);
    setEditConditions([{ ...EMPTY_CONDITION }]);
    setEditActions([{ type: "assign_to_user", value: "" }]);
    setRuleError(null);
    setCreating(true);
  };

  const openEdit = (rule: LeadAssignmentRule) => {
    setEditing(rule);
    setEditName(rule.name);
    setEditPriority(rule.priority);
    setEditConditions(rule.conditions.length > 0 ? rule.conditions : [{ ...EMPTY_CONDITION }]);
    setEditActions(rule.actions.length > 0 ? rule.actions : [{ type: "assign_to_user", value: "" }]);
    setRuleError(null);
    setCreating(true);
  };

  const saveRule = async () => {
    setRuleError(null);
    if (!editName.trim()) {
      setRuleError("A rule name is required.");
      return;
    }
    if (editConditions.length === 0 || editActions.length === 0) {
      setRuleError("Add at least one condition and one action.");
      return;
    }
    const values = {
      name: editName.trim(),
      priority: editPriority,
      is_active: true,
      conditions: editConditions,
      actions: editActions.filter((x) => x.type.trim() !== ""),
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, values });
      else await create.mutateAsync(values);
      toast(editing ? "Assignment rule updated." : "Assignment rule created.", "success");
      setCreating(false);
    } catch (err) {
      setRuleError(formErrorMessage(err));
    }
  };

  const deleteRule = async (rule: LeadAssignmentRule) => {
    try {
      await del.mutateAsync(rule.id);
      toast("Assignment rule deleted.", "success");
    } catch (err) {
      toast(formErrorMessage(err), "error");
    }
  };

  const moveRule = async (index: number, direction: -1 | 1) => {
    const list = rules.data;
    if (!list) return;
    const next = [...list];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await reorder.mutateAsync(next.map((r) => r.id));
    } catch (err) {
      toast(formErrorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard title="Assignment" description="How leads are assigned when created or when assignment rules run.">
        <SettingRow
          label="Automatic assignment"
          control={<Toggle label="Automatic assignment" checked={settings.assignment.enabled} disabled={disabled} onChange={(v) => a({ enabled: v })} />}
        />
        <SettingRow
          label="Strategy"
          control={
            <Select
              className="w-64"
              aria-label="Assignment strategy"
              value={strategy}
              disabled={disabled || !settings.assignment.enabled}
              options={STRATEGY_OPTIONS}
              onChange={(e) => a({ strategy: e.target.value as LeadSettings["assignment"]["strategy"] })}
            />
          }
        />
        {strategy === "user" && (
          <div className="rounded-xl border border-border/70 bg-bg/50 p-3">
            <p className="mb-2 text-xs font-medium text-muted">Assign to these users:</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {users.data?.map((u) => (
                <label key={u.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-bg">
                  <span className="truncate text-text">{u.name}</span>
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(u.id)}
                    disabled={disabled || !settings.assignment.enabled}
                    onChange={(e) =>
                      a({
                        user_ids: e.target.checked
                          ? [...selectedUserIds, u.id]
                          : selectedUserIds.filter((id) => id !== u.id),
                      })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                </label>
              ))}
            </div>
          </div>
        )}
        {strategy === "team" && (
          <div className="pl-3">
            <SearchableSelect
              options={teams.data?.map((t) => ({ value: String(t.id), label: t.name })) ?? []}
              value={settings.assignment.team_id ? String(settings.assignment.team_id) : ""}
              placeholder="Select team…"
              disabled={disabled || !settings.assignment.enabled || teams.isLoading}
              onChange={(v) => a({ team_id: v ? Number(v) : null })}
            />
          </div>
        )}
        <SettingRow
          label="Rolling period"
          description="Time window used for least-assigned and max-per-user calculations."
          control={
            <Select
              className="w-56"
              aria-label="Rolling period"
              value={settings.assignment.period}
              disabled={disabled || !settings.assignment.enabled}
              options={PERIOD_OPTIONS}
              onChange={(e) => a({ period: e.target.value as LeadSettings["assignment"]["period"] })}
            />
          }
        />
        <SettingRow
          label="Max leads per user per period"
          control={
            <NumberInput
              className="w-32"
              aria-label="Maximum leads per user"
              min={0}
              value={settings.assignment.max_per_user}
              disabled={disabled || !settings.assignment.enabled}
              onChange={(e) => a({ max_per_user: Number(e.target.value) || 0 })}
            />
          }
        />
        <SettingRow
          label="When the limit is reached"
          control={
            <Select
              className="w-64"
              aria-label="When limit reached"
              value={settings.assignment.when_limit_reached}
              disabled={disabled || !settings.assignment.enabled}
              options={LIMIT_OPTIONS}
              onChange={(e) => a({ when_limit_reached: e.target.value as LeadSettings["assignment"]["when_limit_reached"] })}
            />
          }
        />
        <SettingRow
          label="Skip offline users"
          description="Users marked offline are not considered for assignment."
          control={<Toggle label="Skip offline users" checked={settings.assignment.skip_offline} disabled={disabled || !settings.assignment.enabled} onChange={(v) => a({ skip_offline: v })} />}
        />
        <SettingRow
          label="Skip users on leave"
          control={<Toggle label="Skip users on leave" checked={settings.assignment.skip_on_leave} disabled={disabled || !settings.assignment.enabled} onChange={(v) => a({ skip_on_leave: v })} />}
        />
        <SettingRow
          label="Inside team assignment"
          control={
            <Select
              className="w-64"
              aria-label="Team strategy"
              value={settings.assignment.team_strategy}
              disabled={disabled || !settings.assignment.enabled}
              options={TEAM_STRATEGY_OPTIONS}
              onChange={(e) => a({ team_strategy: e.target.value as LeadSettings["assignment"]["team_strategy"] })}
            />
          }
        />
      </SettingsCard>

      <SettingsCard
        title="Assignment rules"
        description="Conditional rules that override default assignment. Rules are evaluated by priority."
        action={
          <Button size="sm" onClick={openCreate} disabled={disabled}>
            <Plus data-slot="icon" /> Add rule
          </Button>
        }
      >
        {rules.isLoading && <SettingsSkeleton rows={3} />}
        {rules.isError && <SettingsErrorState message="Unable to load assignment rules." onRetry={() => void rules.refetch()} />}
        {!rules.isLoading && !rules.isError && (!rules.data || rules.data.length === 0) && (
          <SettingsEmptyState title="No assignment rules" description="Default assignment applies to all leads until rules are added." />
        )}
        {!rules.isLoading && !rules.isError && rules.data && rules.data.length > 0 && (
          <div className="divide-y divide-border/70">
            {rules.data.map((rule, i) => (
              <div key={rule.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{rule.name}</p>
                  <p className="text-xs text-muted">
                    Priority {rule.priority} · {rule.conditions.length || 0} condition(s) · {rule.actions.length || 0} action(s)
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => void moveRule(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === rules.data.length - 1} onClick={() => void moveRule(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(rule)} disabled={disabled}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete rule" onClick={() => void deleteRule(rule)} disabled={disabled}>
                    <Trash2 className="text-danger" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {creating && (
        <Modal
          open
          onClose={() => setCreating(false)}
          title={editing ? "Edit assignment rule" : "Add assignment rule"}
          description="Conditions decide which leads a rule applies to; actions decide what happens."
          size="lg"
          footer={
            <>
              <Button variant="outline" onClick={() => setCreating(false)} disabled={create.isPending || update.isPending}>
                Cancel
              </Button>
              <Button onClick={() => void saveRule()} disabled={create.isPending || update.isPending}>
                {(create.isPending || update.isPending) ? "Saving…" : editing ? "Save changes" : "Add rule"}
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            <div className="flex gap-4">
              <div className="flex-1">
                <TextInput label="Rule name" placeholder="e.g. High-value enquiries" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="w-32">
                <NumberInput label="Priority" min={0} value={editPriority} onChange={(e) => setEditPriority(Number(e.target.value) || 0)} />
              </div>
            </div>
            <ConditionsEditor value={editConditions} onChange={setEditConditions} />
            <ActionsEditor value={editActions} onChange={setEditActions} actionOptions={ASSIGNMENT_ACTION_OPTIONS} />
            {ruleError && <p className="text-sm text-danger">{ruleError}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

function ScoringTab({
  settings,
  disabled,
  onChange,
}: {
  settings: LeadSettings;
  disabled: boolean;
  onChange: (next: LeadSettings) => void;
}) {
  const { toast } = useToast();
  const rules = useLeadScoringRules();
  const create = useCreateLeadScoringRule();
  const update = useUpdateLeadScoringRule();
  const del = useDeleteLeadScoringRule();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LeadScoringRule | null>(null);
  const [editName, setEditName] = useState("");
  const [editPoints, setEditPoints] = useState(0);
  const [editConditions, setEditConditions] = useState<RuleCondition[]>([]);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const s = (patch: Partial<LeadSettings["scoring"]>) =>
    onChange({ ...settings, scoring: { ...settings.scoring, ...patch } });

  const ranges = settings.scoring.ranges;

  const setRange = (index: number, patch: Partial<ScoreRange>) =>
    s({ ranges: ranges.map((r, i) => (i === index ? { ...r, ...patch } : r)) });

  const openModal = (rule: LeadScoringRule | null) => {
    setEditing(rule);
    setEditName(rule?.name ?? "");
    setEditPoints(rule?.points ?? 0);
    setEditConditions(rule?.conditions.length ? rule.conditions : [{ ...EMPTY_CONDITION }]);
    setRuleError(null);
    setCreating(true);
  };

  const saveRule = async () => {
    setRuleError(null);
    if (!editName.trim()) {
      setRuleError("A rule name is required.");
      return;
    }
    const values = { name: editName.trim(), points: editPoints, conditions: editConditions.filter((c) => c.field.trim() !== "") };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, values });
      else await create.mutateAsync(values);
      toast(editing ? "Scoring rule updated." : "Scoring rule created.", "success");
      setCreating(false);
    } catch (err) {
      setRuleError(formErrorMessage(err));
    }
  };

  const deleteRule = async (rule: LeadScoringRule) => {
    try {
      await del.mutateAsync(rule.id);
      toast("Scoring rule deleted.", "success");
    } catch (err) {
      toast(formErrorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard title="Lead scoring" description="Score leads automatically and group them into ranges.">
        <SettingRow
          label="Enable lead scoring"
          control={<Toggle label="Enable lead scoring" checked={settings.scoring.enabled} disabled={disabled} onChange={(v) => s({ enabled: v })} />}
        />
        <div className="border-t border-border/70 pt-3">
          <p className="mb-3 text-sm font-medium text-text">Score ranges (0–100)</p>
          <div className="space-y-2">
            {ranges.map((range, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <TextInput className="w-32" value={range.name} aria-label="Range name" disabled={disabled || !settings.scoring.enabled} onChange={(e) => setRange(i, { name: e.target.value })} />
                <NumberInput className="w-20" value={range.min} min={0} max={100} aria-label="Minimum score" disabled={disabled || !settings.scoring.enabled} onChange={(e) => setRange(i, { min: Number(e.target.value) })} />
                <span className="text-xs text-muted">–</span>
                <NumberInput className="w-20" value={range.max} min={0} max={100} aria-label="Maximum score" disabled={disabled || !settings.scoring.enabled} onChange={(e) => setRange(i, { max: Number(e.target.value) })} />
                <input type="color" aria-label="Range color" value={range.color} disabled={disabled || !settings.scoring.enabled} onChange={(e) => setRange(i, { color: e.target.value })} className="h-8 w-12 cursor-pointer rounded-lg border border-border bg-surface" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove range"
                  disabled={disabled || !settings.scoring.enabled || ranges.length <= 1}
                  onClick={() => s({ ranges: ranges.filter((_, j) => j !== i) })}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={disabled || !settings.scoring.enabled || ranges.length >= 10}
            onClick={() => s({ ranges: [...ranges, { name: "New range", min: 0, max: 0, color: "#64748b" }] })}
          >
            <Plus data-slot="icon" /> Add range
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Scoring rules"
        description="Rules add or remove points when their conditions match."
        action={
          <Button size="sm" onClick={() => openModal(null)} disabled={disabled}>
            <Plus data-slot="icon" /> Add rule
          </Button>
        }
      >
        {rules.isLoading && <SettingsSkeleton rows={3} />}
        {rules.isError && <SettingsErrorState message="Unable to load scoring rules." onRetry={() => void rules.refetch()} />}
        {!rules.isLoading && !rules.isError && (!rules.data || rules.data.length === 0) && (
          <SettingsEmptyState title="No scoring rules" description="Add a rule that adds points when a lead matches its conditions." />
        )}
        {!rules.isLoading && !rules.isError && rules.data && rules.data.length > 0 && (
          <div className="divide-y divide-border/70">
            {rules.data.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{rule.name}</p>
                  <p className="text-xs text-muted">{rule.conditions.length || 0} condition(s)</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", rule.points >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
                    {rule.points >= 0 ? "+" : ""}
                    {rule.points}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => openModal(rule)} disabled={disabled}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete rule" onClick={() => void deleteRule(rule)} disabled={disabled}>
                    <Trash2 className="text-danger" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {creating && (
        <Modal
          open
          onClose={() => setCreating(false)}
          title={editing ? "Edit scoring rule" : "Add scoring rule"}
          size="lg"
          footer={
            <>
              <Button variant="outline" onClick={() => setCreating(false)} disabled={create.isPending || update.isPending}>
                Cancel
              </Button>
              <Button onClick={() => void saveRule()} disabled={create.isPending || update.isPending}>
                {(create.isPending || update.isPending) ? "Saving…" : editing ? "Save changes" : "Add rule"}
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            <div className="flex gap-4">
              <div className="flex-1">
                <TextInput label="Rule name" placeholder="e.g. Replied within an hour" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="w-40">
                <NumberInput label="Points" min={-1000} max={1000} value={editPoints} onChange={(e) => setEditPoints(Number(e.target.value) || 0)} />
              </div>
            </div>
            <ConditionsEditor value={editConditions} onChange={setEditConditions} />
            {ruleError && <p className="text-sm text-danger">{ruleError}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conversion                                                          */
/* ------------------------------------------------------------------ */

function ConversionTab({
  settings,
  disabled,
  onChange,
}: {
  settings: LeadSettings;
  disabled: boolean;
  onChange: (next: LeadSettings) => void;
}) {
  const statuses = useLeadStatuses();
  const pipelinesQuery = useQuery({ queryKey: ["pipelines"], queryFn: fetchPipelines });
  const c = (patch: Partial<LeadSettings["conversion"]>) =>
    onChange({ ...settings, conversion: { ...settings.conversion, ...patch } });

  const conv = settings.conversion;
  const selectedPipeline = pipelinesQuery.data?.find((p) => p.id === conv.default_pipeline_id);
  const stageOptions = selectedPipeline?.stages.map((st) => ({ value: String(st.id), label: st.name })) ?? [];
  const copyKeys = Object.keys(conv.copy) as Array<keyof (typeof conv.copy)>;
  const createKeys = Object.keys(conv.create) as Array<keyof (typeof conv.create)>;

  return (
    <div className="space-y-6">
      <SettingsCard title="Conversion" description="What happens when a lead is converted.">
        <SettingRow
          label="Enable conversion"
          control={<Toggle label="Enable conversion" checked={conv.enabled} disabled={disabled} onChange={(v) => c({ enabled: v })} />}
        />
        <div className="grid gap-2 border-t border-border/70 pt-3 sm:grid-cols-2">
          {createKeys.map((key) => (
            <SettingRow
              key={key}
              label={`Create ${key === "relationship" ? "relationship" : key === "deal" ? "deal" : key === "task" ? "task" : "follow-up"}`}
              control={<Toggle label={`Create ${key}`} checked={conv.create[key]} disabled={disabled || !conv.enabled} onChange={(v) => c({ create: { ...conv.create, [key]: v } })} />}
            />
          ))}
        </div>
        <SettingRow
          label="Create leads automatically from conversions"
          control={<Toggle label="Create automatically" checked={conv.create_deal_automatically} disabled={disabled || !conv.enabled} onChange={(v) => c({ create_deal_automatically: v })} />}
        />
      </SettingsCard>

      <SettingsCard title="Deal creation" description="Options used when a deal is created from a converted lead.">
        <SettingRow
          label="Default pipeline"
          control={
            <div className="w-64">
              <SearchableSelect
                options={pipelinesQuery.data?.map((p) => ({ value: String(p.id), label: p.name })) ?? []}
                value={conv.default_pipeline_id ? String(conv.default_pipeline_id) : ""}
                placeholder="Select pipeline…"
                disabled={disabled || !conv.enabled || pipelinesQuery.isLoading}
                onChange={(v) => c({ default_pipeline_id: v ? Number(v) : null, default_stage_id: null })}
              />
            </div>
          }
        />
        <SettingRow
          label="Default stage"
          control={
            <div className="w-64">
              <SearchableSelect
                options={stageOptions}
                value={conv.default_stage_id ? String(conv.default_stage_id) : ""}
                placeholder={!selectedPipeline ? "Select a pipeline first" : "Select stage…"}
                disabled={disabled || !conv.enabled || !selectedPipeline}
                onChange={(v) => c({ default_stage_id: v ? Number(v) : null })}
              />
            </div>
          }
        />
        <SettingRow
          label="Deal title template"
          description="Supports {contact_name} and {lead_source} placeholders."
          control={
            <TextInput className="w-72" value={conv.deal_title_template} disabled={disabled || !conv.enabled} onChange={(e) => c({ deal_title_template: e.target.value })} />
          }
        />
        <SettingRow
          label="Deal value"
          control={
            <Select
              className="w-64"
              aria-label="Deal value"
              value={conv.deal_value}
              disabled={disabled || !conv.enabled}
              options={DEAL_VALUE_OPTIONS}
              onChange={(e) => c({ deal_value: e.target.value as LeadSettings["conversion"]["deal_value"] })}
            />
          }
        />
        {conv.deal_value === "fixed" && (
          <div className="pl-3">
            <NumberInput className="w-48" aria-label="Fixed deal value" min={0} step={0.01} value={conv.fixed_value ?? 0} disabled={disabled || !conv.enabled} onChange={(e) => c({ fixed_value: Number(e.target.value) || null })} />
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="After conversion" description="What to copy into the deal and what happens to the lead.">
        <SettingRow
          label="Converted status"
          description="Status the lead moves to when converted (best set to your Won status)."
          control={
            <div className="w-64">
              <SearchableSelect
                options={statuses.data?.map((st) => ({ value: String(st.id), label: st.name })) ?? []}
                value={conv.converted_status_id ? String(conv.converted_status_id) : ""}
                placeholder="Select status…"
                disabled={disabled || !conv.enabled || statuses.isLoading}
                onChange={(v) => c({ converted_status_id: v ? Number(v) : null })}
              />
            </div>
          }
        />
        <div className="grid gap-2 border-t border-border/70 pt-3 sm:grid-cols-2">
          {copyKeys.map((key) => (
            <SettingRow
              key={key}
              label={`Copy ${key.replace(/_/g, " ")}`}
              control={<Toggle label={`Copy ${key}`} checked={conv.copy[key]} disabled={disabled || !conv.enabled} onChange={(v) => c({ copy: { ...conv.copy, [key]: v } })} />}
            />
          ))}
        </div>
        <SettingRow
          label="After conversion"
          control={
            <Select
              className="w-64"
              aria-label="After conversion"
              value={conv.after_conversion}
              disabled={disabled || !conv.enabled}
              options={AFTER_CONVERSION_OPTIONS}
              onChange={(e) => c({ after_conversion: e.target.value as LeadSettings["conversion"]["after_conversion"] })}
            />
          }
        />
      </SettingsCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Automation                                                          */
/* ------------------------------------------------------------------ */

function AutomationFormModal({
  editing,
  onClose,
}: {
  editing: LeadAutomation | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateLeadAutomation();
  const update = useUpdateLeadAutomation();
  const [name, setName] = useState(editing?.name ?? "");
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>(editing?.trigger_type ?? "lead_created");
  const [triggerValue, setTriggerValue] = useState(editing?.trigger_value ?? "");
  const [isActive, setIsActive] = useState(editing?.is_active ?? false);
  const [actions, setActions] = useState<RuleAction[]>(editing?.actions.length ? editing.actions : [{ type: "send_whatsapp_message", value: "" }]);
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;
  const needsValue = triggerType === "not_contacted_after" || triggerType === "no_response_after" || triggerType === "status_changed";

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError("A name is required.");
      return;
    }
    if (actions.length === 0) {
      setError("Add at least one action.");
      return;
    }
    const values = {
      name: name.trim(),
      trigger_type: triggerType,
      trigger_value: needsValue ? triggerValue.trim() || null : triggerValue.trim() || null,
      actions: actions.filter((x) => x.type.trim() !== ""),
      is_active: isActive,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, values });
      else await create.mutateAsync(values);
      toast(editing ? "Automation updated." : "Automation created.", "success");
      onClose();
    } catch (err) {
      setError(formErrorMessage(err));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit automation" : "Add automation"}
      description="Automations react to lead events."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add automation"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <TextInput label="Name" placeholder="e.g. Follow up after 24h" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-4">
          <div className="flex-1">
            <SelectField
              label="Trigger"
              options={AUTOMATION_TRIGGER_LABELS}
              value={triggerType}
              onChange={(v) => setTriggerType(v as AutomationTriggerType)}
            />
          </div>
          {needsValue && (
            <div className="flex-1">
              <TextInput
                label="Value"
                placeholder={triggerType === "status_changed" ? "Status slug" : "Hours"}
                value={triggerValue}
                onChange={(e) => setTriggerValue(e.target.value)}
              />
            </div>
          )}
        </div>
        {!needsValue && triggerValue && (
          <TextInput
            label="Value (optional)"
            placeholder="e.g. status slug"
            value={triggerValue}
            onChange={(e) => setTriggerValue(e.target.value)}
          />
        )}
        <ActionsEditor value={actions} onChange={setActions} actionOptions={AUTOMATION_ACTION_OPTIONS} />
        <Toggle label="Active" checked={isActive} onChange={setIsActive} />
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function AutomationsTab({ disabled }: { disabled: boolean }) {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useLeadAutomations();
  const setActive = useSetLeadAutomationActive();
  const del = useDeleteLeadAutomation();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LeadAutomation | null>(null);

  const toggleActive = async (automation: LeadAutomation) => {
    try {
      const result = await setActive.mutateAsync({ id: automation.id, active: !automation.is_active });
      toast(result.is_active ? "Automation enabled." : "Automation disabled.", "success");
    } catch (err) {
      toast(formErrorMessage(err), "error");
    }
  };

  const deleteAutomation = async (automation: LeadAutomation) => {
    try {
      await del.mutateAsync(automation.id);
      toast("Automation deleted.", "success");
    } catch (err) {
      toast(formErrorMessage(err), "error");
    }
  };

  const triggerLabel = (type: AutomationTriggerType) =>
    AUTOMATION_TRIGGER_LABELS.find((t) => t.value === type)?.label ?? type;

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Lead automations"
        description="Automate follow-ups, messaging, tasks and field updates when lead events fire."
        action={
          <Button size="sm" onClick={() => setCreating(true)} disabled={disabled}>
            <Plus data-slot="icon" /> Add automation
          </Button>
        }
      >
        {isLoading && <SettingsSkeleton rows={4} />}
        {isError && <SettingsErrorState message="Unable to load automations." onRetry={() => void refetch()} />}
        {!isLoading && !isError && (!data || data.length === 0) && (
          <SettingsEmptyState title="No automations" description="Add an automation to react to lead events automatically." />
        )}
        {!isLoading && !isError && data && data.length > 0 && (
          <div className="divide-y divide-border/70">
            {data.map((automation) => (
              <div key={automation.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{automation.name}</p>
                  <p className="text-xs text-muted">
                    On {triggerLabel(automation.trigger_type)}
                    {automation.trigger_value ? ` · ${automation.trigger_value}` : ""} · {automation.actions.length} action(s)
                    {automation.last_run_at ? ` · last run ${new Date(automation.last_run_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Toggle label="Active" checked={automation.is_active} onChange={() => void toggleActive(automation)} disabled={disabled} />
                  <Button variant="outline" size="sm" onClick={() => setEditing(automation)} disabled={disabled}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete automation" onClick={() => void deleteAutomation(automation)} disabled={disabled}>
                    <Trash2 className="text-danger" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {creating && <AutomationFormModal editing={null} onClose={() => setCreating(false)} />}
      {editing && <AutomationFormModal editing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Custom fields                                                       */
/* ------------------------------------------------------------------ */

const FIELD_TYPE_OPTIONS = [
  "text",
  "textarea",
  "number",
  "date",
  "date_time",
  "select",
  "multi_select",
  "checkbox",
  "url",
  "email",
  "phone",
].map((t) => ({ value: t, label: fieldTypeLabel(t as CustomFieldDefinition["field_type"]) }));

function CustomFieldFormModal({
  editing,
  onClose,
}: {
  editing: CustomFieldDefinition | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateCustomFieldDefinition("lead");
  const update = useUpdateCustomFieldDefinition("lead");
  const [name, setName] = useState(editing?.name ?? "");
  const [fieldType, setFieldType] = useState<string>(editing?.field_type ?? "text");
  const [options, setOptions] = useState(editing?.options ?? [{ label: "", value: "" }]);
  const [isRequired, setIsRequired] = useState(editing?.is_required ?? false);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;
  const needsOptions = fieldType === "select" || fieldType === "multi_select";

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError("A field name is required.");
      return;
    }
    const cleanedOptions = needsOptions ? options.filter((o) => o.label.trim() !== "" && o.value.trim() !== "") : undefined;
    if (needsOptions && (!cleanedOptions || cleanedOptions.length === 0)) {
      setError("Add at least one option for this field type.");
      return;
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values: { name: name.trim(), field_type: fieldType, options: cleanedOptions, is_required: isRequired, is_active: isActive } });
      } else {
        await create.mutateAsync({ entity_type: "lead", name: name.trim(), field_type: fieldType, options: cleanedOptions, is_required: isRequired, is_active: isActive });
      }
      toast(editing ? "Custom field updated." : "Custom field created.", "success");
      onClose();
    } catch (err) {
      setError(formErrorMessage(err));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit custom field" : "Add custom field"}
      description="Custom fields appear on lead records. These are shared with the contact entity."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add field"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput label="Field name" placeholder="e.g. Company size" value={name} onChange={(e) => setName(e.target.value)} />
        <SelectField label="Field type" options={FIELD_TYPE_OPTIONS} value={fieldType} onChange={setFieldType} />
        {needsOptions && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">Options</p>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInput className="flex-1" placeholder="Label" value={opt.label} onChange={(e) => setOptions(options.map((o, j) => (j === i ? { ...o, label: e.target.value } : o)))} />
                <TextInput className="flex-1" placeholder="Value" value={opt.value} onChange={(e) => setOptions(options.map((o, j) => (j === i ? { ...o, value: e.target.value } : o)))} />
                <Button variant="ghost" size="icon-sm" aria-label="Remove option" disabled={options.length <= 1} onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" disabled={options.length >= 20} onClick={() => setOptions([...options, { label: "", value: "" }])}>
              <Plus data-slot="icon" /> Add option
            </Button>
          </div>
        )}
        <Toggle label="Required" checked={isRequired} onChange={setIsRequired} />
        <Toggle label="Active" checked={isActive} onChange={setIsActive} />
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function FieldsTab({ disabled }: { disabled: boolean }) {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useCustomFieldDefinitions("lead");
  const reorder = useReorderCustomFieldDefinitions("lead");
  const del = useDeleteCustomFieldDefinition("lead");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDefinition | null>(null);

  const move = async (index: number, direction: -1 | 1) => {
    if (!data) return;
    const next = [...data];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await reorder.mutateAsync(next.map((f) => f.id));
      toast("Field order saved.", "success");
    } catch (err) {
      toast(formErrorMessage(err), "error");
    }
  };

  const deleteField = async (field: CustomFieldDefinition) => {
    try {
      await del.mutateAsync(field.id);
      toast("Custom field deleted.", "success");
    } catch (err) {
      toast(formErrorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Custom fields for leads"
        description="Add your own fields to lead records. Types with options need at least one option."
        action={
          <Button size="sm" onClick={() => setCreating(true)} disabled={disabled}>
            <Plus data-slot="icon" /> Add field
          </Button>
        }
      >
        {isLoading && <SettingsSkeleton rows={5} />}
        {isError && <SettingsErrorState message="Unable to load custom fields." onRetry={() => void refetch()} />}
        {!isLoading && !isError && (!data || data.length === 0) && (
          <SettingsEmptyState title="No custom fields" description="Custom fields apply to all leads in this workspace." />
        )}
        {!isLoading && !isError && data && data.length > 0 && (
          <div className="divide-y divide-border/70">
            {data.map((field, i) => (
              <div key={field.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {field.name}
                    {field.is_required && <span className="ml-2 text-xs text-danger">Required</span>}
                    {!field.is_active && <span className="ml-2 rounded-full bg-border/60 px-2 py-0.5 text-xs text-muted">Inactive</span>}
                  </p>
                  <p className="text-xs text-muted">{fieldTypeLabel(field.field_type)} · {field.key}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => void move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === data.length - 1} onClick={() => void move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(field)} disabled={disabled}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete field" onClick={() => void deleteField(field)} disabled={disabled}>
                    <Trash2 className="text-danger" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {creating && <CustomFieldFormModal editing={null} onClose={() => setCreating(false)} />}
      {editing && <CustomFieldFormModal editing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function LeadSettingsPage() {
  const canManage = usePermission("workspace.settings.manage");
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useLeadSettings();
  const update = useUpdateLeadSettings();

  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [draft, setDraft] = useState<LeadSettings>(DEFAULT_LEAD_SETTINGS);
  const [syncedJson, setSyncedJson] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const saved = useMemo(() => normalizeSettings(data?.settings), [data]);
  const savedJson = JSON.stringify(saved);
  if (savedJson !== syncedJson) {
    setSyncedJson(savedJson);
    setDraft(saved);
  }

  const dirty = syncedJson !== "" && JSON.stringify(draft) !== savedJson;

  const handleSave = async () => {
    setSaveError(null);
    try {
      await update.mutateAsync(draft);
      toast("Lead settings saved.", "success");
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
              { label: "CRM", href: "/settings/workspace/leads" },
              { label: "Lead Settings" },
            ]}
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text">Lead Settings</h1>
            <p className="mt-1 text-sm text-muted">
              Configure lead statuses, sources, assignment, scoring, conversion, automation and custom fields.
            </p>
          </div>
        </div>

        <SettingsTabs tabs={TABS} active={activeTab} onChange={(key) => setActiveTab(key as TabKey)} />

        {isLoading && <SettingsSkeleton rows={7} />}
        {isError && (
          <SettingsErrorState message="Unable to load lead settings." onRetry={() => void refetch()} />
        )}

        {!isLoading && !isError && (
          <>
            {activeTab === "general" && <GeneralTab settings={draft} disabled={!canManage} onChange={setDraft} />}
            {activeTab === "statuses" && <StatusesTab disabled={!canManage} />}
            {activeTab === "sources" && <SourcesTab disabled={!canManage} />}
            {activeTab === "assignment" && <AssignmentTab settings={draft} disabled={!canManage} onChange={setDraft} />}
            {activeTab === "scoring" && <ScoringTab settings={draft} disabled={!canManage} onChange={setDraft} />}
            {activeTab === "conversion" && <ConversionTab settings={draft} disabled={!canManage} onChange={setDraft} />}
            {activeTab === "automation" && <AutomationsTab disabled={!canManage} />}
            {activeTab === "fields" && <FieldsTab disabled={!canManage} />}
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