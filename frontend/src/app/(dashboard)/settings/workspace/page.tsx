"use client";

import { useState } from "react";
import {
  Settings,
  Tag,
  Zap,
  Plus,
  Trash2,
  Pencil,
  Search,
  ListChecks,
  Building2,
  BellRing,
  HardDrive,
  ShieldCheck,
  Database,
  Save,
  Upload,
  ImagePlus,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { useUpdateWorkspaceSettings, useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { useCreateLabel, useDeleteLabel, useLabelList, useUpdateLabel } from "@/hooks/use-labels";
import {
  useCreateMessageTemplate,
  useDeleteMessageTemplate,
  useMessageTemplates,
  useUpdateMessageTemplate,
} from "@/hooks/use-message-templates";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCustomFieldDefinitions,
  createCustomFieldDefinition,
  updateCustomFieldDefinition,
  deleteCustomFieldDefinition,
  type CustomFieldDefinition,
  type CustomFieldDefinitionFormValues,
} from "@/lib/custom-fields-api";
import { ApiError } from "@/lib/api-client";
import type { WorkspaceSettings } from "@/lib/workspace-api";
import type { LabelSummary } from "@/lib/conversations-api";
import type { MessageTemplate } from "@/lib/message-templates-api";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "labels", label: "Labels", icon: Tag },
  { id: "templates", label: "Templates", icon: Zap },
  { id: "custom-fields", label: "Custom Fields", icon: ListChecks },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ──────────────────────────────────────────────
// Shared UI primitives
// ──────────────────────────────────────────────

const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-accent-muted px-3.5 py-2 text-sm font-semibold text-accent-text shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50";

const btnSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50";

const btnGhost =
  "inline-flex items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50";

const inputCls =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted transition-colors focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20";

const fieldLabelCls = "mb-1.5 block text-xs font-medium text-muted";

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm",
        className
      )}
    >
      <header className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function InfoRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-xs font-medium text-muted">{k}</dt>
      <dd className="text-right text-sm text-text">{v}</dd>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          checked ? "bg-primary" : "bg-border"
        )}
      >
        <span
          className={cn(
            "inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-[3px]"
          )}
        />
      </button>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-bg/40 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium text-text">{title}</p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

function FeedbackBanner({
  tone,
  children,
  onDismiss,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm",
        tone === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rounded p-0.5 opacity-70 transition-opacity hover:opacity-100">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// General Tab
// ──────────────────────────────────────────────

const WS_TIMEZONES = [
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

function GeneralTab({ workspace }: { workspace: WorkspaceSettings }) {
  const updateMutation = useUpdateWorkspaceSettings();

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
    <div className="space-y-4">
      {error && (
        <FeedbackBanner tone="error" onDismiss={() => setError(null)}>
          {error}
        </FeedbackBanner>
      )}
      {saved && !error && <FeedbackBanner tone="success">Saved.</FeedbackBanner>}

      <SectionCard
        icon={Building2}
        title="Profile"
        description="Workspace name and the default timezone used for scheduling and reminders."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ws-name" className={fieldLabelCls}>
              Workspace name
            </label>
            <input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="ws-timezone" className={fieldLabelCls}>
              Timezone
            </label>
            <select
              id="ws-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={inputCls}
            >
              {WS_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-border/60 pt-4">
          <button type="button" onClick={onSaveProfile} disabled={updateMutation.isPending} className={btnPrimary}>
            <Save className="h-4 w-4" />
            {updateMutation.isPending ? "Saving..." : "Save profile"}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        icon={ImagePlus}
        title="Logo"
        description="Used for branding across the workspace."
      >
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          {workspace.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={workspace.logo_url}
              alt="Workspace logo"
              className="h-20 w-20 shrink-0 rounded-xl border border-border object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-bg/50 text-muted">
              <ImagePlus className="h-7 w-7" />
            </div>
          )}

          <div className="w-full min-w-0 flex-1">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-bg/40 px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 focus-within:outline focus-within:outline-2 focus-within:outline-primary">
              <Upload className="h-5 w-5 text-muted" />
              <span className="text-sm font-medium text-text">
                {logoFile ? logoFile.name : "Choose an image to upload"}
              </span>
              <span className="text-xs text-muted">PNG, JPG or SVG</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              onClick={onUploadLogo}
              disabled={!logoFile || updateMutation.isPending}
              className={cn(btnPrimary, "mt-3 w-full sm:w-auto")}
            >
              <Upload className="h-4 w-4" />
              {updateMutation.isPending ? "Uploading..." : "Upload logo"}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={BellRing}
        title="Notification defaults"
        description="Workspace-wide defaults for new users. Individual users can still override these on their own Notifications page."
      >
        <div className="divide-y divide-border/60">
          <Toggle
            checked={notifyEmail}
            onChange={setNotifyEmail}
            label="Email notifications"
            hint="New users receive email notifications by default"
          />
          <Toggle
            checked={notifyInApp}
            onChange={setNotifyInApp}
            label="In-app notifications"
            hint="New users receive in-app notifications by default"
          />
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-border/60 pt-4">
          <button type="button" onClick={onSaveProfile} disabled={updateMutation.isPending} className={btnSecondary}>
            <Save className="h-4 w-4" />
            {updateMutation.isPending ? "Saving..." : "Save notification defaults"}
          </button>
        </div>
      </SectionCard>

      <div className="grid gap-4 sm:grid-cols-2">
        <SectionCard icon={HardDrive} title="Storage configuration">
          <dl>
            <InfoRow k="Driver" v={workspace.storage.driver} />
            <InfoRow k="Bucket" v={workspace.storage.bucket ?? "—"} />
            <InfoRow k="Endpoint" v={workspace.storage.endpoint ?? "—"} />
          </dl>
        </SectionCard>

        <SectionCard icon={ShieldCheck} title="Security">
          <dl>
            <InfoRow k="Session lifetime" v={`${workspace.security.session_lifetime_minutes} minutes`} />
            <InfoRow k="Expires on browser close" v={workspace.security.session_expire_on_close ? "Yes" : "No"} />
            <InfoRow
              k="API token expiration"
              v={
                workspace.security.sanctum_token_expiration_minutes
                  ? `${workspace.security.sanctum_token_expiration_minutes} minutes`
                  : "Never"
              }
            />
          </dl>
        </SectionCard>
      </div>

      <SectionCard
        icon={Database}
        title="Data retention"
        description="No configurable retention policy exists yet — conversation, contact, and audit-log data is retained indefinitely. A future migration is needed to add a workspace-level retention window before this section can offer real controls."
      >
        <div className="rounded-lg border border-border/60 bg-bg/40 px-4 py-3 text-sm text-muted">
          Data is currently retained indefinitely.
        </div>
      </SectionCard>
    </div>
  );
}

// ──────────────────────────────────────────────
// Labels Tab
// ──────────────────────────────────────────────

const SWATCHES = [
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#6B7280",
];

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SWATCHES.map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={`Choose ${hex}`}
          onClick={() => onChange(hex)}
          className={cn(
            "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
            value === hex ? "border-text" : "border-transparent"
          )}
          style={{ backgroundColor: hex }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
        aria-label="Custom color"
      />
    </div>
  );
}

function LabelRow({ label }: { label: LabelSummary }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color_hex || "#6366F1");
  const [error, setError] = useState<string | null>(null);
  const updateMutation = useUpdateLabel();
  const deleteMutation = useDeleteLabel();

  const onSave = async () => {
    setError(null);
    try {
      await updateMutation.mutateAsync({ id: label.id, values: { name: name.trim(), color_hex: color } });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update label.");
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete "${label.name}"? It will be removed from every contact, deal, and conversation it's attached to.`)) {
      return;
    }
    setError(null);
    try {
      await deleteMutation.mutateAsync(label.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete label.");
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-bg px-3.5 py-2.5 transition-colors hover:border-primary/30 sm:flex-row sm:items-center sm:justify-between">
      {editing ? (
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="w-40 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <ColorPicker value={color} onChange={setColor} />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onSave}
              disabled={updateMutation.isPending}
              className={cn(btnPrimary, "px-2.5 py-1 text-xs")}
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(label.name);
                setColor(label.color_hex || "#6366F1");
              }}
              className="rounded-md px-2 py-1 text-xs text-muted hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group flex flex-1 items-center gap-2.5 text-left"
        >
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: label.color_hex || "#6366F1" }}
          />
          <span className="text-sm font-medium text-text group-hover:text-primary">{label.name}</span>
        </button>
      )}

      <button
        type="button"
        onClick={onDelete}
        disabled={deleteMutation.isPending}
        aria-label={`Delete ${label.name}`}
        className={cn(btnGhost, "shrink-0 text-danger hover:bg-danger/10 hover:text-danger")}
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </li>
  );
}

function LabelsTab() {
  const { data: labels, isLoading, isError, refetch } = useLabelList();
  const createMutation = useCreateLabel();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(SWATCHES[0]);
  const [createError, setCreateError] = useState<string | null>(null);

  const onCreate = async () => {
    if (!newName.trim()) return;
    setCreateError(null);
    try {
      await createMutation.mutateAsync({ name: newName.trim(), color_hex: newColor });
      setNewName("");
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Unable to create label.");
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard icon={Tag} title="New label" description="Labels can be attached to contacts, deals, and conversations.">
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) onCreate();
            }}
            placeholder="Label name"
            className={cn(inputCls, "w-52")}
          />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <button
            type="button"
            onClick={onCreate}
            disabled={createMutation.isPending || !newName.trim()}
            className={btnPrimary}
          >
            <Plus className="h-4 w-4" />
            {createMutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>
        {createError && <p className="mt-2.5 text-sm text-danger">{createError}</p>}
      </SectionCard>

      <SectionCard icon={Tag} title="Workspace labels" description={`${labels?.length ?? 0} label${(labels?.length ?? 0) === 1 ? "" : "s"} configured`}>
        {isLoading && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
        {isError && <ErrorState message="Unable to load labels." onRetry={() => refetch()} />}
        {!isLoading && !isError && (labels?.length ?? 0) === 0 && (
          <EmptyState icon={Tag} title="No labels yet" hint="Create one above to start organizing your workspace." />
        )}
        {!isLoading && !isError && labels && labels.length > 0 && (
          <ul className="space-y-2">
            {labels.map((label) => (
              <LabelRow key={label.id} label={label} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ──────────────────────────────────────────────
// Templates Tab
// ──────────────────────────────────────────────

const CATEGORIES = ["Sales", "Support", "Follow-up", "Welcome", "General"];

function TemplateRow({
  template,
  onEdit,
}: {
  template: MessageTemplate;
  onEdit: (template: MessageTemplate) => void;
}) {
  const deleteMutation = useDeleteMessageTemplate();
  const updateMutation = useUpdateMessageTemplate();

  const onDelete = async () => {
    if (!window.confirm(`Delete "${template.name}"? This action cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync(template.id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Unable to delete template.");
    }
  };

  const toggleActive = async () => {
    try {
      await updateMutation.mutateAsync({
        id: template.id,
        values: { is_active: !template.is_active },
      });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Unable to update template.");
    }
  };

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-bg px-3.5 py-3 transition-colors hover:border-primary/30 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-text">{template.name}</span>
          {template.shortcut && (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-medium text-primary">
              <Zap className="h-3 w-3" />/{template.shortcut}
            </span>
          )}
          {template.category && (
            <span className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs text-muted">
              {template.category}
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-2 text-xs text-muted">{template.content}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={toggleActive}
          disabled={updateMutation.isPending}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50",
            template.is_active ? "bg-success/10 text-success" : "bg-surface text-muted ring-1 ring-border"
          )}
        >
          {template.is_active ? "Active" : "Inactive"}
        </button>
        <button type="button" onClick={() => onEdit(template)} aria-label={`Edit ${template.name}`} className={btnGhost}>
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleteMutation.isPending}
          aria-label={`Delete ${template.name}`}
          className={cn(btnGhost, "text-danger hover:bg-danger/10 hover:text-danger")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function TemplateForm({ initial, onClose }: { initial?: MessageTemplate; onClose: () => void }) {
  const createMutation = useCreateMessageTemplate();
  const updateMutation = useUpdateMessageTemplate();
  const [name, setName] = useState(initial?.name ?? "");
  const [shortcut, setShortcut] = useState(initial?.shortcut ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(initial);
  const mutation = isEditing ? updateMutation : createMutation;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const values = {
        name: name.trim(),
        shortcut: shortcut.trim() || null,
        content: content.trim(),
        category: category || null,
      };
      if (isEditing) {
        await updateMutation.mutateAsync({ id: initial!.id, values });
      } else {
        await createMutation.mutateAsync(values);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save template.");
    }
  };

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-primary/30 bg-primary-soft/10 p-5">
      <h3 className="text-sm font-semibold text-text">{isEditing ? "Edit template" : "New template"}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tpl-name" className={fieldLabelCls}>Name *</label>
          <input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Welcome message"
            required
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="tpl-shortcut" className={fieldLabelCls}>Shortcut (optional)</label>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm text-muted">/</span>
            <input
              id="tpl-shortcut"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
              placeholder="welcome"
              className={inputCls}
            />
          </div>
        </div>
      </div>
      <div className="mt-4">
        <label htmlFor="tpl-category" className={fieldLabelCls}>Category</label>
        <select id="tpl-category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
          <option value="">No category</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>
      <div className="mt-4">
        <label htmlFor="tpl-content" className={fieldLabelCls}>
          Content * — Use {"{{contact.first_name}}"}, {"{{deal.name}}"}, etc. for variables
        </label>
        <textarea
          id="tpl-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Hi {{contact.first_name}}, welcome to {{workspace.name}}!"
          required
          rows={5}
          className={inputCls}
        />
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex items-center gap-2">
        <button type="submit" disabled={mutation.isPending || !name.trim() || !content.trim()} className={btnPrimary}>
          {mutation.isPending ? "Saving..." : isEditing ? "Update" : "Create"}
        </button>
        <button type="button" onClick={onClose} className={btnSecondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function TemplatesTab() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const { data: templates, isLoading, isError, refetch } = useMessageTemplates({
    search: search || undefined,
  });

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTemplate(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className={cn(inputCls, "pl-9")}
          />
        </div>
        <button
          type="button"
          onClick={() => { setEditingTemplate(null); setShowForm(true); }}
          className={btnPrimary}
        >
          <Plus className="h-4 w-4" /> New Reply
        </button>
      </div>

      {showForm && <TemplateForm initial={editingTemplate ?? undefined} onClose={handleCloseForm} />}

      <SectionCard
        icon={Zap}
        title="Templates"
        description="Saved replies you can expand with a /shortcut while chatting in the inbox."
      >
        {isLoading && <p className="py-6 text-center text-sm text-muted">Loading...</p>}
        {isError && <ErrorState message="Unable to load templates." onRetry={() => refetch()} />}
        {!isLoading && !isError && (templates?.length ?? 0) === 0 && (
          <EmptyState icon={Zap} title="No saved replies yet" hint="Create your first quick response above." />
        )}
        {!isLoading && !isError && templates && templates.length > 0 && (
          <ul className="space-y-2">
            {templates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                onEdit={(t) => { setEditingTemplate(t); setShowForm(true); }}
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ──────────────────────────────────────────────
// Custom Fields Tab
// ──────────────────────────────────────────────

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes/No" },
];

const ENTITY_TYPES = [
  { value: "contact", label: "Contact" },
  { value: "deal", label: "Deal" },
];

function FieldDefinitionForm({
  entityType,
  initial,
  onSave,
  onCancel,
}: {
  entityType: string;
  initial?: CustomFieldDefinition;
  onSave: (values: CustomFieldDefinitionFormValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [fieldType, setFieldType] = useState(initial?.field_type ?? "text");
  const [isRequired, setIsRequired] = useState(initial?.is_required ?? false);
  const [options, setOptions] = useState<string>(initial?.options?.map((o) => o.label).join("\n") ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const values: CustomFieldDefinitionFormValues = {
      entity_type: entityType,
      name,
      field_type: fieldType,
      is_required: isRequired,
      is_active: true,
    };
    if (fieldType === "select" && options.trim()) {
      values.options = options.split("\n").filter(Boolean).map((label) => ({
        label: label.trim(),
        value: label.trim().toLowerCase().replace(/\s+/g, "_"),
      }));
    }
    onSave(values);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-primary/30 bg-primary-soft/10 p-5">
      <h3 className="text-sm font-semibold text-text">
        {initial ? "Edit custom field" : `New ${entityType} field`}
      </h3>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={fieldLabelCls}>Field Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder="e.g. Industry"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className={fieldLabelCls}>Type</label>
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as CustomFieldDefinition["field_type"])}
            className={inputCls}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2.5 text-sm text-text">
        <input
          type="checkbox"
          checked={isRequired}
          onChange={(e) => setIsRequired(e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        Required field
      </label>

      {fieldType === "select" && (
        <div className="mt-4 space-y-1.5">
          <label className={fieldLabelCls}>Options (one per line)</label>
          <textarea
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            className={inputCls}
            rows={4}
            placeholder={"Option 1\nOption 2\nOption 3"}
          />
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2 border-t border-border/60 pt-4">
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Cancel
        </button>
        <button type="submit" className={btnPrimary}>
          {initial ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}

function CustomFieldsTab() {
  const [entityType, setEntityType] = useState("contact");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: definitions = [], isLoading } = useQuery({
    queryKey: ["custom-field-definitions", entityType],
    queryFn: () => fetchCustomFieldDefinitions(entityType),
  });

  const createMutation = useMutation({
    mutationFn: createCustomFieldDefinition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-field-definitions"] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CustomFieldDefinitionFormValues> }) => updateCustomFieldDefinition(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-field-definitions"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomFieldDefinition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-field-definitions"] });
    },
  });

  const handleSave = (values: CustomFieldDefinitionFormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const editingDef = editingId ? definitions.find((d) => d.id === editingId) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg p-1">
          {ENTITY_TYPES.map((et) => (
            <button
              key={et.value}
              onClick={() => { setEntityType(et.value); setShowForm(false); setEditingId(null); }}
              className={cn(
                "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
                entityType === et.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
              )}
            >
              {et.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className={btnPrimary}
        >
          <Plus className="h-4 w-4" /> Add Field
        </button>
      </div>

      <p className="text-sm text-muted">
        Define custom fields for <span className="font-medium capitalize text-text">{entityType}</span> records. They appear on{" "}
        {entityType === "contact" ? "contact" : "deal"} detail pages for the whole team.
      </p>

      {showForm && (
        <FieldDefinitionForm entityType={entityType} onSave={handleSave} onCancel={() => setShowForm(false)} />
      )}

      {editingDef && (
        <FieldDefinitionForm entityType={entityType} initial={editingDef} onSave={handleSave} onCancel={() => setEditingId(null)} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      ) : definitions.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={`No ${entityType} custom fields yet`}
          hint='Click "Add Field" to create one.'
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg/60 text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Key</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Required</th>
                  <th className="px-4 py-3 font-semibold">Active</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {definitions.map((def) => (
                  <tr key={def.id} className="border-b border-border transition-colors last:border-0 hover:bg-bg/40">
                    <td className="px-4 py-3 font-medium text-text">{def.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{def.key}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {FIELD_TYPES.find((t) => t.value === def.field_type)?.label ?? def.field_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {def.is_required ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-text">
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Yes
                        </span>
                      ) : (
                        <span className="text-xs text-muted">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                          def.is_active ? "bg-success/10 text-success" : "bg-bg text-muted"
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", def.is_active ? "bg-success" : "bg-muted")} />
                        {def.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setEditingId(def.id); setShowForm(false); }}
                        className="mr-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Delete this custom field? Existing data will not be removed.")) {
                            deleteMutation.mutate(def.id);
                          }
                        }}
                        className="inline-flex items-center gap-1 text-sm font-medium text-danger hover:underline"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Workspace Page
// ──────────────────────────────────────────────

function WorkspaceSettingsContent() {
  const { data: workspace, isLoading, isError } = useWorkspaceSettings();
  const [activeTab, setActiveTab] = useState<TabId>("general");

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 animate-pulse rounded-2xl bg-border/60" />
          <div className="space-y-2">
            <div className="h-6 w-56 animate-pulse rounded bg-border/60" />
            <div className="h-3.5 w-80 animate-pulse rounded bg-border/40" />
          </div>
        </div>
        <div className="h-12 animate-pulse rounded-xl bg-border/60" />
        <div className="h-64 animate-pulse rounded-xl bg-border/40" />
      </div>
    );
  }

  if (isError || !workspace) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger-light/30 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Unable to load workspace settings.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-muted text-accent-text shadow-md">
          <Building2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Workspace Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Manage workspace profile, branding, labels, saved replies, and custom fields.
          </p>
        </div>
      </header>

      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1 shadow-xs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-bg text-primary shadow-sm ring-1 ring-border/70"
                  : "text-muted hover:bg-bg/50 hover:text-text"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "general" && <GeneralTab workspace={workspace} />}
      {activeTab === "labels" && <LabelsTab />}
      {activeTab === "templates" && <TemplatesTab />}
      {activeTab === "custom-fields" && <CustomFieldsTab />}
    </div>
  );
}

export default function WorkspaceSettingsPage() {
  return (
    <RequirePermission permission="workspace.settings.manage">
      <WorkspaceSettingsContent />
    </RequirePermission>
  );
}
