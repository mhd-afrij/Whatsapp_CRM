"use client";

import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, Megaphone, MessageCircle, Plus, RefreshCw, Send, Users, Wifi, WifiOff } from "lucide-react";
import { useConversationList } from "@/hooks/use-conversations";
import { useLeadList } from "@/hooks/use-leads";
import { useTaskList } from "@/hooks/use-tasks";
import { useNotifications } from "@/hooks/use-notifications";
import { useWhatsappActions, useWhatsappStatus } from "@/hooks/use-whatsapp-connection";
import { usePermission } from "@/hooks/use-permission";
import { NOTIFICATION_TYPE_LABELS, notificationLinkFor } from "@/lib/notifications-api";
import type { AnalyticsFilters, DashboardSummary, AgentPerformancePoint } from "@/lib/analytics-api";

function relativeTime(value: string | null) {
  if (!value) return "No activity";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Local-calendar YYYY-MM-DD, matching the analytics page's date handling. */
function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function Panel({ title, eyebrow, children, action }: { title: string; eyebrow?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col justify-between rounded-xl border border-border bg-surface p-4 shadow-xs">
      <div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {eyebrow && <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>}
            <h2 className="mt-0.5 text-sm font-bold text-text">{title}</h2>
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}

function formatCount(value: number | undefined) { return value == null ? "--" : value.toLocaleString(); }

const LEAD_STAGES = ["new", "contacted", "qualified", "converted", "lost"] as const;

export function DashboardOverviewWidgets({ filters, summary, agentPerformance }: { filters: AnalyticsFilters; summary?: DashboardSummary; agentPerformance?: AgentPerformancePoint[] }) {
  const canManageWhatsapp = usePermission("whatsapp.connection.manage");
  const canCreateContacts = usePermission("contacts.create");
  const canManageLeads = usePermission("leads.manage");
  const canReply = usePermission("conversations.reply");
  const canManageTasks = usePermission("tasks.manage");
  const canViewCampaigns = usePermission("campaigns.view");
  const canViewContacts = usePermission("contacts.view");

  // Small recent list only — aggregate numbers come from the server-side
  // dashboard summary or per-filter meta.total counts, not client-side math
  // over a truncated page of rows.
  const conversations = useConversationList({ status: "open", per_page: 4 });
  const newLeads = useLeadList({ stage: "new", per_page: 1 });
  const contactedLeads = useLeadList({ stage: "contacted", per_page: 1 });
  const qualifiedLeads = useLeadList({ stage: "qualified", per_page: 1 });
  const convertedLeads = useLeadList({ stage: "converted", per_page: 1 });
  const lostLeads = useLeadList({ stage: "lost", per_page: 1 });
  const dueTodayTasks = useTaskList({ status: "open", due_date: localToday(), per_page: 1 });
  const whatsapp = useWhatsappStatus();
  const { reconnect } = useWhatsappActions();
  const notificationState = useNotifications(true);

  const conversationRows = conversations.data?.pages.flatMap((page) => page.data) ?? [];
  const dueToday = dueTodayTasks.data?.meta.total ?? 0;
  const stageCounts = [
    { stage: LEAD_STAGES[0], count: newLeads.data?.meta.total ?? 0 },
    { stage: LEAD_STAGES[1], count: contactedLeads.data?.meta.total ?? 0 },
    { stage: LEAD_STAGES[2], count: qualifiedLeads.data?.meta.total ?? 0 },
    { stage: LEAD_STAGES[3], count: convertedLeads.data?.meta.total ?? 0 },
    { stage: LEAD_STAGES[4], count: lostLeads.data?.meta.total ?? 0 },
  ];
  const maxStageCount = Math.max(1, ...stageCounts.map((item) => item.count));
  const recentConversations = conversationRows.slice(0, 4);
  const recentNotifications = notificationState.notifications.slice(0, 5);
  const status = whatsapp.data?.status ?? "idle";
  const isConnected = status === "connected";

  // Bar widths scaled against the busiest agent instead of raw counts, so a
  // value >= 100 no longer renders as an always-full bar.
  const maxChatsHandled = Math.max(1, ...(agentPerformance ?? []).map((agent) => agent.conversations_handled));

  const quickActions = [
    canCreateContacts ? { href: "/contacts/new", label: "New contact", icon: Users } : null,
    canManageLeads ? { href: "/leads", label: "Create lead", icon: Plus } : null,
    canReply ? { href: "/inbox", label: "Send message", icon: Send } : null,
    canManageTasks ? { href: "/tasks", label: "Create task", icon: CheckCircle2 } : null,
    canViewCampaigns ? { href: "/campaigns", label: "Campaigns", icon: Megaphone } : null,
    canViewContacts ? { href: "/contacts", label: "View contacts", icon: MessageCircle } : null,
  ].filter((action): action is { href: string; label: string; icon: typeof Users } => action != null);

  return <>
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel
        title="WhatsApp status"
        eyebrow="Live channel"
        action={
          <Link href="/settings/whatsapp" className="text-xs font-semibold text-primary hover:underline">
            Manage
          </Link>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg p-3">
          <div className="flex items-center gap-3">
            <span
              className={`flex size-10 items-center justify-center rounded-xl ${
                isConnected ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
              }`}
            >
              {isConnected ? <Wifi className="size-5" /> : <WifiOff className="size-5" />}
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${isConnected ? "bg-success" : "bg-danger"}`} />
                <p className="text-sm font-semibold capitalize text-text">{status.replace("_", " ")}</p>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {whatsapp.data?.phoneNumber ?? "No active WhatsApp session"}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-muted">
            <p className="text-[10px] font-semibold uppercase text-muted">Last checked</p>
            <p className="mt-0.5 font-medium text-text">
              {whatsapp.dataUpdatedAt ? relativeTime(new Date(whatsapp.dataUpdatedAt).toISOString()) : "Waiting"}
            </p>
          </div>
        </div>
        {!isConnected && canManageWhatsapp && (
          <button
            type="button"
            onClick={() => reconnect.mutate()}
            disabled={reconnect.isPending}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-bg disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${reconnect.isPending ? "animate-spin" : ""}`} />
            {reconnect.isPending ? "Reconnecting..." : "Reconnect session"}
          </button>
        )}
      </Panel>
      <Panel title="Business snapshot" eyebrow="Today">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-bg p-3 text-center">
            <p className="text-lg font-bold text-text">{formatCount(summary?.conversations.new)}</p>
            <p className="mt-1 text-[11px] font-medium text-muted">New chats</p>
          </div>
          <div className="rounded-xl bg-bg p-3 text-center">
            <p className="text-lg font-bold text-text">{formatCount(summary?.contacts.new)}</p>
            <p className="mt-1 text-[11px] font-medium text-muted">New contacts</p>
          </div>
          <div className="rounded-xl bg-bg p-3 text-center">
            <p className="text-lg font-bold text-text">{formatCount(summary?.tasks.overdue)}</p>
            <p className="mt-1 text-[11px] font-medium text-muted">Overdue</p>
          </div>
        </div>
      </Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Lead pipeline" eyebrow="Sales momentum" action={<Link href="/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Open pipeline <ArrowRight className="size-3.5" /></Link>}>
        <div className="space-y-3">{stageCounts.map(({ stage, count }) => <div key={stage}><div className="mb-1 flex items-center justify-between text-xs"><span className="capitalize text-muted">{stage}</span><span className="font-semibold text-text">{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-bg"><div className={`h-full rounded-full ${stage === "converted" ? "bg-success" : stage === "lost" ? "bg-danger" : "bg-primary"}`} style={{ width: `${(count / maxStageCount) * 100}%` }} /></div></div>)}</div>
      </Panel>
      <Panel title="Agent performance" eyebrow="Team execution">
        {agentPerformance && agentPerformance.length > 0 ? <div className="space-y-3">{agentPerformance.slice(0, 4).map((agent) => <div key={agent.user_id} className="flex items-center gap-3"><div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-dark">{agent.name.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-xs"><span className="truncate font-semibold text-text">{agent.name}</span><span className="text-muted">{agent.conversations_handled} chats</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((agent.conversations_handled / maxChatsHandled) * 100)}%` }} /></div></div><span className="text-xs text-muted">{agent.tasks_completed} tasks</span></div>)}</div> : <p className="text-sm text-muted">No agent activity for this period.</p>}
      </Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Recent conversations" eyebrow="Customer activity" action={<Link href="/inbox" className="text-xs font-semibold text-primary hover:underline">Open inbox</Link>}>
        {recentConversations.length > 0 ? <div className="divide-y divide-border">{recentConversations.map((conversation) => { const name = conversation.contact?.full_name || conversation.whatsapp_contact?.contact_name || conversation.whatsapp_contact?.push_name || "Unknown contact"; return <Link key={conversation.id} href={`/inbox/${conversation.id}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-bg/50"><div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${conversation.unread_count > 0 ? "bg-primary-soft text-primary-dark" : "bg-bg text-muted"}`}>{name.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-text">{name}</p><p className="mt-0.5 truncate text-xs text-muted">{conversation.last_message_preview || "No message preview"}</p></div><div className="text-right text-[11px] text-muted"><p>{relativeTime(conversation.last_message_at)}</p>{conversation.unread_count > 0 && <span className="mt-1 inline-flex rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">{conversation.unread_count}</span>}</div></Link>; })}</div> : <p className="text-sm text-muted">No recent conversations.</p>}
      </Panel>
      <Panel title="Recent activities" eyebrow={`${notificationState.unreadCount} unread`} action={notificationState.unreadCount > 0 ? <button type="button" onClick={() => notificationState.markAllRead.mutate()} className="text-xs font-semibold text-primary hover:underline">Mark all read</button> : undefined}><div className="space-y-4">{recentNotifications.length > 0 ? recentNotifications.map((notification) => { const href = notificationLinkFor(notification); const content = <div className="flex gap-3"><span className={`mt-1 size-2 shrink-0 rounded-full ${notification.read_at ? "bg-border" : "bg-primary"}`} /><div className="min-w-0 flex-1"><p className="text-sm text-text">{NOTIFICATION_TYPE_LABELS[notification.type] ?? notification.type}</p><p className="mt-1 text-xs text-muted">{relativeTime(notification.created_at)}</p></div></div>; return href ? <Link key={notification.id} href={href} onClick={() => notificationState.markRead.mutate(notification.id)} className="block hover:opacity-75">{content}</Link> : <button key={notification.id} type="button" onClick={() => notificationState.markRead.mutate(notification.id)} className="block w-full text-left hover:opacity-75">{content}</button>; }) : <div className="flex items-center gap-2 text-sm text-muted"><Activity className="size-4" />You are all caught up.</div>}</div></Panel>
    </div>

    {quickActions.length > 0 && (
      <Panel title="Quick actions" eyebrow="Move faster"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{quickActions.map(({ href, label, icon: Icon }) => <Link key={label} href={href} className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-3 text-xs font-semibold text-text transition hover:border-primary/40 hover:bg-primary-soft/30"><Icon className="size-4 text-primary" />{label}</Link>)}</div></Panel>
    )}
    <div className="sr-only">Workspace snapshot for {filters.from} to {filters.to}: {dueToday} open tasks due today across {conversationRows.length} recently active open conversations shown.</div>
  </>;
}
