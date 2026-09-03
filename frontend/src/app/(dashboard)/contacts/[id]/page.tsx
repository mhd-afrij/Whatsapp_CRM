"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  MessageSquare,
  NotebookPen,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
} from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { useAuth } from "@/context/auth-context";
import {
  useContact,
  useUpdateContact,
  useArchiveContact,
  useRestoreContact,
  useContactRealtime,
} from "@/hooks/use-contacts";
import { useCreateNote, useNoteList, useUpdateNote, useDeleteNote } from "@/hooks/use-notes";
import {
  useTaskList,
  useCreateTask,
  useUpdateTask,
  useCompleteTask,
  useReopenTask,
  useDeleteTask,
} from "@/hooks/use-tasks";
import { useCreateConversation } from "@/hooks/use-conversations";
import { useUsers } from "@/hooks/use-users";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-connection";
import { ChatOverviewPanel } from "@/components/contacts/chat-overview-panel";
import { ContactForm } from "@/components/contacts/contact-form";
import { NewLeadModal } from "@/components/leads/new-lead-modal";
import { LabelPicker } from "@/components/labels/label-picker";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import type { ContactFormValues, ContactPriority, ContactStatus } from "@/lib/contacts-api";
import type { InternalNote } from "@/lib/notes-api";
import type { Task, TaskPriority } from "@/lib/tasks-api";

type TabId = "overview" | "chat" | "tasks" | "notes";

const PRIORITY_META: Record<ContactPriority | TaskPriority, { label: string; className: string }> = {
  low: { label: "Low", className: "border-border bg-bg text-muted" },
  normal: { label: "Normal", className: "border-border bg-bg text-text" },
  medium: { label: "Medium", className: "border-border bg-bg text-text" },
  high: { label: "High", className: "border-warning/40 bg-warning/10 text-warning-dark" },
  urgent: { label: "Urgent", className: "border-danger/40 bg-danger/10 text-danger" },
};

const STATUS_META: Record<ContactStatus, { label: string; dot: string }> = {
  active: { label: "Active", dot: "bg-success" },
  inactive: { label: "Inactive", dot: "bg-muted" },
};

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "chat", label: "Chat" },
  { id: "tasks", label: "Tasks" },
  { id: "notes", label: "Notes" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</h2>
  );
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface p-4", className)}>
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-3">{children}</div>
    </section>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : `Copy ${label}`}
      title={copied ? "Copied" : `Copy ${label}`}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }
      }}
      className="shrink-0 rounded-md p-1 text-muted hover:bg-primary-soft/50 hover:text-text"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function InfoRow({ label, value, copyable }: { label: string; value: ReactNode; copyable?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end gap-1 text-sm text-text">
        <span className="truncate">{value}</span>
        {copyable && <CopyButton text={copyable} label={label} />}
      </dd>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority | ContactPriority }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.normal;
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", meta.className)}>
      {meta.label}
    </span>
  );
}

function activityIcon(type: string, description: string | null) {
  const haystack = `${type} ${description ?? ""}`.toLowerCase();
  if (haystack.includes("message")) return MessageSquare;
  if (haystack.includes("task")) return ClipboardList;
  if (haystack.includes("note")) return NotebookPen;
  if (haystack.includes("label") || haystack.includes("agent") || haystack.includes("assigned")) return UserRound;
  return Activity;
}

function TaskDialog({
  open,
  onOpenChange,
  contactId,
  task,
  defaultAssigneeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: number;
  task?: Task | null;
  defaultAssigneeId?: number | null;
}) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask(task?.id ?? 0);
  const { data: users } = useUsers();
  // Mounted only while open (see ContactProfile), so lazy initializers reset
  // the form for each new/edited task.
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueAt, setDueAt] = useState(task?.due_at ? new Date(task.due_at).toISOString().slice(0, 16) : "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [assigneeId, setAssigneeId] = useState<string>(
    task?.assignee_id != null
      ? String(task.assignee_id)
      : defaultAssigneeId != null
        ? String(defaultAssigneeId)
        : ""
  );
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(task);

  const isPending = createTask.isPending || updateTask.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      contact_id: contactId,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      priority,
      assignee_id: assigneeId ? Number(assigneeId) : null,
    };
    const done = () => onOpenChange(false);
    const failed = (err: unknown) =>
      setError(err instanceof ApiError ? err.message : isEdit ? "Unable to update task." : "Unable to create task.");

    if (isEdit && task) {
      updateTask.mutate(payload, { onSuccess: done, onError: failed });
    } else {
      createTask.mutate(payload, { onSuccess: done, onError: failed });
    }
  };

  const fieldClass =
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit task" : "Create task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="space-y-1">
            <label htmlFor="task-title" className="text-sm font-medium text-text">
              Title *
            </label>
            <input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={fieldClass}
              placeholder="Follow up with contact"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="task-description" className="text-sm font-medium text-text">
              Description
            </label>
            <textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={cn(fieldClass, "min-h-16 resize-y")}
              placeholder="What needs to happen?"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="task-due" className="text-sm font-medium text-text">
                Due date &amp; time
              </label>
              <input
                id="task-due"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="task-priority" className="text-sm font-medium text-text">
                Priority
              </label>
              <select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className={fieldClass}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="task-assignee" className="text-sm font-medium text-text">
              Assign to
            </label>
            <select
              id="task-assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className={fieldClass}
            >
              <option value="">Unassigned</option>
              {(users ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : isEdit ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContactProfile({ id }: { id: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: contact, isLoading, isError } = useContact(id);
  const updateMutation = useUpdateContact(id);
  const archiveMutation = useArchiveContact();
  const restoreMutation = useRestoreContact();
  const createConversationMutation = useCreateConversation();
  const { data: notes } = useNoteList({ contact_id: id });
  const createNote = useCreateNote({ contact_id: id });
  const updateNote = useUpdateNote({ contact_id: id });
  const deleteNote = useDeleteNote({ contact_id: id });
  const { data: tasksPage } = useTaskList({ contact_id: id, per_page: 50 });
  const { data: users } = useUsers();
  const { data: whatsapp } = useWhatsappStatus();

  // Refresh the contact record when other agents update it in realtime.
  useContactRealtime();

  const { user } = useAuth();
  const hasBlanketEdit = usePermission("contacts.edit");
  const canCreate = usePermission("contacts.create");
  const isOwner = !!contact && contact.owner_user_id != null && Number(user?.id) === contact.owner_user_id;
  const canEdit = hasBlanketEdit || (isOwner && canCreate);
  const canDelete = usePermission("contacts.delete");
  const canCreateLead = usePermission("leads.manage");

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [editing, setEditing] = useState(() => searchParams?.get("edit") === "1");
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);

  // Notes editor state
  const [noteBody, setNoteBody] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteBody, setEditingNoteBody] = useState("");

  const contacts = contact?.conversations ?? [];
  const primaryConversationId = contacts[0]?.id ?? null;
  const name =
    contact?.full_name ||
    contact?.whatsapp_contact?.contact_name ||
    contact?.whatsapp_contact?.push_name ||
    contact?.phone_number ||
    "Unknown contact";
  const phoneNumber = contact?.phone_number ?? contact?.whatsapp_contact?.phone_number ?? null;
  const profilePicture = contact?.whatsapp_contact?.profile_picture_url ?? null;
  const hasWhatsappIdentity = Boolean(contact?.whatsapp_contact);

  const saving = updateMutation.isPending;
  const archived = Boolean(contact?.deleted_at);

  const handleToggleChat = async () => {
    if (!contact) return;
    if (contacts.length > 0) {
      router.push(`/inbox/${contacts[0].id}`);
    } else {
      try {
        const conversation = await createConversationMutation.mutateAsync(contact.id);
        router.push(`/inbox/${conversation.id}`);
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : "Unable to start conversation.");
      }
    }
  };

  const onSubmit = async (values: ContactFormValues) => {
    setFormError(null);
    try {
      await updateMutation.mutateAsync(values);
      setEditing(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unable to update contact.");
    }
  };

  const onArchive = async () => {
    if (!contact || !window.confirm("Archive this contact? You can restore it later from the archived state.")) return;
    setActionError(null);
    try {
      await archiveMutation.mutateAsync(contact.id);
      router.push("/contacts");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unable to archive contact.");
    }
  };

  const onRestore = async () => {
    if (!contact) return;
    setActionError(null);
    try {
      await restoreMutation.mutateAsync(contact.id);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unable to restore contact.");
    }
  };

  const patchContact = (values: ContactFormValues) => {
    updateMutation.mutate(values, {
      onError: (err) =>
        setActionError(err instanceof ApiError ? err.message : "Unable to update contact."),
    });
  };

  const handleCreateNote = (event: FormEvent) => {
    event.preventDefault();
    const body = noteBody.trim();
    if (!body) return;
    setNoteError(null);
    createNote.mutate(
      { contact_id: id, body },
      {
        onSuccess: () => setNoteBody(""),
        onError: (err) => setNoteError(err instanceof ApiError ? err.message : "Unable to save note."),
      }
    );
  };

  const saveNoteEdit = (note: InternalNote) => {
    const body = editingNoteBody.trim();
    if (!body) return;
    updateNote.mutate(
      { id: note.id, body },
      {
        onSuccess: () => setEditingNoteId(null),
        onError: (err) =>
          setActionError(err instanceof ApiError ? err.message : "Unable to update note."),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <div className="h-4 w-28 animate-pulse rounded bg-border/60" />
        <div className="h-40 animate-pulse rounded-2xl bg-border/60" />
        <div className="h-8 animate-pulse rounded-lg bg-border/60" />
        <div className="h-64 animate-pulse rounded-2xl bg-border/60" />
      </div>
    );
  }

  if (isError || !contact) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <p className="text-sm text-danger">
          Unable to load this contact. It may not exist or you may lack access.
        </p>
      </div>
    );
  }

  const openTasks = (tasksPage?.data ?? []).filter((t) => t.status === "open" || t.status === "in_progress");
  const doneTasks = (tasksPage?.data ?? []).filter((t) => t.status === "done");
  const tasksLoading = tasksPage === undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back to contacts
      </Link>

      {/* Identity header */}
      <section className="mt-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <Avatar name={name} src={profilePicture} size="lg" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-text">{name}</h1>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="truncate font-mono text-sm text-muted">{phoneNumber ?? "No phone number"}</span>
              {phoneNumber && <CopyButton text={phoneNumber} label="phone number" />}
            </div>
            <p className="mt-1 text-xs text-muted">
              {hasWhatsappIdentity ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-success" /> WhatsApp connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-muted" /> No WhatsApp identity
                </span>
              )}
              {whatsapp?.status === "connected" && hasWhatsappIdentity
                ? ` · gateway ${whatsapp.status}${whatsapp.phoneNumber ? ` (${whatsapp.phoneNumber})` : ""}`
                : ""}
            </p>
            {archived && (
              <p className="mt-1 text-xs font-medium text-warning">
                Archived on {formatDate(contact.deleted_at)}
              </p>
            )}
          </div>
        </div>

        {actionError && <p className="mt-3 text-sm text-danger">{actionError}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {!archived && (
            <>
              <Button
                variant="default"
                onClick={handleToggleChat}
                disabled={createConversationMutation.isPending}
              >
                <MessageSquare />
                {createConversationMutation.isPending ? "Starting…" : "Messages"}
              </Button>
              {canEdit && !editing && (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              {canCreateLead && !(contact.leads && contact.leads.length > 0) && (
                <Button variant="outline" onClick={() => setShowLeadModal(true)}>
                  <Plus /> Create lead
                </Button>
              )}
            </>
          )}
          {canDelete && !archived && (
            <Button variant="destructive" onClick={onArchive}>
              <Archive /> Archive
            </Button>
          )}
          {canDelete && archived && (
            <Button variant="outline" onClick={onRestore}>
              <RotateCcw /> Restore
            </Button>
          )}
        </div>
      </section>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-text"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {activeTab === "overview" && (
          <>
            {editing && !archived ? (
              <Card title="Edit contact">
                <ContactForm
                  defaultValues={{
                    full_name: contact.full_name ?? "",
                    email: contact.email ?? "",
                    phone_number: contact.phone_number ?? "",
                    address: contact.address ?? "",
                    city: contact.city ?? "",
                    country: contact.country ?? "",
                    timezone: contact.timezone ?? "",
                  }}
                  onSubmit={onSubmit}
                  submitLabel="Save changes"
                  serverError={formError}
                />
              </Card>
            ) : (
              <>
                <Card title="Contact">
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                    <InfoRow label="Email" value={contact.email || "—"} copyable={contact.email ?? undefined} />
                    <InfoRow
                      label="Phone"
                      value={phoneNumber || "—"}
                      copyable={phoneNumber ?? undefined}
                    />
                    <InfoRow
                      label="Address"
                      value={[contact.address, contact.city, contact.country].filter(Boolean).join(", ") || "—"}
                    />
                    <InfoRow label="Timezone" value={contact.timezone || "—"} />
                    <InfoRow
                      label="Source"
                      value={contact.source ? contact.source.charAt(0).toUpperCase() + contact.source.slice(1) : "—"}
                    />
                    <InfoRow label="Created" value={formatDateOnly(contact.created_at)} />
                  </dl>
                </Card>

                <Card title="CRM">
                  <dl className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-xs text-muted">Status</dt>
                      <dd>
                        <span
                          className={cn(
                            "mr-1.5 inline-block h-2 w-2 rounded-full align-middle",
                            STATUS_META[contact.status].dot
                          )}
                        />
                        <select
                          value={contact.status}
                          disabled={!canEdit || saving}
                          onChange={(e) => patchContact({ status: e.target.value as ContactStatus })}
                          className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                        {saving && <span className="ml-2 text-xs text-muted">Saving…</span>}
                      </dd>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-xs text-muted">Priority</dt>
                      <dd className="flex items-center gap-2">
                        <select
                          value={contact.priority}
                          disabled={!canEdit || saving}
                          onChange={(e) => patchContact({ priority: e.target.value as ContactPriority })}
                          className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                        >
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </dd>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-xs text-muted">Assigned agent</dt>
                      <dd>
                        <select
                          value={contact.owner_user_id ?? ""}
                          disabled={!canEdit || saving}
                          onChange={(e) =>
                            patchContact({ owner_user_id: e.target.value ? Number(e.target.value) : null })
                          }
                          className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                        >
                          <option value="">Unassigned</option>
                          {(users ?? []).map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </dd>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-xs text-muted">Labels</dt>
                      <dd className="min-w-0">
                        <LabelPicker
                          entity="contacts"
                          entityId={contact.id}
                          currentLabels={contact.labels}
                          canEdit={canEdit}
                        />
                      </dd>
                    </div>
                  </dl>
                </Card>

                <Card title="WhatsApp">
                  {hasWhatsappIdentity && contact.whatsapp_contact ? (
                    <dl className="space-y-2.5">
                      <InfoRow
                        label="WhatsApp name"
                        value={
                          contact.whatsapp_contact.contact_name ||
                          contact.whatsapp_contact.push_name ||
                          "—"
                        }
                      />
                      <InfoRow
                        label="Number"
                        value={contact.whatsapp_contact.phone_number || "—"}
                        copyable={contact.whatsapp_contact.phone_number ?? undefined}
                      />
                      <InfoRow
                        label="Last seen"
                        value={formatDate(contact.whatsapp_contact.last_seen_at)}
                      />
                      <InfoRow
                        label="Business account"
                        value={contact.whatsapp_contact.is_business ? "Yes" : "No"}
                      />
                    </dl>
                  ) : (
                    <p className="text-sm text-muted">Not linked to a WhatsApp contact yet.</p>
                  )}
                </Card>

                <Card title="Recent activity">
                  {contact.activities && contact.activities.length > 0 ? (
                    <ul className="space-y-3">
                      {contact.activities.map((a) => {
                        const Icon = activityIcon(a.activity_type, a.description);
                        return (
                          <li key={a.id} className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-dark">
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm text-text">{a.description || a.activity_type}</p>
                              <p className="text-xs text-muted">{formatDate(a.occurred_at)}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">No activity recorded yet.</p>
                  )}
                </Card>

                <Card title="Deals">
                  {contact.deals && contact.deals.length > 0 ? (
                    <ul className="space-y-1 text-sm">
                      {contact.deals.map((d) => (
                        <li key={d.id}>
                          <Link href={`/deals/${d.id}`} className="text-primary hover:underline">
                            {d.title}
                          </Link>{" "}
                          — {d.status}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">
                      No deals yet.{" "}
                      <Link href="/pipeline" className="text-primary hover:underline">
                        Create one from the pipeline board
                      </Link>
                      .
                    </p>
                  )}
                </Card>

                <Card title="Leads">
                  {contact.leads && contact.leads.length > 0 ? (
                    <ul className="space-y-1 text-sm">
                      {contact.leads.map((l) => (
                        <li key={l.id}>
                          <Link href={`/leads/${l.id}`} className="text-primary hover:underline">
                            Lead #{l.id}
                          </Link>{" "}
                          — {l.stage}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">
                      No leads for this contact yet.
                      {canCreateLead && (
                        <>
                          {" "}
                          <button
                            type="button"
                            onClick={() => setShowLeadModal(true)}
                            className="text-primary hover:underline"
                          >
                            Create a lead
                          </button>
                          .
                        </>
                      )}
                    </p>
                  )}
                </Card>
              </>
            )}
          </>
        )}

        {activeTab === "chat" && <ChatOverviewPanel conversationId={primaryConversationId} />}

        {activeTab === "tasks" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <SectionTitle>Tasks</SectionTitle>
              {!archived && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingTask(null);
                    setTaskDialogOpen(true);
                  }}
                >
                  <Plus /> Create task
                </Button>
              )}
            </div>

            {tasksLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-border/60" />
                ))}
              </div>
            ) : openTasks.length === 0 && doneTasks.length === 0 ? (
              <p className="text-sm text-muted">No tasks for this contact yet.</p>
            ) : (
              <>
                {openTasks.length > 0 && (
                  <TaskGroup
                    title="Open"
                    tasks={openTasks}
                    onEdit={(task) => {
                      setEditingTask(task);
                      setTaskDialogOpen(true);
                    }}
                  />
                )}
                {doneTasks.length > 0 && (
                  <TaskGroup
                    title="Completed"
                    tasks={doneTasks}
                    onEdit={(task) => {
                      setEditingTask(task);
                      setTaskDialogOpen(true);
                    }}
                  />
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "notes" && (
          <div className="space-y-4">
            <SectionTitle>Notes</SectionTitle>
            {archived ? (
              <p className="text-sm text-muted">Restore this contact to add notes.</p>
            ) : (
              <>
                <form onSubmit={handleCreateNote} className="space-y-2">
                  <textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="Add an internal note (never sent to WhatsApp)…"
                    className="min-h-20 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {noteError && <p className="text-xs text-danger">{noteError}</p>}
                  <Button type="submit" disabled={createNote.isPending || !noteBody.trim()}>
                    {createNote.isPending ? "Saving…" : "Add note"}
                  </Button>
                </form>

                <div className="space-y-2">
                  {(notes ?? []).map((note) =>
                    editingNoteId === note.id ? (
                      <div key={note.id} className="rounded-2xl border border-border bg-surface p-3">
                        <textarea
                          value={editingNoteBody}
                          onChange={(e) => setEditingNoteBody(e.target.value)}
                          className="min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            disabled={updateNote.isPending}
                            onClick={() => saveNoteEdit(note)}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingNoteId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div key={note.id} className="rounded-2xl border border-border bg-surface p-3">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                          <span className="flex items-center gap-1.5">
                            <NotebookPen className="h-3 w-3" />
                            {note.author?.name ?? "Unknown"} · {new Date(note.created_at).toLocaleString()}
                          </span>
                          <span className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(note.id);
                                setEditingNoteBody(note.body);
                              }}
                              className="rounded p-1 text-muted hover:bg-primary-soft/50 hover:text-text"
                              aria-label="Edit note"
                            >
                              <NotebookPen className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm("Delete this note?")) deleteNote.mutate(note.id);
                              }}
                              className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger"
                              aria-label="Delete note"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-text">{note.body}</p>
                      </div>
                    )
                  )}
                  {(notes ?? []).length === 0 && (
                    <p className="text-sm text-muted">No notes for this contact yet.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {taskDialogOpen && (
        <TaskDialog
          open={taskDialogOpen}
          onOpenChange={setTaskDialogOpen}
          contactId={id}
          task={editingTask}
          defaultAssigneeId={contact.owner_user_id}
        />
      )}

      {showLeadModal && <NewLeadModal onClose={() => setShowLeadModal(false)} initialContactId={id} />}
    </div>
  );
}

function TaskRow({ task, onEdit }: { task: Task; onEdit: (task: Task) => void }) {
  const complete = useCompleteTask(task.id);
  const reopen = useReopenTask(task.id);
  const remove = useDeleteTask();
  const completed = task.status === "done";

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="min-w-0 text-left text-sm font-medium text-text hover:underline"
        >
          {task.title}
        </button>
        <span className="flex shrink-0 items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          {completed && <CheckCircle2 className="h-4 w-4 text-success" />}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {task.due_at ? `Due ${formatDate(task.due_at)}` : "No due date"}
        {task.assignee?.name ? ` · ${task.assignee.name}` : " · Unassigned"}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {completed ? (
          <button
            type="button"
            onClick={() => reopen.mutate()}
            disabled={reopen.isPending}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-primary-soft/40 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" /> Reopen
          </button>
        ) : (
          <button
            type="button"
            onClick={() => complete.mutate()}
            disabled={complete.isPending}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-success hover:bg-success/10 disabled:opacity-50"
          >
            <Check className="h-3 w-3" /> Complete
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete task "${task.title}"?`)) remove.mutate(task.id);
          }}
          disabled={remove.isPending}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </div>
    </div>
  );
}

function TaskGroup({
  title,
  tasks,
  onEdit,
}: {
  title: string;
  tasks: Task[];
  onEdit: (task: Task) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onEdit={onEdit} />
      ))}
    </div>
  );
}

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);

  return (
    <RequirePermission permission="contacts.view">
      <ContactProfile id={id} />
    </RequirePermission>
  );
}
