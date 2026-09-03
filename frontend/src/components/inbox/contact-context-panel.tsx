"use client";

import { useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  BriefcaseBusiness,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  History,
  MessageSquare,
  Package,
  Phone,
  Plus,
  StickyNote,
  Tag,
  UserCheck,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { useConversation, useConversationActions } from "@/hooks/use-conversations";
import { useUsers } from "@/hooks/use-users";
import { useContact } from "@/hooks/use-contacts";
import { useCreateNote, useNoteList } from "@/hooks/use-notes";
import { useTaskList } from "@/hooks/use-tasks";
import {
  useCreateDeal,
  useDealList,
  useDealPipelines,
  useMarkDealLost,
  useMarkDealWon,
  useMoveDealStage,
  useUpdateDeal,
} from "@/hooks/use-deals";
import { useCreateLead } from "@/hooks/use-leads";
import type { LeadSummary } from "@/lib/contacts-api";
import { LabelPicker } from "@/components/labels/label-picker";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/api-client";

/* -------------------------------------------------------------------------- */
/*  Reusable primitives                                                        */
/* -------------------------------------------------------------------------- */

function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  action,
}: {
  title: string;
  icon: typeof Tag;
  children: ReactNode;
  defaultOpen?: boolean;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mb-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111827]">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left transition hover:opacity-80"
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
          <span className="flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {title}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {open && <div className="border-t border-white/[0.06] px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 py-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span
        className={cn(
          "min-w-0 break-words text-xs font-medium text-slate-200",
          mono && "font-mono"
        )}
      >
        {value || <span className="text-slate-600">—</span>}
      </span>
    </div>
  );
}

function Badge({ children, color = "slate" }: { children: ReactNode; color?: string }) {
  const colorMap: Record<string, string> = {
    slate: "border-white/[0.08] bg-white/[0.04] text-slate-300",
    green: "border-[#22C55E]/20 bg-[#22C55E]/10 text-[#86EFAC]",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    red: "border-red-500/20 bg-red-500/10 text-red-300",
    blue: "border-blue-500/20 bg-blue-500/10 text-blue-300",
  };
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", colorMap[color])}>
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section 1 — Profile Header                                                */
/* -------------------------------------------------------------------------- */

function CustomerProfileHeader({
  name,
  phoneNumber,
  isOnline,
  onCall,
  onMessage,
}: {
  name: string;
  phoneNumber: string | null;
  isOnline: boolean;
  onCall: () => void;
  onMessage: () => void;
}) {
  return (
    <div className="border-b border-white/[0.08] bg-[#0B1220]/95 px-4 py-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Avatar name={name} size="lg" className="rounded-xl" />
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0B1220]",
              isOnline ? "bg-[#22C55E]" : "bg-slate-500"
            )}
            title={isOnline ? "Online" : "Offline"}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-50">{name}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isOnline ? "bg-[#22C55E]" : "bg-slate-500")} />
            <span className="truncate text-[11px] text-slate-400">{isOnline ? "Online" : "Offline"}</span>
          </div>
          {phoneNumber && (
            <p className="mt-1 truncate font-mono text-xs text-slate-400">{phoneNumber}</p>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCall}
          className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-slate-50"
        >
          <Phone className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Call</span>
        </button>
        <button
          type="button"
          onClick={onMessage}
          className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-slate-50"
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">WhatsApp</span>
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section 2 — Customer Details Card                                         */
/* -------------------------------------------------------------------------- */

function CustomerDetailsCard({
  name,
  phoneNumber,
  email,
  location,
  customerId,
  createdAt,
}: {
  name: string;
  phoneNumber: string | null;
  email: string | null;
  location: string | null;
  customerId: number | string | null;
  createdAt: string | null;
}) {
  return (
    <CollapsibleSection title="Customer Details" icon={UserRound}>
      <dl className="divide-y divide-white/[0.05]">
        <DetailRow label="Name" value={name} />
        <DetailRow label="Phone" value={phoneNumber} mono />
        <DetailRow label="Email" value={email} />
        <DetailRow label="Location" value={location} />
        <DetailRow label="Customer ID" value={customerId ? `#${customerId}` : null} mono />
        <DetailRow
          label="Created"
          value={createdAt ? new Date(createdAt).toLocaleDateString() : null}
        />
      </dl>
    </CollapsibleSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section 3 - Lead Management (backed by a linked Deal)                     */
/* -------------------------------------------------------------------------- */

const LEAD_SOURCES = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
];

const LEAD_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const DEAL_STATUSES = [
  { value: "open", label: "Active" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
] as const;

const leadSelectClass =
  "w-full rounded-lg border border-white/[0.08] bg-[#080F1D] px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-[#22C55E]/50 focus:ring-1 focus:ring-[#22C55E]/20 disabled:opacity-50";

function LeadInfoCard({
  contactId,
  contactName,
  contactLeads,
  users,
  canAssign,
  assignedName,
  assignedUserId,
  onAssign,
  isAssignPending,
}: {
  contactId: number;
  contactName: string;
  contactLeads?: LeadSummary[];
  users: Array<{ id: number; name: string }>;
  canAssign: boolean;
  assignedName: string;
  assignedUserId: number | null;
  onAssign: (userId: number | null) => void;
  isAssignPending: boolean;
}) {
  const { toast } = useToast();

  const dealList = useDealList({ contact_id: contactId, per_page: 1 }, { enabled: contactId > 0 });
  const { data: pipelines } = useDealPipelines();
  const createDeal = useCreateDeal();
  const createLead = useCreateLead();

  const dealId = dealList.data?.data[0]?.id ?? 0;
  const updateDeal = useUpdateDeal(dealId);
  const markDealWon = useMarkDealWon(dealId);
  const markDealLost = useMarkDealLost(dealId);
  const moveDealStage = useMoveDealStage();

  const deal = dealList.data?.data[0] ?? null;
  const lead = contactLeads?.[0] ?? null;

  const handleCreateLead = () => {
    createLead.mutate(
      {
        contact_id: contactId,
        stage: "new",
        source: "manual",
        notes: null,
      },
      {
        onSuccess: () => toast("Lead created.", "success"),
        onError: (err) =>
          toast(err instanceof ApiError ? err.message : "Unable to create lead.", "error"),
      }
    );
  };

  const handleCreateDeal = () => {
    const pipeline =
      pipelines?.find((p) => p.is_default) ?? pipelines?.[0] ?? null;
    const stage = pipeline?.stages?.[0] ?? null;
    if (!pipeline || !stage) {
      toast("No pipeline is configured. Add one in Settings first.", "error");
      return;
    }
    createDeal.mutate(
      {
        contact_id: contactId,
        pipeline_id: pipeline.id,
        pipeline_stage_id: stage.id,
        title: contactName === "Unknown contact" ? "Untitled deal" : contactName,
        lead_source: "whatsapp",
        lead_priority: "medium",
      },
      {
        onSuccess: () => toast("Deal created.", "success"),
        onError: (err) =>
          toast(err instanceof ApiError ? err.message : "Unable to create deal.", "error"),
      }
    );
  };

  const handleStatus = (value: string) => {
    if (!deal) return;
    if (value === "won") {
      markDealWon.mutate(undefined, {
        onError: (err) =>
          toast(err instanceof ApiError ? err.message : "Unable to mark deal as won.", "error"),
      });
    } else if (value === "lost") {
      markDealLost.mutate("Lost via inbox", {
        onError: (err) =>
          toast(err instanceof ApiError ? err.message : "Unable to mark deal as lost.", "error"),
      });
    }
  };

  const handleStage = (stageId: number) => {
    if (!deal) return;
    moveDealStage.mutate(
      { dealId: deal.id, stageId },
      {
        onError: (err) =>
          toast(err instanceof ApiError ? err.message : "Unable to move deal stage.", "error"),
      }
    );
  };

  const handleField = (
    values: Parameters<typeof updateDeal.mutate>[0]
  ) => {
    if (!deal) return;
    updateDeal.mutate(values, {
      onError: (err) =>
        toast(err instanceof ApiError ? err.message : "Unable to update deal.", "error"),
    });
  };

  const dealPipeline = pipelines?.find((p) => p.id === deal?.pipeline_id);
  const isOpenDeal = deal?.status === "open";

  return (
    <CollapsibleSection
      title="Lead Management"
      icon={BriefcaseBusiness}
      action={
        deal ? (
          <Badge color={deal.status === "won" ? "green" : deal.status === "lost" ? "red" : "blue"}>
            {deal.status === "won" ? "Won" : deal.status === "lost" ? "Lost" : "Active"}
          </Badge>
        ) : undefined
      }
    >
      {lead ? (
        <div className="space-y-1.5 rounded-lg border border-white/[0.08] bg-[#080F1D] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-slate-500">Linked lead</p>
            <Badge color={lead.stage === "converted" ? "green" : lead.stage === "qualified" ? "blue" : "yellow"}>
              {lead.stage}
            </Badge>
          </div>
          <Link
            href={`/leads/${lead.id}`}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#22C55E] hover:underline"
          >
            <UserRound className="h-3 w-3" />
            Lead #{lead.id}
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleCreateLead}
          disabled={createLead.isPending}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#22C55E] px-3 py-1.5 text-[11px] font-bold text-[#04130A] transition hover:bg-[#22C55E]/90 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          {createLead.isPending ? "Creating…" : "Create Lead"}
        </button>
      )}
      {!deal ? (
        <div className="rounded-lg border border-dashed border-white/[0.08] bg-[#080F1D] p-3 text-center">
          <p className="text-[11px] text-slate-500">No linked deal for this contact.</p>
          <button
            type="button"
            onClick={handleCreateDeal}
            disabled={createDeal.isPending || !pipelines?.length}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#22C55E] px-3 py-1.5 text-[11px] font-bold text-[#04130A] transition hover:bg-[#22C55E]/90 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            {createDeal.isPending ? "Creating…" : "Create Deal"}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Lead Status</label>
            {isOpenDeal ? (
              <select
                value={deal.status}
                onChange={(e) => handleStatus(e.target.value)}
                className={leadSelectClass}
              >
                {DEAL_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs font-semibold text-slate-200">
                {deal.status === "won" ? "Won" : "Lost"}
              </p>
            )}
          </div>

          {isOpenDeal && (
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">Stage</label>
              <select
                value={deal.pipeline_stage_id}
                onChange={(e) => handleStage(Number(e.target.value))}
                disabled={!dealPipeline}
                className={leadSelectClass}
              >
                {(dealPipeline?.stages ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Lead Source</label>
            <select
              value={deal.lead_source ?? "whatsapp"}
              onChange={(e) => handleField({ lead_source: e.target.value })}
              className={leadSelectClass}
            >
              {LEAD_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Priority</label>
            <select
              value={deal.lead_priority ?? "medium"}
              onChange={(e) =>
                handleField({ lead_priority: e.target.value as "low" | "medium" | "high" })
              }
              className={leadSelectClass}
            >
              {LEAD_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Assigned Agent</label>
            {canAssign ? (
              <select
                value={assignedUserId ?? ""}
                onChange={(e) => {
                  const userId = e.target.value ? Number(e.target.value) : null;
                  onAssign(userId);
                  if (userId !== null) {
                    handleField({ owner_user_id: userId });
                  }
                }}
                disabled={isAssignPending}
                className={leadSelectClass}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-slate-200">{assignedName}</p>
            )}
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section 4 — Tags Manager                                                  */
/* -------------------------------------------------------------------------- */

function TagsManager({
  conversationId,
  labels,
  canEdit,
}: {
  conversationId: number;
  labels: Array<{ id: number; name: string }>;
  canEdit: boolean;
}) {
  return (
    <CollapsibleSection
      title="Tags"
      icon={Tag}
      action={
        <Badge color="green">{labels.length}</Badge>
      }
    >
      <LabelPicker
        entity="conversations"
        entityId={conversationId}
        currentLabels={labels}
        canEdit={canEdit}
      />
    </CollapsibleSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section 5 — Notes                                                         */
/* -------------------------------------------------------------------------- */

function NotesCard({
  notes,
  isCreating,
  onCreateNote,
}: {
  notes: Array<{
    id: number;
    body: string;
    created_at: string;
    author?: { name?: string | null } | null;
  }>;
  isCreating: boolean;
  onCreateNote: (body: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    onCreateNote(body);
    setDraft("");
    setAdding(false);
  }, [draft, onCreateNote]);

  return (
    <CollapsibleSection
      title="Notes"
      icon={StickyNote}
      action={
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setTimeout(() => textareaRef.current?.focus(), 50);
          }}
          className="flex h-5 w-5 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/[0.08] hover:text-slate-200"
        >
          <Plus className="h-3 w-3" />
        </button>
      }
    >
      <div className="space-y-2">
        {adding && (
          <div className="rounded-lg border border-[#22C55E]/25 bg-[#080F1D] p-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a note..."
              rows={3}
              className="w-full resize-none rounded-md border-0 bg-transparent px-2 py-1 text-xs text-slate-100 outline-none placeholder:text-slate-600"
            />
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isCreating || !draft.trim()}
                className="rounded-md bg-[#22C55E] px-2.5 py-1 text-[10px] font-bold text-[#04130A] disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setDraft(""); }}
                className="rounded-md border border-white/[0.08] px-2.5 py-1 text-[10px] font-semibold text-slate-400 transition hover:bg-white/[0.06]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {notes.length === 0 && !adding && (
          <p className="py-2 text-center text-[11px] text-slate-500">No notes yet</p>
        )}

        {notes.slice(0, 5).map((note) => (
          <div key={note.id} className="rounded-lg border border-white/[0.06] bg-[#080F1D] p-2">
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>{note.author?.name ?? "Unknown"}</span>
              <span>{new Date(note.created_at).toLocaleDateString()}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs text-slate-200 leading-relaxed">
              {note.body}
            </p>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section 6 — Conversation History                                          */
/* -------------------------------------------------------------------------- */

function ConversationHistory({
  lastMessageAt,
  lastMessagePreview,
  status,
  unreadCount,
}: {
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  status: string;
  unreadCount: number;
}) {
  const formatRelative = (dateStr: string | null) => {
    if (!dateStr) return "No activity";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <CollapsibleSection title="Conversation History" icon={History}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#22C55E]/10">
            <MessageSquare className="h-3 w-3 text-[#22C55E]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-200">
              {lastMessagePreview ?? "No messages yet"}
            </p>
            <p className="text-[10px] text-slate-500">
              {formatRelative(lastMessageAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className={cn("h-1.5 w-1.5 rounded-full", status === "open" ? "bg-[#22C55E]" : "bg-slate-500")} />
            {status === "open" ? "Active" : "Closed"}
          </span>
          {unreadCount > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              {unreadCount} unread
            </span>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section 7 — Orders / Sales                                                */
/* -------------------------------------------------------------------------- */

function OrdersCard() {
  return (
    <CollapsibleSection title="Orders" icon={Package} defaultOpen={false}>
      <div className="rounded-lg border border-dashed border-white/[0.08] bg-[#080F1D] p-4 text-center">
        <Package className="mx-auto h-6 w-6 text-slate-600" />
        <p className="mt-2 text-[11px] text-slate-500">No orders yet</p>
        <p className="mt-0.5 text-[10px] text-slate-600">
          Orders will appear here once linked to this contact.
        </p>
      </div>
    </CollapsibleSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section 8 — Activity Timeline                                             */
/* -------------------------------------------------------------------------- */

function ActivityTimeline({
  notes,
  tasks,
  labels,
  assignedName,
}: {
  notes: Array<{ id: number; created_at: string; author?: { name?: string | null } | null }>;
  tasks: Array<{ id: number; title: string; status: string; created_at: string }>;
  labels: Array<{ id: number; name: string }>;
  assignedName: string;
}) {
  const activities = useMemo(() => {
    const items: Array<{
      id: string;
      icon: typeof CheckSquare;
      text: string;
      time: string;
      color: string;
    }> = [];

    if (assignedName !== "Unassigned") {
      items.push({
        id: "assign",
        icon: UserCheck,
        text: `Assigned to ${assignedName}`,
        time: "",
        color: "text-blue-400",
      });
    }

    labels.forEach((label) => {
      items.push({
        id: `label-${label.id}`,
        icon: Tag,
        text: `Label "${label.name}" added`,
        time: "",
        color: "text-[#22C55E]",
      });
    });

    notes.slice(0, 3).forEach((note) => {
      items.push({
        id: `note-${note.id}`,
        icon: StickyNote,
        text: `Note added by ${note.author?.name ?? "Unknown"}`,
        time: new Date(note.created_at).toLocaleDateString(),
        color: "text-amber-400",
      });
    });

    tasks.slice(0, 3).forEach((task) => {
      items.push({
        id: `task-${task.id}`,
        icon: CheckSquare,
        text: `Task: ${task.title}`,
        time: new Date(task.created_at).toLocaleDateString(),
        color: "text-purple-400",
      });
    });

    return items.slice(0, 8);
  }, [notes, tasks, labels, assignedName]);

  if (activities.length === 0) {
    return (
      <CollapsibleSection title="Activity" icon={Activity} defaultOpen={false}>
        <p className="py-2 text-center text-[11px] text-slate-500">No activity recorded</p>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="Activity" icon={Activity} defaultOpen={false}>
      <div className="relative space-y-2 pl-3">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/[0.06]" />
        {activities.map((item) => (
          <div key={item.id} className="relative flex items-start gap-2.5">
            <div className="absolute left-0 top-0.5 h-[15px] w-[15px] rounded-full border-2 border-[#111827] bg-[#080F1D]">
              <item.icon className={cn("mx-auto mt-[2px] h-2.5 w-2.5", item.color)} />
            </div>
            <div className="min-w-0 flex-1 pl-1">
              <p className="text-[11px] text-slate-300">{item.text}</p>
              {item.time && <p className="text-[10px] text-slate-600">{item.time}</p>}
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Loading skeleton                                                           */
/* -------------------------------------------------------------------------- */

function PanelSkeleton() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0B1220]">
      <div className="h-36 shrink-0 animate-pulse border-b border-white/[0.08] bg-white/[0.03]" />
      <div className="space-y-3 overflow-hidden p-3">
        <div className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
        <div className="h-32 animate-pulse rounded-xl bg-white/[0.03]" />
        <div className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main exported components                                                   */
/* -------------------------------------------------------------------------- */

export function CustomerTimeline({
  notes,
  tasks,
}: {
  notes: Array<{ id: number; body: string; created_at: string; author?: { name?: string | null } | null }>;
  tasks: Array<{ id: number; title: string; status: string; due_at?: string | null }>;
}) {
  const items = [
    ...notes.slice(0, 3).map((note) => ({
      id: `note-${note.id}`,
      icon: StickyNote,
      title: note.body,
      meta: `${note.author?.name ?? "Unknown"} - ${new Date(note.created_at).toLocaleDateString()}`,
    })),
    ...tasks.slice(0, 3).map((task) => ({
      id: `task-${task.id}`,
      icon: CheckSquare,
      title: task.title,
      meta: `${task.status}${task.due_at ? ` - Due ${new Date(task.due_at).toLocaleDateString()}` : ""}`,
    })),
  ].slice(0, 5);

  if (items.length === 0) {
    return <p className="text-sm text-slate-400">No recent CRM activity.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="flex gap-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#22C55E]/10 text-[#22C55E]">
            <item.icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm text-slate-100">{item.title}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{item.meta}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CustomerProfile({
  conversationId,
  collapsed = false,
  onToggle,
}: {
  conversationId: number;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const { data: conversation, isLoading } = useConversation(conversationId);
  const { assign } = useConversationActions(conversationId);
  const canAssign = usePermission("conversations.assign");
  const canManageLabels = usePermission("conversations.reply");
  const { data: users } = useUsers();
  const contactId = conversation?.contact?.id ?? null;
  const { data: contact } = useContact(contactId ?? 0);
  const { data: notes } = useNoteList({ conversation_id: conversationId });
  const { data: tasks } = useTaskList({ conversation_id: conversationId, per_page: 10 });
  const createNote = useCreateNote({ conversation_id: conversationId });
  const { toast } = useToast();

  const contactDisplay = useMemo(
    () =>
      contact?.full_name ||
      conversation?.contact?.full_name ||
      conversation?.whatsapp_contact?.contact_name ||
      conversation?.whatsapp_contact?.push_name ||
      conversation?.whatsapp_contact?.phone_number ||
      "Unknown contact",
    [contact, conversation]
  );

  const phoneNumber =
    contact?.phone_number ?? conversation?.whatsapp_contact?.phone_number ?? conversation?.whatsapp_contact?.wa_jid ?? null;

  const assignedName = conversation?.assigned_user?.name ?? conversation?.assigned_team?.name ?? "Unassigned";

  const isOnline = conversation?.status === "open";

  const handleCallCustomer = () => {
    if (!phoneNumber) {
      toast("No phone number available.", "error");
      return;
    }
    toast(`Calling ${contactDisplay}... (${phoneNumber})`);
  };

  const handleSendMessage = () => {
    toast(`Opening WhatsApp chat with ${contactDisplay}...`);
  };

  const handleCreateNote = (body: string) => {
    createNote.mutate(
      { conversation_id: conversationId, body },
      {
        onSuccess: () => toast("Note added.", "success"),
        onError: (error) =>
          toast(error instanceof ApiError ? error.message : "Unable to add note.", "error"),
      }
    );
  };

  if (isLoading || !conversation) {
    return <PanelSkeleton />;
  }

  if (collapsed) {
    return (
      <aside className="sticky top-0 flex h-full w-14 shrink-0 flex-col items-center gap-3 overflow-hidden border-l border-white/[0.08] bg-[#0B1220] px-2 py-3 transition-[width] duration-300 ease-out">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Open customer information"
          title="Open customer information"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-slate-300 transition hover:bg-white/[0.07] hover:text-slate-50"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>
        <Avatar name={contactDisplay} size="sm" className="rounded-xl" />
        <span
          className={cn("h-2 w-2 rounded-full", isOnline ? "bg-[#22C55E]" : "bg-slate-500")}
          title={conversation.status}
        />
      </aside>
    );
  }

  const noteItems = notes ?? [];
  const taskItems = tasks?.data ?? [];

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden bg-[#0B1220] transition-[width,transform,opacity] duration-300 ease-out">
      <div className="shrink-0">
        <CustomerProfileHeader
          name={contactDisplay}
          phoneNumber={phoneNumber}
          isOnline={isOnline}
          onCall={handleCallCustomer}
          onMessage={handleSendMessage}
        />
      </div>

      <div className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden p-3 [scrollbar-color:rgba(148,163,184,.28)_transparent] [scrollbar-width:thin]">
        <div className="space-y-2.5">
          <CustomerDetailsCard
            name={contactDisplay}
            phoneNumber={phoneNumber}
            email={contact?.email ?? null}
            location={null}
            customerId={contactId}
            createdAt={contact?.created_at ?? null}
          />

          <LeadInfoCard
            contactId={contactId ?? 0}
            contactName={contactDisplay}
            contactLeads={contact?.leads}
            users={users ?? []}
            canAssign={canAssign}
            assignedName={assignedName}
            assignedUserId={conversation.assigned_user?.id ?? null}
            onAssign={(userId) => assign.mutate({ assigned_user_id: userId, assigned_team_id: null })}
            isAssignPending={assign.isPending}
          />

          <TagsManager
            conversationId={conversationId}
            labels={conversation.labels ?? []}
            canEdit={canManageLabels}
          />

          <NotesCard
            notes={noteItems}
            isCreating={createNote.isPending}
            onCreateNote={handleCreateNote}
          />

          <ConversationHistory
            lastMessageAt={conversation.last_message_at}
            lastMessagePreview={conversation.last_message_preview}
            status={conversation.status}
            unreadCount={conversation.unread_count}
          />

          <OrdersCard />

          <ActivityTimeline
            notes={noteItems}
            tasks={taskItems}
            labels={conversation.labels ?? []}
            assignedName={assignedName}
          />

          {contactId && (
            <Link
              href={`/contacts/${contactId}`}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
            >
              <UserRound className="h-3.5 w-3.5 text-slate-400" />
              View full contact
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}

export function ContactContextPanel({
  conversationId,
  collapsed,
  onToggle,
}: {
  conversationId: number;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return <CustomerProfile conversationId={conversationId} collapsed={collapsed} onToggle={onToggle} />;
}
