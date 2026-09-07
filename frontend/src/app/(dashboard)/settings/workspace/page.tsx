"use client";

import { useState } from "react";
import {
  Settings,
  Tag,
  Zap,
  Plus,
  Trash2,
  Pencil,
  Copy,
  Search,
  ListChecks,
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
      {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {saved && !error && (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">Saved.</p>
      )}

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
              {WS_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={onSaveProfile}
              disabled={updateMutation.isPending}
              className="rounded-md bg-gradient-to-r from-accent to-accent-muted px-3 py-1.5 text-sm font-semibold text-accent-text shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
            >
              Save profile
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Logo</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
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
              className="rounded-md bg-gradient-to-r from-accent to-accent-muted px-3 py-1.5 text-sm font-semibold text-accent-text shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
            >
              Upload
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Notification defaults</h2>
        <p className="mt-1 text-xs text-muted">
          Workspace-wide defaults for new users. Individual users can still override these on their
          own Notifications page.
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

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Data retention</h2>
        <p className="mt-1 text-sm text-muted">
          No configurable retention policy exists yet — conversation, contact, and audit-log data is
          retained indefinitely. A future migration is needed to add a workspace-level retention
          window before this section can offer real controls.
        </p>
      </section>
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
    <div className="flex items-center gap-1.5">
      {SWATCHES.map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={`Choose ${hex}`}
          onClick={() => onChange(hex)}
          className={cn("h-6 w-6 rounded-full border-2", value === hex ? "border-text" : "border-transparent")}
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
    <li className="flex flex-col gap-2 rounded-md border border-border bg-bg px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      {editing ? (
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text"
          />
          <ColorPicker value={color} onChange={setColor} />
          <button
            type="button"
            onClick={onSave}
            disabled={updateMutation.isPending}
            className="rounded-md bg-gradient-to-r from-accent to-accent-muted px-2 py-1 text-xs font-semibold text-accent-text shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(label.name);
              setColor(label.color_hex || "#6366F1");
            }}
            className="text-xs text-muted hover:text-text"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: label.color_hex || "#6366F1" }}
          />
          <span className="text-sm font-medium text-text">{label.name}</span>
        </button>
      )}

      <button
        type="button"
        onClick={onDelete}
        disabled={deleteMutation.isPending}
        aria-label={`Delete ${label.name}`}
        className="shrink-0 rounded-md p-1.5 text-danger hover:bg-danger/10 disabled:opacity-50"
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
      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text">New label</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Label name"
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
          />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <button
            type="button"
            onClick={onCreate}
            disabled={createMutation.isPending || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-accent to-accent-muted px-3 py-2 text-sm font-semibold text-accent-text shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>
        {createError && <p className="mt-2 text-sm text-danger">{createError}</p>}
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text">Workspace labels</h2>
        {isLoading && <p className="text-sm text-muted">Loading…</p>}
        {isError && <ErrorState message="Unable to load labels." onRetry={() => refetch()} />}
        {!isLoading && !isError && (labels?.length ?? 0) === 0 && (
          <p className="text-sm text-muted">No labels yet. Create one above.</p>
        )}
        {!isLoading && !isError && labels && labels.length > 0 && (
          <ul className="space-y-2">
            {labels.map((label) => (
              <LabelRow key={label.id} label={label} />
            ))}
          </ul>
        )}
      </div>
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
    <li className="flex flex-col gap-2 rounded-md border border-border bg-bg px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text">{template.name}</span>
          {template.shortcut && (
            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              <Zap className="h-3 w-3" />/{template.shortcut}
            </span>
          )}
          {template.category && (
            <span className="rounded bg-bg px-1.5 py-0.5 text-xs text-muted">{template.category}</span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted">{template.content}</p>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleActive}
          disabled={updateMutation.isPending}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium hover:opacity-80 disabled:opacity-50",
            template.is_active ? "bg-success/10 text-success" : "bg-bg text-muted"
          )}
        >
          {template.is_active ? "Active" : "Inactive"}
        </button>
        <button
          type="button"
          onClick={() => onEdit(template)}
          className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-text"
          aria-label={`Edit ${template.name}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleteMutation.isPending}
          aria-label={`Delete ${template.name}`}
          className="rounded-md p-1.5 text-danger hover:bg-danger/10 disabled:opacity-50"
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
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-surface p-4 space-y-4">
      <h3 className="text-sm font-semibold text-text">{isEditing ? "Edit template" : "New template"}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tpl-name" className="mb-1 block text-xs font-medium text-muted">Name *</label>
          <input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Welcome message" required className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted" />
        </div>
        <div>
          <label htmlFor="tpl-shortcut" className="mb-1 block text-xs font-medium text-muted">Shortcut (optional)</label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted">/</span>
            <input id="tpl-shortcut" value={shortcut} onChange={(e) => setShortcut(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))} placeholder="welcome" className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted" />
          </div>
        </div>
      </div>
      <div>
        <label htmlFor="tpl-category" className="mb-1 block text-xs font-medium text-muted">Category</label>
        <select id="tpl-category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text">
          <option value="">No category</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="tpl-content" className="mb-1 block text-xs font-medium text-muted">
          Content * — Use {"{{contact.first_name}}"}, {"{{deal.name}}"}, etc. for variables
        </label>
        <textarea id="tpl-content" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Hi {{contact.first_name}}, welcome to {{workspace.name}}!" required rows={5} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted" />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={mutation.isPending || !name.trim() || !content.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-accent to-accent-muted px-3 py-2 text-sm font-semibold text-accent-text shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50">
          {mutation.isPending ? "Saving..." : isEditing ? "Update" : "Create"}
        </button>
        <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-muted hover:text-text">Cancel</button>
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
            className="w-full rounded-md border border-border bg-bg py-2 pl-9 pr-3 text-sm text-text placeholder:text-muted"
          />
        </div>
        <button
          type="button"
          onClick={() => { setEditingTemplate(null); setShowForm(true); }}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-accent to-accent-muted px-3 py-2 text-sm font-semibold text-accent-text shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
        >
          <Plus className="h-4 w-4" /> New Reply
        </button>
      </div>

      {showForm && <TemplateForm initial={editingTemplate ?? undefined} onClose={handleCloseForm} />}

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text">Templates</h2>
        {isLoading && <p className="text-sm text-muted">Loading...</p>}
        {isError && <ErrorState message="Unable to load templates." onRetry={() => refetch()} />}
        {!isLoading && !isError && (templates?.length ?? 0) === 0 && (
          <div className="py-8 text-center">
            <Zap className="mx-auto h-8 w-8 text-muted/50" />
            <p className="mt-2 text-sm text-muted">No saved replies yet.</p>
            <p className="text-xs text-muted">Create your first quick response above.</p>
          </div>
        )}
        {!isLoading && !isError && templates && templates.length > 0 && (
          <ul className="space-y-2">
            {templates.map((template) => (
              <TemplateRow key={template.id} template={template} onEdit={(t) => { setEditingTemplate(t); setShowForm(true); }} />
            ))}
          </ul>
        )}
      </div>
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
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-text">Field Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
            placeholder="e.g. Industry"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-text">Type</label>
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as CustomFieldDefinition["field_type"])}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={isRequired}
          onChange={(e) => setIsRequired(e.target.checked)}
          className="rounded border-border"
        />
        Required field
      </label>

      {fieldType === "select" && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-text">Options (one per line)</label>
          <textarea
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
            rows={4}
            placeholder="Option 1&#10;Option 2&#10;Option 3"
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-sm text-text hover:bg-bg">
          Cancel
        </button>
        <button type="submit" className="rounded-md bg-gradient-to-r from-accent to-accent-muted px-3 py-1.5 text-sm font-semibold text-accent-text shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md">
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Define custom fields for contacts and deals.</p>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="rounded-md bg-gradient-to-r from-accent to-accent-muted px-4 py-2 text-sm font-semibold text-accent-text shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
        >
          Add Field
        </button>
      </div>

      <div className="flex gap-2">
        {ENTITY_TYPES.map((et) => (
          <button
            key={et.value}
            onClick={() => setEntityType(et.value)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium",
              entityType === et.value ? "bg-primary text-white" : "border border-border text-text hover:bg-bg"
            )}
          >
            {et.label}
          </button>
        ))}
      </div>

      {showForm && (
        <FieldDefinitionForm entityType={entityType} onSave={handleSave} onCancel={() => setShowForm(false)} />
      )}

      {editingDef && (
        <FieldDefinitionForm entityType={entityType} initial={editingDef} onSave={handleSave} onCancel={() => setEditingId(null)} />
      )}

      {isLoading ? (
        <div className="py-8 text-center text-muted">Loading...</div>
      ) : definitions.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-muted">
          No custom fields defined yet. Click "Add Field" to create one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-sm text-muted">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Key</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Required</th>
                <th className="p-3 font-medium">Active</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {definitions.map((def) => (
                <tr key={def.id} className="border-b border-border last:border-0 hover:bg-bg/50">
                  <td className="p-3 font-medium text-text">{def.name}</td>
                  <td className="p-3 font-mono text-sm text-muted">{def.key}</td>
                  <td className="p-3">
                    <span className="rounded bg-bg px-2 py-0.5 text-xs text-text">
                      {FIELD_TYPES.find((t) => t.value === def.field_type)?.label ?? def.field_type}
                    </span>
                  </td>
                  <td className="p-3 text-text">{def.is_required ? "Yes" : "No"}</td>
                  <td className="p-3 text-text">{def.is_active ? "Yes" : "No"}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => { setEditingId(def.id); setShowForm(false); }}
                      className="mr-2 text-sm text-primary hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Delete this custom field? Existing data will not be removed.")) {
                          deleteMutation.mutate(def.id);
                        }
                      }}
                      className="text-sm text-danger hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    return <p className="p-6 text-sm text-muted">Loading workspace settings…</p>;
  }

  if (isError || !workspace) {
    return <p className="p-6 text-sm text-danger">Unable to load workspace settings.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">Workspace Settings</h1>
        <p className="text-sm text-muted">
          Manage workspace profile, branding, labels, saved replies, and custom fields.
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
                activeTab === tab.id ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
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
