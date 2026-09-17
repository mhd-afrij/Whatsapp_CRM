"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  GripVertical,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import {
  fieldTypeLabel,
  useCreateCustomFieldDefinition,
  useCustomFieldDefinitions,
  useDeleteCustomFieldDefinition,
  useUpdateCustomFieldDefinition,
} from "@/hooks/use-custom-fields";
import {
  useContactSettings,
  useUpdateContactSettings,
} from "@/hooks/use-contact-settings";
import { useContactTags, useCreateContactTag, useUpdateContactTag, useDeleteContactTag } from "@/hooks/use-contact-tags";
import type {
  ContactSettings as ContactSettingsShape,
  ContactLifecycleStatus,
} from "@/lib/contact-settings-api";
import type {
  CustomFieldDefinition,
  CustomFieldOption,
} from "@/lib/custom-fields-api";
import type { ContactTag } from "@/lib/contact-tags-api";
import {
  downloadContactsExport,
  importContacts,
  mergeDuplicateContacts,
  type DuplicateMergeDetail,
  type DuplicateMergeReport,
  type ImportRowResult,
} from "@/lib/contacts-api";
import { ApiError } from "@/lib/api-client";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SettingsSaveBar } from "@/components/settings/settings-save-bar";
import { SettingsCard, SettingRow } from "@/components/settings/settings-card";
import {
  SettingsEmptyState,
  SettingsErrorState,
  SettingsSkeleton,
} from "@/components/settings/settings-states";
import { Toggle } from "@/components/settings/toggle";
import { Badge } from "@/components/settings/badge";
import { TextInput } from "@/components/settings/text-input";
import { Select } from "@/components/settings/select";
import { SearchableSelect } from "@/components/settings/searchable-select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/providers/toast-provider";
import { useUsers } from "@/hooks/use-users";
import { COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";

type TabKey = "general" | "custom-fields" | "tags" | "duplicates" | "import-export";

/* ------------------------------------------------------------------ */
/* Persisted contact-settings model                                    */
/* ------------------------------------------------------------------ */

export const DEFAULT_CONTACT_SETTINGS: ContactSettingsShape = {
  identification: {
    name_format: "first_last",
    default_country_code: "+1",
    primary_identifier: "phone",
    require_phone: true,
    require_email: false,
    require_name: false,
  },
  whatsapp_creation: {
    auto_create: true,
    update_from_profile: true,
    save_profile_name: true,
    save_number: true,
  },
  ownership: {
    default_owner_user_id: null,
    default_team_id: null,
    allow_unassigned: true,
  },
  data_management: {
    allow_csv_import: true,
    allow_export: true,
    allow_archive: true,
    restrict_permanent_delete: true,
  },
  lifecycle: {
    statuses: [
      { key: "new", label: "New", color: "#0ea5e9", enabled: true, is_default: true },
      { key: "prospect", label: "Prospect", color: "#6366f1", enabled: true, is_default: false },
      { key: "lead", label: "Lead", color: "#f59e0b", enabled: true, is_default: false },
      { key: "customer", label: "Customer", color: "#22c55e", enabled: true, is_default: false },
      { key: "vip", label: "VIP", color: "#a855f7", enabled: true, is_default: false },
      { key: "inactive", label: "Inactive", color: "#64748b", enabled: true, is_default: false },
      { key: "lost", label: "Lost", color: "#ef4444", enabled: true, is_default: false },
    ],
  },
  duplicates: {
    match_phone: true,
    match_email: true,
    match_whatsapp_id: true,
    strategy: "warn_only",
  },
};

/** Deep-merge persisted JSON with defaults so older/missing keys still render. */
function normalizeContactSettings(raw: unknown): ContactSettingsShape {
  const base = JSON.parse(JSON.stringify(DEFAULT_CONTACT_SETTINGS)) as ContactSettingsShape;
  if (!raw || typeof raw !== "object") return base;
  const patch = raw as Partial<ContactSettingsShape>;
  return {
    identification: { ...base.identification, ...(patch.identification ?? {}) },
    whatsapp_creation: { ...base.whatsapp_creation, ...(patch.whatsapp_creation ?? {}) },
    ownership: { ...base.ownership, ...(patch.ownership ?? {}) },
    data_management: { ...base.data_management, ...(patch.data_management ?? {}) },
    lifecycle: {
      ...base.lifecycle,
      statuses:
        Array.isArray(patch.lifecycle?.statuses) && (patch.lifecycle?.statuses?.length ?? 0) > 0
          ? (patch.lifecycle.statuses as ContactSettingsShape["lifecycle"]["statuses"])
          : base.lifecycle.statuses,
    },
    duplicates: { ...base.duplicates, ...(patch.duplicates ?? {}) },
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

const FIELD_TYPES: Array<{ value: CustomFieldDefinition["field_type"]; label: string }> = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "date_time", label: "Date & time" },
  { value: "select", label: "Dropdown" },
  { value: "multi_select", label: "Multi-select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

const NAME_FORMATS = [
  { value: "first_last", label: "First name + Last name" },
  { value: "last_first", label: "Last name, First name" },
  { value: "single", label: "Single full name field" },
];

const PRIMARY_IDENTIFIERS = [
  { value: "phone", label: "Phone number" },
  { value: "email", label: "Email address" },
  { value: "whatsapp_id", label: "WhatsApp ID" },
];

const DUPLICATE_STRATEGIES = [
  { value: "warn_only", label: "Warn only" },
  { value: "prevent_creation", label: "Prevent creation" },
  { value: "auto_merge", label: "Automatically merge" },
];

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({
  value: `+${c.dial}`,
  label: `${c.code} (+${c.dial})`,
}));

/* ------------------------------------------------------------------ */
/* General tab                                                         */
/* ------------------------------------------------------------------ */

function GeneralTab({
  settings,
  users,
  disabled,
  onChange,
}: {
  settings: ContactSettingsShape;
  users: Array<{ id: number; name: string; email?: string | null }>;
  disabled: boolean;
  onChange: (next: ContactSettingsShape) => void;
}) {
  const idt = (patch: Partial<ContactSettingsShape["identification"]>) =>
    onChange({ ...settings, identification: { ...settings.identification, ...patch } });
  const wa = (patch: Partial<ContactSettingsShape["whatsapp_creation"]>) =>
    onChange({ ...settings, whatsapp_creation: { ...settings.whatsapp_creation, ...patch } });
  const own = (patch: Partial<ContactSettingsShape["ownership"]>) =>
    onChange({ ...settings, ownership: { ...settings.ownership, ...patch } });
  const dm = (patch: Partial<ContactSettingsShape["data_management"]>) =>
    onChange({ ...settings, data_management: { ...settings.data_management, ...patch } });

  const ownerOptions = useMemo(
    () => [
      { value: "", label: "None (unassigned)" },
      ...users.map((u) => ({
        value: String(u.id),
        label: u.name,
        hint: u.email ?? undefined,
      })),
    ],
    [users]
  );

  return (
    <div className="space-y-6">
      <SettingsCard title="Contact identification" description="How contact records are identified and required fields.">
        <SettingRow
          label="Name format"
          description="How full names are stored and displayed."
          control={
            <Select
              className="w-56"
              aria-label="Name format"
              value={settings.identification.name_format}
              disabled={disabled}
              options={NAME_FORMATS}
              onChange={(e) => idt({ name_format: e.target.value as ContactSettingsShape["identification"]["name_format"] })}
            />
          }
        />
        <SettingRow
          label="Default country code"
          description="Applied to phone numbers without an international prefix."
          control={
            <SearchableSelect
              className="w-56"
              placeholder="Default country code"
              value={settings.identification.default_country_code}
              disabled={disabled}
              options={COUNTRY_OPTIONS}
              onChange={(v) => idt({ default_country_code: v })}
            />
          }
        />
        <SettingRow
          label="Primary identifier"
          description="Used to match and merge contact records."
          control={
            <Select
              className="w-56"
              aria-label="Primary identifier"
              value={settings.identification.primary_identifier}
              disabled={disabled}
              options={PRIMARY_IDENTIFIERS}
              onChange={(e) =>
                idt({ primary_identifier: e.target.value as ContactSettingsShape["identification"]["primary_identifier"] })
              }
            />
          }
        />
        <SettingRow
          label="Require phone number"
          description="Block saving a contact without a phone number."
          control={<Toggle label="Require phone number" checked={settings.identification.require_phone} disabled={disabled} onChange={(v) => idt({ require_phone: v })} />}
        />
        <SettingRow
          label="Require email"
          description="Block saving a contact without an email address."
          control={<Toggle label="Require email" checked={settings.identification.require_email} disabled={disabled} onChange={(v) => idt({ require_email: v })} />}
        />
        <SettingRow
          label="Require contact name"
          description="Block saving a contact without a name."
          control={<Toggle label="Require contact name" checked={settings.identification.require_name} disabled={disabled} onChange={(v) => idt({ require_name: v })} />}
        />
      </SettingsCard>

      <SettingsCard title="WhatsApp contact creation" description="Behavior when a new WhatsApp conversation arrives.">
        <SettingRow
          label="Automatically create contacts from incoming WhatsApp conversations"
          control={<Toggle label="Auto-create contacts" checked={settings.whatsapp_creation.auto_create} disabled={disabled} onChange={(v) => wa({ auto_create: v })} />}
        />
        <SettingRow
          label="Update existing contacts from WhatsApp profile information"
          control={<Toggle label="Update from profile" checked={settings.whatsapp_creation.update_from_profile} disabled={disabled} onChange={(v) => wa({ update_from_profile: v })} />}
        />
        <SettingRow
          label="Save WhatsApp profile name"
          control={<Toggle label="Save profile name" checked={settings.whatsapp_creation.save_profile_name} disabled={disabled} onChange={(v) => wa({ save_profile_name: v })} />}
        />
        <SettingRow
          label="Save WhatsApp number automatically"
          control={<Toggle label="Save number automatically" checked={settings.whatsapp_creation.save_number} disabled={disabled} onChange={(v) => wa({ save_number: v })} />}
        />
      </SettingsCard>

      <SettingsCard title="Ownership" description="Who owns contacts by default.">
        <SettingRow
          label="Default contact owner"
          description="Assigned when no owner is specified (None = leave unassigned)."
          control={
            <SearchableSelect
              className="w-56"
              placeholder="Default contact owner"
              value={settings.ownership.default_owner_user_id === null ? "" : String(settings.ownership.default_owner_user_id)}
              disabled={disabled}
              options={ownerOptions}
              onChange={(v) => own({ default_owner_user_id: v === "" ? null : Number(v) })}
            />
          }
        />
        <SettingRow
          label="Allow unassigned contacts"
          description="Permit contacts that have no owner."
          control={<Toggle label="Allow unassigned contacts" checked={settings.ownership.allow_unassigned} disabled={disabled} onChange={(v) => own({ allow_unassigned: v })} />}
        />
      </SettingsCard>

      <SettingsCard title="Data management" description="Import, export, archive and deletion rules.">
        <SettingRow
          label="Allow CSV import"
          control={<Toggle label="Allow CSV import" checked={settings.data_management.allow_csv_import} disabled={disabled} onChange={(v) => dm({ allow_csv_import: v })} />}
        />
        <SettingRow
          label="Allow export"
          control={<Toggle label="Allow export" checked={settings.data_management.allow_export} disabled={disabled} onChange={(v) => dm({ allow_export: v })} />}
        />
        <SettingRow
          label="Allow archive"
          control={<Toggle label="Allow archive" checked={settings.data_management.allow_archive} disabled={disabled} onChange={(v) => dm({ allow_archive: v })} />}
        />
        <SettingRow
          label="Restrict permanent deletion"
          description="Only archived contacts can be permanently removed."
          control={<Toggle label="Restrict permanent deletion" checked={settings.data_management.restrict_permanent_delete} disabled={disabled} onChange={(v) => dm({ restrict_permanent_delete: v })} />}
        />
      </SettingsCard>

      <LifecycleCard settings={settings} disabled={disabled} onChange={onChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lifecycle (folded into General)                                     */
/* ------------------------------------------------------------------ */

function nextStatusKey(statuses: ContactLifecycleStatus[]): string {
  let max = 0;
  const used = new Set<string>();
  statuses.forEach((s) => {
    used.add(s.key);
    const m = s.key.match(/custom_(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  let candidate = "custom_1";
  let i = max + 1;
  while (used.has(candidate)) {
    candidate = `custom_${i}`;
    i += 1;
  }
  return candidate;
}

function LifecycleCard({
  settings,
  disabled,
  onChange,
}: {
  settings: ContactSettingsShape;
  disabled: boolean;
  onChange: (next: ContactSettingsShape) => void;
}) {
  const statuses = settings.lifecycle.statuses;
  const setStatuses = (next: ContactLifecycleStatus[]) =>
    onChange({ ...settings, lifecycle: { statuses: next } });
  const updateStatus = (index: number, patch: Partial<ContactLifecycleStatus>) => {
    const next = [...statuses];
    next[index] = { ...next[index], ...patch };
    setStatuses(next);
  };
  const setDefault = (index: number) =>
    setStatuses(statuses.map((s, i) => ({ ...s, is_default: i === index })));

  const addStatus = () => {
    const key = nextStatusKey(statuses);
    setStatuses([
      ...statuses,
      { key, label: "New status", color: "#64748b", enabled: true, is_default: false },
    ]);
  };

  const removeStatus = (index: number) => {
    const remaining = statuses.filter((_, i) => i !== index);
    if (remaining.length === 0) return;
    if (statuses[index].is_default) {
      remaining[0] = { ...remaining[0], is_default: true };
    }
    setStatuses(remaining);
  };

  const moveStatus = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= statuses.length) return;
    const next = [...statuses];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setStatuses(next);
  };

  return (
    <SettingsCard
      title="Lifecycle statuses"
      description="Configure the lifecycle values available to contacts. Changes are saved with the contact settings."
      action={
        <Button type="button" size="sm" disabled={disabled} onClick={addStatus}>
          <Plus className="h-4 w-4" /> Add Status
        </Button>
      }
    >
      {statuses.length === 0 ? (
        <SettingsEmptyState
          title="No lifecycle statuses"
          description="Add lifecycle stages so your team can track where every contact stands."
          action={
            <Button type="button" onClick={addStatus}>
              <Plus className="h-4 w-4" /> Add Status
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {statuses.map((status, index) => (
            <li
              key={status.key}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg/50 px-3 py-2.5 transition-colors",
                !status.enabled && "opacity-60"
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <label className="relative shrink-0" aria-label={`${status.label} color`}>
                <span
                  className="block h-6 w-6 rounded-full border border-black/10"
                  style={{ backgroundColor: status.color }}
                />
                <input
                  type="color"
                  value={status.color}
                  disabled={disabled}
                  onChange={(e) => updateStatus(index, { color: e.target.value })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
              </label>
              <input
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                value={status.label}
                disabled={disabled}
                aria-label="Status name"
                onChange={(e) => updateStatus(index, { label: e.target.value })}
              />
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="radio"
                  name="lifecycle-default"
                  checked={status.is_default}
                  disabled={disabled}
                  onChange={() => setDefault(index)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Default
              </label>
              <Toggle
                label={`${status.label} enabled`}
                checked={status.enabled}
                disabled={disabled}
                onChange={(v) => updateStatus(index, { enabled: v })}
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Move ${status.label} up`}
                  disabled={disabled || index === 0}
                  onClick={() => moveStatus(index, -1)}
                  className="rounded-md p-1 text-muted hover:bg-bg hover:text-text disabled:opacity-40"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${status.label} down`}
                  disabled={disabled || index === statuses.length - 1}
                  onClick={() => moveStatus(index, 1)}
                  className="rounded-md p-1 text-muted hover:bg-bg hover:text-text disabled:opacity-40"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${status.label}`}
                  disabled={disabled || statuses.length === 1}
                  onClick={() => removeStatus(index)}
                  className="rounded-md p-1 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}

/* ------------------------------------------------------------------ */
/* Custom Fields tab                                                   */
/* ------------------------------------------------------------------ */

type FieldRow = {
  id: number;
  name: string;
  key: string;
  field_type: CustomFieldDefinition["field_type"];
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
};

type FieldFormState = {
  name: string;
  field_type: CustomFieldDefinition["field_type"];
  is_required: boolean;
  is_active: boolean;
  options: CustomFieldOption[];
};

const EMPTY_FIELD_FORM: FieldFormState = {
  name: "",
  field_type: "text",
  is_required: false,
  is_active: true,
  options: [],
};

function CustomFieldEditor({
  title,
  initial,
  submitting,
  error,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: FieldFormState;
  submitting: boolean;
  error: string | null;
  onSubmit: (values: FieldFormState) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FieldFormState>(initial);

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
            <p className="text-xs text-muted">Custom fields are stored per workspace and rendered on contact forms.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-bg hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <TextInput
            label="Field name"
            description="Shown as the field label on contact forms."
            placeholder="e.g. LinkedIn URL"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Select
            label="Field type"
            description="Determines the input control used on forms."
            value={form.field_type}
            options={FIELD_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            onChange={(e) => setForm({ ...form, field_type: e.target.value as CustomFieldDefinition["field_type"] })}
          />

          {(form.field_type === "select" || form.field_type === "multi_select") && (
            <div className="rounded-xl border border-border bg-bg/60 p-3">
              <p className="mb-2 text-sm font-medium text-text">
                {form.field_type === "multi_select" ? "Multi-select options" : "Dropdown options"}
              </p>
              <div className="space-y-2">
                {form.options.length === 0 && <p className="text-xs text-muted">No options yet. Add at least one.</p>}
                {form.options.map((opt, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                      value={opt.label}
                      aria-label={`Option ${index + 1} label`}
                      placeholder="Label"
                      onChange={(e) => {
                        const next = [...form.options];
                        next[index] = { label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, "_") };
                        setForm({ ...form, options: next });
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`Remove option ${index + 1}`}
                      onClick={() => setForm({ ...form, options: form.options.filter((_, i) => i !== index) })}
                      className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setForm({ ...form, options: [...form.options, { label: "", value: "" }] })}
              >
                <Plus className="h-3.5 w-3.5" /> Add option
              </Button>
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-border bg-bg/60 p-3">
            <SettingRow
              label="Required"
              description="Contacts must provide a value before saving."
              control={<Toggle label="Required" checked={form.is_required} onChange={(v) => setForm({ ...form, is_required: v })} />}
            />
            <SettingRow
              label="Visible"
              description="Whether the field is shown on contact forms."
              control={<Toggle label="Visible" checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />}
            />
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
          <Button type="button" disabled={!form.name.trim() || submitting} onClick={() => onSubmit(form)}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Saving…" : "Save field"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  title,
  message,
  submitting,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text">{title}</h2>
            <p className="mt-1 text-sm text-muted">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={submitting} onClick={onConfirm}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CustomFieldsTab({ disabled }: { disabled: boolean }) {
  const { data, isLoading, isError, refetch } = useCustomFieldDefinitions("contact");
  const createField = useCreateCustomFieldDefinition("contact");
  const updateField = useUpdateCustomFieldDefinition("contact");
  const deleteField = useDeleteCustomFieldDefinition("contact");
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ row: FieldRow | null; open: boolean }>({ row: null, open: false });
  const [deleting, setDeleting] = useState<FieldRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const rows: FieldRow[] = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data
      .filter(
        (f) =>
          !q ||
          f.name.toLowerCase().includes(q) ||
          f.key.toLowerCase().includes(q) ||
          fieldTypeLabel(f.field_type).toLowerCase().includes(q)
      )
      .map((f) => ({
        id: f.id,
        name: f.name,
        key: f.key,
        field_type: f.field_type,
        is_required: f.is_required,
        is_active: f.is_active,
        sort_order: f.sort_order,
      }));
  }, [data, search]);

  const ordered = useMemo(() => [...rows].sort((a, b) => a.sort_order - b.sort_order), [rows]);

  const submitEditor = async (values: FieldFormState) => {
    setFormError(null);
    const isSelectLike = values.field_type === "select" || values.field_type === "multi_select";
    try {
      if (editing.row) {
        await updateField.mutateAsync({
          id: editing.row.id,
          values: {
            name: values.name.trim(),
            field_type: values.field_type,
            options: isSelectLike ? values.options.filter((o) => o.label.trim() !== "") : undefined,
            is_required: values.is_required,
            is_active: values.is_active,
          },
        });
      } else {
        await createField.mutateAsync({
          entity_type: "contact",
          name: values.name.trim(),
          field_type: values.field_type,
          options: isSelectLike ? values.options.filter((o) => o.label.trim() !== "") : undefined,
          is_required: values.is_required,
          is_active: values.is_active,
        });
      }
      setEditing({ row: null, open: false });
      toast("Custom field saved.", "success");
    } catch (err) {
      setFormError(formErrorMessage(err));
    }
  };

  const move = async (row: FieldRow, direction: -1 | 1) => {
    const target = ordered[ordered.findIndex((r) => r.id === row.id) + direction];
    if (!target) return;
    try {
      await Promise.all([
        updateField.mutateAsync({ id: row.id, values: { sort_order: target.sort_order } }),
        updateField.mutateAsync({ id: target.id, values: { sort_order: row.sort_order } }),
      ]);
    } catch (err) {
      toast(formErrorMessage(err), "error");
    }
  };

  const toggleActive = async (row: FieldRow, next: boolean) => {
    try {
      await updateField.mutateAsync({ id: row.id, values: { is_active: next } });
    } catch (err) {
      toast(formErrorMessage(err), "error");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteField.mutateAsync(deleting.id);
      toast("Custom field deleted.", "success");
      setDeleting(null);
    } catch (err) {
      toast(formErrorMessage(err), "error");
      setDeleting(null);
    }
  };

  const editorInitial: FieldFormState = useMemo(() => {
    const row = editing.row;
    if (!row) return EMPTY_FIELD_FORM;
    return {
      name: row.name,
      field_type: row.field_type,
      is_required: row.is_required,
      is_active: row.is_active,
      options: (data ?? []).find((f) => f.id === row.id)?.options ?? [],
    };
  }, [editing, data]);

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Custom Fields"
        description="Additional fields stored alongside contact records."
        action={
          <Button type="button" size="sm" disabled={disabled} onClick={() => { setFormError(null); setEditing({ row: null, open: true }); }}>
            <Plus className="h-4 w-4" /> Add Custom Field
          </Button>
        }
      >
        <div className="relative mb-4 w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fields…"
            aria-label="Search custom fields"
            className="w-full rounded-lg border border-border bg-bg py-2 pl-9 pr-3 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {isLoading && <SettingsSkeleton rows={4} />}
        {isError && <SettingsErrorState message="Unable to load custom fields." onRetry={() => void refetch()} />}

        {!isLoading && !isError && ordered.length === 0 && (
          <SettingsEmptyState
            title={search ? "No matching fields" : "No custom fields yet"}
            description={
              search
                ? "Try a different search term."
                : "Add custom fields to capture data that matters to your team."
            }
            action={
              search ? undefined : (
                <Button type="button" onClick={() => { setFormError(null); setEditing({ row: null, open: true }); }}>
                  <Plus className="h-4 w-4" /> Add Custom Field
                </Button>
              )
            }
          />
        )}

        {!isLoading && !isError && ordered.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead className="bg-bg text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">Field Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Required</th>
                  <th className="px-4 py-3">Visible</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((row) => (
                  <tr key={row.id} className="border-t border-border/70 transition-colors hover:bg-bg/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text">{row.name}</p>
                      <p className="font-mono text-xs text-muted">{row.key}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">{fieldTypeLabel(row.field_type)}</td>
                    <td className="px-4 py-3">
                      {row.is_required ? (
                        <Badge variant="warning">Required</Badge>
                      ) : (
                        <Badge variant="muted">Optional</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        label={`${row.name} visible`}
                        checked={row.is_active}
                        disabled={disabled || updateField.isPending}
                        onChange={(next) => void toggleActive(row, next)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${row.name} up`}
                          disabled={disabled || updateField.isPending}
                          onClick={() => void move(row, -1)}
                          className="rounded-md p-1 text-muted hover:bg-bg hover:text-text disabled:opacity-40"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${row.name} down`}
                          disabled={disabled || updateField.isPending}
                          onClick={() => void move(row, 1)}
                          className="rounded-md p-1 text-muted hover:bg-bg hover:text-text disabled:opacity-40"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={disabled}
                          onClick={() => {
                            setFormError(null);
                            setEditing({ row, open: true });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={disabled}
                          onClick={() => setDeleting(row)}
                        >
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
        <CustomFieldEditor
          title={editing.row ? "Edit custom field" : "Add custom field"}
          initial={editorInitial}
          submitting={createField.isPending || updateField.isPending}
          error={formError}
          onSubmit={(values) => void submitEditor(values)}
          onClose={() => setEditing({ row: null, open: false })}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          title="Delete custom field"
          message={`"${deleting.name}" will be removed from all contact forms. Contacts that already store data in this field may lose access to it when editing.`}
          submitting={deleteField.isPending}
          onConfirm={() => void confirmDelete()}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tags tab                                                            */
/* ------------------------------------------------------------------ */

type TagFormState = {
  name: string;
  color: string;
  description: string;
};

const EMPTY_TAG_FORM: TagFormState = { name: "", color: "#22c55e", description: "" };

const TAG_COLORS = ["#22c55e", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#64748b"];

function TagEditor({
  title,
  initial,
  submitting,
  error,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: TagFormState;
  submitting: boolean;
  error: string | null;
  onSubmit: (values: TagFormState) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<TagFormState>(initial);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-text">{title}</h2>
            <p className="text-xs text-muted">Tags are shared across the workspace and attach to contact records.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-bg hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-6 w-6 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: form.color }}
              aria-hidden
            />
            <div className="flex flex-wrap gap-1.5">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use color ${c}`}
                  aria-pressed={form.color === c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={cn(
                    "h-6 w-6 rounded-full border transition-transform focus-visible:outline-2 focus-visible:outline-primary",
                    form.color === c ? "scale-110 ring-2 ring-primary" : "border-black/10 hover:scale-110"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <TextInput
            label="Tag name"
            description="Shown on contact records and in filters."
            placeholder="e.g. VIP customer"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextInput
            label="Description"
            description="Optional internal note about when to use this tag."
            placeholder="e.g. Accounts spending over $5k / month"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
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
          <Button type="button" disabled={!form.name.trim() || submitting} onClick={() => onSubmit(form)}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Saving…" : "Save tag"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TagsTab({ disabled }: { disabled: boolean }) {
  const { data, isLoading, isError, refetch } = useContactTags();
  const createTag = useCreateContactTag();
  const updateTag = useUpdateContactTag();
  const deleteTag = useDeleteContactTag();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ tag: ContactTag | null; open: boolean }>({ tag: null, open: false });
  const [deleting, setDeleting] = useState<ContactTag | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return [...data]
      .sort((a, b) => a.sort_order - b.sort_order)
      .filter((t) => !q || t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q));
  }, [data, search]);

  const submitEditor = async (values: TagFormState) => {
    setFormError(null);
    try {
      if (editing.tag) {
        await updateTag.mutateAsync({ id: editing.tag.id, values: { name: values.name.trim(), color: values.color, description: values.description.trim() || null } });
        toast("Tag updated.", "success");
      } else {
        await createTag.mutateAsync({ name: values.name.trim(), color: values.color, description: values.description.trim() || null });
        toast("Tag created.", "success");
      }
      setEditing({ tag: null, open: false });
    } catch (err) {
      setFormError(formErrorMessage(err));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteTag.mutateAsync(deleting.id);
      toast("Tag deleted.", "success");
      setDeleting(null);
    } catch (err) {
      toast(formErrorMessage(err), "error");
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Tags"
        description="Categorize contacts with reusable color-coded labels."
        action={
          <Button type="button" size="sm" disabled={disabled} onClick={() => { setFormError(null); setEditing({ tag: null, open: true }); }}>
            <Plus className="h-4 w-4" /> Add Tag
          </Button>
        }
      >
        <div className="relative mb-4 w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tags…"
            aria-label="Search tags"
            className="w-full rounded-lg border border-border bg-bg py-2 pl-9 pr-3 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {isLoading && <SettingsSkeleton rows={4} />}
        {isError && <SettingsErrorState message="Unable to load tags." onRetry={() => void refetch()} />}

        {!isLoading && !isError && filtered.length === 0 && (
          <SettingsEmptyState
            title={search ? "No matching tags" : "No tags yet"}
            description={
              search
                ? "Try a different search term."
                : "Create tags so your team can group and filter contacts."
            }
            action={
              search ? undefined : (
                <Button type="button" onClick={() => { setFormError(null); setEditing({ tag: null, open: true }); }}>
                  <Plus className="h-4 w-4" /> Add Tag
                </Button>
              )
            }
          />
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <ul className="space-y-2">
            {filtered.map((tag) => (
              <li key={tag.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg/50 px-4 py-3">
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{tag.name}</p>
                  {tag.description && <p className="truncate text-xs text-muted">{tag.description}</p>}
                </div>
                <Badge variant="muted">
                  {tag.contacts_count ?? 0} contact{tag.contacts_count === 1 ? "" : "s"}
                </Badge>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                      setFormError(null);
                      setEditing({ tag, open: true });
                    }}
                  >
                    Edit
                  </Button>
                  <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={() => setDeleting(tag)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      {editing.open && (
        <TagEditor
          title={editing.tag ? "Edit tag" : "Add tag"}
          initial={
            editing.tag
              ? { name: editing.tag.name, color: editing.tag.color, description: editing.tag.description ?? "" }
              : EMPTY_TAG_FORM
          }
          submitting={createTag.isPending || updateTag.isPending}
          error={formError}
          onSubmit={(values) => void submitEditor(values)}
          onClose={() => setEditing({ tag: null, open: false })}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          title="Delete tag"
          message={`"${deleting.name}" will be removed from ${deleting.contacts_count ?? 0} contact(s). Contacts keep their data.`}
          submitting={deleteTag.isPending}
          onConfirm={() => void confirmDelete()}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Duplicate Rules tab                                                 */
/* ------------------------------------------------------------------ */

function DuplicatesTab({
  settings,
  disabled,
  onChange,
}: {
  settings: ContactSettingsShape;
  disabled: boolean;
  onChange: (next: ContactSettingsShape) => void;
}) {
  const { toast } = useToast();
  const dup = settings.duplicates;
  const setDup = (patch: Partial<ContactSettingsShape["duplicates"]>) =>
    onChange({ ...settings, duplicates: { ...dup, ...patch } });

  const [scanning, setScanning] = useState(false);
  const [merging, setMerging] = useState(false);
  const [report, setReport] = useState<DuplicateMergeReport | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const runScan = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const result = await mergeDuplicateContacts(true);
      setReport(result);
    } catch (err) {
      setScanError(formErrorMessage(err));
    } finally {
      setScanning(false);
    }
  };

  const runMerge = async () => {
    if (!report || report.groups === 0) return;
    const ok = window.confirm(
      `Merge ${report.groups} duplicate group(s) (${report.merged} contact(s) affected)? This action cannot be undone.`
    );
    if (!ok) return;
    setMerging(true);
    setScanError(null);
    try {
      const result = await mergeDuplicateContacts(false);
      setReport(result);
      toast("Duplicates merged.", "success");
    } catch (err) {
      setScanError(formErrorMessage(err));
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard title="Duplicate detection" description="Choose which values are used to detect duplicate contacts.">
        <SettingRow
          label="Match phone numbers"
          description="Treat contacts with the same normalized phone number as duplicates."
          control={<Toggle label="Match phone numbers" checked={dup.match_phone} disabled={disabled} onChange={(v) => setDup({ match_phone: v })} />}
        />
        <SettingRow
          label="Match email addresses"
          description="Treat contacts with the same email address as duplicates."
          control={<Toggle label="Match email addresses" checked={dup.match_email} disabled={disabled} onChange={(v) => setDup({ match_email: v })} />}
        />
        <SettingRow
          label="Match WhatsApp IDs"
          description="Treat contacts linked to the same WhatsApp account as duplicates."
          control={<Toggle label="Match WhatsApp IDs" checked={dup.match_whatsapp_id} disabled={disabled} onChange={(v) => setDup({ match_whatsapp_id: v })} />}
        />
        <SettingRow
          label="On duplicate"
          description="What happens when a duplicate contact is created."
          control={
            <Select
              className="w-56"
              aria-label="Duplicate strategy"
              value={dup.strategy}
              disabled={disabled}
              options={DUPLICATE_STRATEGIES}
              onChange={(e) =>
                setDup({ strategy: e.target.value as ContactSettingsShape["duplicates"]["strategy"] })
              }
            />
          }
        />
      </SettingsCard>

      <SettingsCard
        title="Find existing duplicates"
        description="Scan the contact database for records that match your detection rules."
        action={
          <Button type="button" size="sm" variant="outline" disabled={disabled || scanning} onClick={() => void runScan()}>
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {scanning ? "Scanning…" : "Find Existing Duplicates"}
          </Button>
        }
      >
        {scanError && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {scanError}
          </div>
        )}

        {!report && !scanError && (
          <p className="rounded-lg border border-dashed border-border bg-bg/40 p-4 text-sm text-muted">
            Run a scan to see duplicate contact groups before merging anything.
          </p>
        )}

        {report && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant={report.groups > 0 ? "warning" : "success"}>
                {report.groups} group{report.groups === 1 ? "" : "s"}
              </Badge>
              <Badge variant={report.merged > 0 ? "default" : "muted"}>
                {report.merged} contact{report.merged === 1 ? "" : "s"} affected
              </Badge>
              {report.details.length > 0 && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={disabled || merging || report.groups === 0}
                  onClick={() => void runMerge()}
                >
                  {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {merging ? "Merging…" : "Merge duplicates"}
                </Button>
              )}
            </div>

            {report.details.length === 0 ? (
              <p className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
                No duplicates found matching the current detection rules.
              </p>
            ) : (
              <ul className="space-y-2">
                {report.details.map((group) => (
                  <DuplicateGroupCard key={group.phone} group={group} />
                ))}
              </ul>
            )}
          </div>
        )}
      </SettingsCard>
    </div>
  );
}

function DuplicateGroupCard({ group }: { group: DuplicateMergeDetail }) {
  return (
    <li className="rounded-xl border border-border bg-bg/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-text">{group.phone}</p>
          <p className="text-xs text-muted">
            {group.kept_name ?? "Unnamed"} will survive; {group.merged.map((id) => `#${id}`).join(", ")} merged into it.
          </p>
        </div>
        <Badge variant="warning">{group.merged.length + 1} records</Badge>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Import & Export tab                                                 */
/* ------------------------------------------------------------------ */

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadErrorCsv(failed: ImportRowResult[]) {
  const lines = ["row,phone_number,errors"];
  failed.forEach((row) => {
    const phone = row.phone_number ?? "";
    const errors = (row.errors ?? []).join("; ");
    lines.push([String(row.row), csvEscape(phone), csvEscape(errors)].join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "import-errors.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function ImportExportTab({ disabled }: { disabled: boolean }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [report, setReport] = useState<{ created: ImportRowResult[]; failed: ImportRowResult[]; duplicates: ImportRowResult[] } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const runImport = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportError("Please choose a .csv file. XLSX import is coming soon.");
      return;
    }
    setImporting(true);
    setImportError(null);
    setReport(null);
    try {
      const result = await importContacts(file);
      setReport(result);
      const created = result.created.length;
      const failed = result.failed.length;
      const dupes = result.duplicates.length;
      if (failed > 0) {
        toast(`Imported ${created}, skipped ${dupes}, failed ${failed}.`, "error");
      } else {
        toast(`Imported ${created} contact${created === 1 ? "" : "s"}.`, "success");
      }
    } catch (err) {
      setImportError(formErrorMessage(err));
      toast("Import failed.", "error");
    } finally {
      setImporting(false);
    }
  };

  const runExport = async () => {
    setExporting(true);
    try {
      await downloadContactsExport();
      toast("Contact export started — check your downloads.", "success");
    } catch (err) {
      toast(formErrorMessage(err), "error");
    } finally {
      setExporting(false);
    }
  };

  const total =
    (report?.created.length ?? 0) + (report?.failed.length ?? 0) + (report?.duplicates.length ?? 0);

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Import contacts"
        description="Upload a CSV of contacts. Existing records are matched by phone/email and skipped as duplicates."
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          className="hidden"
          disabled={disabled || importing}
          onChange={(e) => {
            const file = e.target.files?.[0];
            setFileName(file?.name ?? null);
            if (file) void runImport(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || importing}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-bg/40 px-6 py-10 text-center transition-colors hover:border-primary/40 hover:bg-bg disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {importing ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          ) : (
            <Upload className="h-8 w-8 text-muted" aria-hidden />
          )}
          <p className="text-sm font-medium text-text">
            {importing ? "Importing…" : fileName ? fileName : "Click to choose a CSV file"}
          </p>
          <p className="text-xs text-muted">
            Columns: full_name, email, phone_number, company, address, city, country, custom field keys.
          </p>
        </button>

        {importing && (
          <div className="mt-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Uploading and processing…</span>
              <span>checking duplicates</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
            </div>
          </div>
        )}

        {importError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {importError}
          </div>
        )}

        {report && !importing && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-center">
                <p className="text-2xl font-bold text-success">{report.created.length}</p>
                <p className="text-xs text-muted">Imported</p>
              </div>
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-center">
                <p className="text-2xl font-bold text-warning">{report.duplicates.length}</p>
                <p className="text-xs text-muted">Skipped (duplicates)</p>
              </div>
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-center">
                <p className="text-2xl font-bold text-danger">{report.failed.length}</p>
                <p className="text-xs text-muted">Failed</p>
              </div>
            </div>

            {report.failed.length > 0 && (
              <div className="rounded-xl border border-border bg-bg/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-text">
                    {report.failed.length} row{report.failed.length === 1 ? "" : "s"} failed validation
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={() => downloadErrorCsv(report.failed)}>
                    <Download className="h-3.5 w-3.5" /> Download errors
                  </Button>
                </div>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted">
                  {report.failed.slice(0, 50).map((row) => (
                    <li key={row.row}>
                      Row {row.row}: {(row.errors ?? ["Unknown error"]).join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="flex items-center gap-1.5 text-xs text-muted">
              {total} row{total === 1 ? "" : "s"} processed.
            </p>
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title="Export contacts"
        description="Download all contacts in the workspace as a CSV file."
        action={
          <Button type="button" size="sm" disabled={disabled || exporting} onClick={() => void runExport()}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        }
      >
        <p className="flex items-center gap-2 text-sm text-muted">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
          Exports include standard fields plus any custom fields configured for contacts.
        </p>
      </SettingsCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "general", label: "General" },
  { key: "custom-fields", label: "Custom Fields" },
  { key: "tags", label: "Tags" },
  { key: "duplicates", label: "Duplicate Rules" },
  { key: "import-export", label: "Import & Export" },
];

export default function ContactSettingsPage() {
  const canManage = usePermission("workspace.settings.manage");
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useContactSettings();
  const update = useUpdateContactSettings();
  const { data: usersData } = useUsers();

  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [draft, setDraft] = useState<ContactSettingsShape>(DEFAULT_CONTACT_SETTINGS);
  const [syncedJson, setSyncedJson] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync the draft from the persisted settings once they arrive (or refresh).
  // `syncedJson` tracks which server snapshot the draft was last aligned with
  // so we never clobber user edits when react-query re-renders.
  const saved = normalizeContactSettings(data?.settings);
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
      toast("Settings updated successfully.", "success");
    } catch (err) {
      setSaveError(formErrorMessage(err));
      toast(formErrorMessage(err), "error");
    }
  };

  const handleReset = () => {
    setDraft(saved);
    setSaveError(null);
  };

  const users = useMemo(() => (usersData ?? []).map((u) => ({ id: u.id, name: u.name, email: u.email })), [usersData]);

  return (
    <RequirePermission permission="workspace.settings.manage">
      <div className="space-y-6">
        <SettingsBreadcrumb
          items={[
            { label: "Settings", href: "/settings" },
            { label: "CRM", href: "/settings/workspace/contacts" },
            { label: "Contact Settings" },
          ]}
        />
        <SettingsPageHeader
          title="Contact Settings"
          description="Configure contact fields, identification, ownership, lifecycle, tags and duplicate handling."
          backHref="/settings"
        />

        <SettingsTabs tabs={TABS} active={activeTab} onChange={(key) => setActiveTab(key as TabKey)} />

        {isLoading && <SettingsSkeleton rows={6} />}
        {isError && (
          <SettingsErrorState message="Unable to load contact settings." onRetry={() => void refetch()} />
        )}

        {!isLoading && !isError && (
          <>
            {activeTab === "general" && (
              <GeneralTab settings={draft} users={users} disabled={!canManage} onChange={setDraft} />
            )}
            {activeTab === "custom-fields" && <CustomFieldsTab disabled={!canManage} />}
            {activeTab === "tags" && <TagsTab disabled={!canManage} />}
            {activeTab === "duplicates" && (
              <DuplicatesTab settings={draft} disabled={!canManage} onChange={setDraft} />
            )}
            {activeTab === "import-export" && <ImportExportTab disabled={!canManage} />}
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