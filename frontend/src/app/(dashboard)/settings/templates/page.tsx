"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Copy, Search, Zap } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import {
  useCreateMessageTemplate,
  useDeleteMessageTemplate,
  useMessageTemplates,
  useUpdateMessageTemplate,
} from "@/hooks/use-message-templates";
import { ApiError } from "@/lib/api-client";
import type { MessageTemplate } from "@/lib/message-templates-api";
import { ErrorState } from "@/components/ui/error-state";

const CATEGORIES = ["Sales", "Support", "Follow-up", "Welcome", "General"];

function TemplateRow({
  template,
  onEdit,
  onDuplicate,
}: {
  template: MessageTemplate;
  onEdit: (template: MessageTemplate) => void;
  onDuplicate: (template: MessageTemplate) => void;
}) {
  const deleteMutation = useDeleteMessageTemplate();
  const updateMutation = useUpdateMessageTemplate();

  const onDelete = async () => {
    if (!window.confirm(`Delete "${template.name}"? This action cannot be undone.`)) {
      return;
    }
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
      <div className="flex flex-1 min-w-0 gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text">{template.name}</span>
            {template.shortcut && (
              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                <Zap className="h-3 w-3" />/{template.shortcut}
              </span>
            )}
            {template.category && (
              <span className="rounded bg-bg px-1.5 py-0.5 text-xs text-muted">
                {template.category}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted">{template.content}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleActive}
          disabled={updateMutation.isPending}
          className={`rounded-md px-2 py-1 text-xs font-medium ${
            template.is_active
              ? "bg-success/10 text-success"
              : "bg-bg text-muted"
          } hover:opacity-80 disabled:opacity-50`}
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
          onClick={() => onDuplicate(template)}
          className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-text"
          aria-label={`Duplicate ${template.name}`}
        >
          <Copy className="h-4 w-4" />
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

function TemplateForm({
  initial,
  onClose,
}: {
  initial?: MessageTemplate;
  onClose: () => void;
}) {
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
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: initial!.id,
          values: {
            name: name.trim(),
            shortcut: shortcut.trim() || null,
            content: content.trim(),
            category: category || null,
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          shortcut: shortcut.trim() || null,
          content: content.trim(),
          category: category || null,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save template.");
    }
  };

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-surface p-4 space-y-4">
      <h3 className="text-sm font-semibold text-text">
        {isEditing ? "Edit template" : "New template"}
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tpl-name" className="mb-1 block text-xs font-medium text-muted">
            Name *
          </label>
          <input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Welcome message"
            required
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
          />
        </div>
        <div>
          <label htmlFor="tpl-shortcut" className="mb-1 block text-xs font-medium text-muted">
            Shortcut (optional)
          </label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted">/</span>
            <input
              id="tpl-shortcut"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
              placeholder="welcome"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="tpl-category" className="mb-1 block text-xs font-medium text-muted">
          Category
        </label>
        <select
          id="tpl-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
        >
          <option value="">No category</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="tpl-content" className="mb-1 block text-xs font-medium text-muted">
          Content * — Use {"{{contact.first_name}}"}, {"{{deal.name}}"}, etc. for variables
        </label>
        <textarea
          id="tpl-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Hi {{contact.first_name}}, welcome to {{workspace.name}}!"
          required
          rows={5}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={mutation.isPending || !name.trim() || !content.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {mutation.isPending ? "Saving..." : isEditing ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-2 text-sm text-muted hover:text-text"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function TemplatesManager() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const { data: templates, isLoading, isError, refetch } = useMessageTemplates({
    search: search || undefined,
  });

  const handleEdit = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setShowForm(true);
  };

  const handleDuplicate = (template: MessageTemplate) => {
    setEditingTemplate(null);
    setShowForm(true);
    // Pre-fill would require lifting state; for now just open blank form
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTemplate(null);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Saved Replies</h1>
        <p className="mt-1 text-sm text-muted">
          Create message templates for quick responses. Use /shortcut in the composer to insert
          them instantly. Variables like {"{{contact.first_name}}"} are resolved automatically.
        </p>
      </div>

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
          onClick={() => {
            setEditingTemplate(null);
            setShowForm(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" /> New Reply
        </button>
      </div>

      {showForm && (
        <TemplateForm initial={editingTemplate ?? undefined} onClose={handleCloseForm} />
      )}

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text">Templates</h2>
        {isLoading && <p className="text-sm text-muted">Loading...</p>}
        {isError && (
          <ErrorState message="Unable to load templates." onRetry={() => refetch()} />
        )}
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
              <TemplateRow
                key={template.id}
                template={template}
                onEdit={handleEdit}
                onDuplicate={handleDuplicate}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function TemplatesSettingsPage() {
  return (
    <RequirePermission permission="templates.use">
      <TemplatesManager />
    </RequirePermission>
  );
}
