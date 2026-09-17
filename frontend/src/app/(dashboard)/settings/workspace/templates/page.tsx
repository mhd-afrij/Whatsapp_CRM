"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsCard } from "@/components/settings/settings-card";
import { danger, input, primary, secondary } from "@/components/settings/styles";
import { ErrorState } from "@/components/ui/error-state";
import { Toggle } from "@/components/settings/toggle";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/api-client";
import {
  useCreateMessageTemplate,
  useDeleteMessageTemplate,
  useMessageTemplates,
  useUpdateMessageTemplate,
} from "@/hooks/use-message-templates";
import { previewTemplate, type MessageTemplate } from "@/lib/message-templates-api";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Eye,
  Zap,
  Loader2,
  MessageSquareText,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BREADCRUMBS = [
  { label: "Settings", href: "/settings" },
  { label: "Communication", href: "/settings" },
  { label: "Templates" },
];

const QUICK_REPLY_CATEGORIES = ["General", "Sales", "Support", "Follow-up", "Closing"];

// ── Template editor modal (create / edit) ───────────────────────

interface TemplateFormState {
  name: string;
  shortcut: string;
  content: string;
  category: string;
  is_active: boolean;
}

const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  name: "",
  shortcut: "",
  content: "",
  category: "General",
  is_active: true,
};

function TemplateModal({
  open,
  template,
  onClose,
  canManage,
}: {
  open: boolean;
  template: MessageTemplate | null;
  onClose: () => void;
  canManage: boolean;
}) {
  const { toast } = useToast();
  const create = useCreateMessageTemplate();
  const update = useUpdateMessageTemplate();
  const [form, setForm] = useState<TemplateFormState>(() =>
    template
      ? {
          name: template.name,
          shortcut: template.shortcut ?? "",
          content: template.content,
          category: template.category ?? "General",
          is_active: template.is_active,
        }
      : EMPTY_TEMPLATE_FORM
  );
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isEdit = Boolean(template);
  const pending = create.isPending || update.isPending;

  const onSubmit = async () => {
    setError(null);
    if (!form.name.trim() || !form.content.trim()) {
      setError("Name and message content are required.");
      return;
    }
    const values = {
      name: form.name.trim(),
      shortcut: form.shortcut.trim() || null,
      content: form.content.trim(),
      category: form.category,
      is_active: form.is_active,
    };
    try {
      if (template) {
        await update.mutateAsync({ id: template.id, values });
        toast("Template updated.", "success");
      } else {
        await create.mutateAsync(values);
        toast("Template created.", "success");
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save the template.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-text">
            <MessageSquareText className="h-5 w-5 text-primary" />
            {isEdit ? "Edit Quick Reply" : "New Quick Reply"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Name *</label>
              <input
                className={input}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Welcome Message"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Shortcut</label>
              <input
                className={input}
                value={form.shortcut}
                onChange={(e) => setForm({ ...form, shortcut: e.target.value.replace(/^\//, "").replace(/\s+/g, "-").toLowerCase() })}
                placeholder="e.g. welcome (type /welcome in chat)"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Category</label>
            <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {QUICK_REPLY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Message *</label>
            <textarea
              className={cn(input, "min-h-32 resize-y font-mono text-[13px]")}
              rows={6}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder={"Hi {{contact.first_name}}, thanks for reaching out! How can we help you today?"}
            />
            <p className="mt-1.5 text-xs text-muted">
              Variables like <code>{"{{contact.first_name}}"}</code> are resolved when the reply is sent.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-bg px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text">Active</p>
              <p className="text-xs text-muted">Inactive templates are hidden in the chat template picker.</p>
            </div>
            <Toggle label="Template active" checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
          </div>

          {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} className={secondary}>
            Cancel
          </button>
          <button type="button" onClick={() => void onSubmit()} disabled={pending || !canManage} className={primary}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Template"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Preview modal ───────────────────────────────────────────────

function PreviewModal({ template, onClose }: { template: MessageTemplate | null; onClose: () => void }) {
  const templateId = template?.id ?? null;
  const content = template?.content ?? "";

  const previewQuery = useQuery({
    queryKey: ["template-preview", templateId, content],
    queryFn: () => previewTemplate(content),
    enabled: templateId != null,
    staleTime: 30_000,
  });

  if (!template) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text">Preview: {template.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">
          {previewQuery.isPending ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : previewQuery.isError ? (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">Unable to render the preview.</p>
          ) : (
            <pre className="whitespace-pre-wrap rounded-xl border border-border bg-bg p-4 text-sm text-text">{previewQuery.data?.resolvedContent ?? template.content}</pre>
          )}
          <p className="mt-3 text-xs text-muted">Variables resolve against the contact when the message is sent.</p>
        </div>
        <div className="flex justify-end border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} className={secondary}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quick replies tab ───────────────────────────────────────────

function QuickRepliesTab({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const templates = useMessageTemplates({});
  const remove = useDeleteMessageTemplate();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [previewing, setPreviewing] = useState<MessageTemplate | null>(null);

  const filtered = useMemo(() => {
    const rows = templates.data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (categoryFilter && (row.category ?? "General") !== categoryFilter) return false;
      if (!q) return true;
      return [row.name, row.shortcut ?? "", row.content].some((value) => value.toLowerCase().includes(q));
    });
  }, [templates.data, search, categoryFilter]);

  const onDelete = async (template: MessageTemplate) => {
    if (!window.confirm(`Delete template "${template.name}"? Agents will no longer be able to use it.`)) return;
    try {
      await remove.mutateAsync(template.id);
      toast("Template deleted.", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to delete the template.", "error");
    }
  };

  return (
    <>
      <SettingsCard
        title="Quick Replies"
        description="Reusable responses agents can insert from the chat composer with /shortcut."
        action={
          canManage && (
            <button
              type="button"
              className={primary}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New Reply
            </button>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className={cn(input, "pl-9")}
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className={cn(input, "sm:max-w-44")} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {QUICK_REPLY_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">
            {filtered.length} of {templates.data?.length ?? 0}
          </span>
        </div>

        {templates.isLoading && <div className="mt-4 h-40 animate-pulse rounded-lg bg-bg" />}
        {templates.isError && (
          <div className="mt-4">
            <ErrorState message="Unable to load templates." onRetry={() => void templates.refetch()} />
          </div>
        )}

        {!templates.isLoading && !templates.isError && (
          <div className="mt-4 space-y-2">
            {filtered.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-bg p-8 text-center">
                <Zap className="mx-auto h-8 w-8 text-muted" />
                <p className="mt-3 text-sm font-medium text-text">
                  {templates.data?.length ? "No templates match your filters." : "No quick replies yet."}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {canManage ? "Create your first quick reply to help agents answer faster." : "Ask an admin to create quick replies for your team."}
                </p>
              </div>
            )}
            {filtered.map((template) => (
              <div key={template.id} className="rounded-xl border border-border bg-bg p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-text">{template.name}</h3>
                      {template.shortcut && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">/{template.shortcut}</span>
                      )}
                      {template.category && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">{template.category}</span>
                      )}
                      {!template.is_active && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">Inactive</span>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted">{template.content}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button type="button" className={secondary} onClick={() => setPreviewing(template)} title="Preview resolved variables">
                      <Eye className="h-4 w-4" />
                      Preview
                    </button>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          className={secondary}
                          onClick={() => {
                            setEditing(template);
                            setModalOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                        <button type="button" className={danger} onClick={() => void onDelete(template)} disabled={remove.isPending}>
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      <TemplateModal
        key={editing?.id ?? "new"}
        open={modalOpen}
        template={editing}
        canManage={canManage}
        onClose={() => setModalOpen(false)}
      />
      <PreviewModal template={previewing} onClose={() => setPreviewing(null)} />
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────

export default function TemplatesSettingsPage() {
  const canManage = usePermission("templates.manage");

  return (
    <RequirePermission permission="templates.use">
      <div className="space-y-6">
        <div className="space-y-4">
          <SettingsBreadcrumb items={BREADCRUMBS} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text">Quick Reply Templates</h1>
            <p className="mt-1 text-sm text-muted">Create reusable replies agents can insert from the chat composer.</p>
          </div>
        </div>

        <QuickRepliesTab canManage={canManage} />
      </div>
    </RequirePermission>
  );
}
