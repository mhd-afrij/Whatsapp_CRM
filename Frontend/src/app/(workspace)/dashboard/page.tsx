"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { authFetch, useAuthStore } from "@/stores/auth-store";
import { ApiError } from "@/lib/api-error";
import type { AuditLogEntry, TeamMember } from "@/types/admin";
import type { DashboardStats } from "@/types/inbox";
import { Bell, ChevronDown, Circle, Star, TrendingDown, TrendingUp, Users, MessageSquareMore } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  open: "#59d46f",
  pending: "#5b8cff",
  closed: "#394655",
  resolved: "#f59e0b",
};

const OVERVIEW_COLORS = { incoming: "#59d46f", outgoing: "#5b8cff" };

function formatDuration(seconds: number | null) {
  if (seconds === null) return "0s";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remaining}s` : `${remaining}s`;
}

function formatDay(dateIso: string) {
  return new Date(dateIso).toLocaleDateString([], { day: "numeric", month: "short" });
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  const statsQuery = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => authFetch<DashboardStats>("/dashboard/stats"),
    refetchInterval: 30_000,
  });
  const teamQuery = useQuery({
    queryKey: ["dashboard", "team"],
    queryFn: () => authFetch<TeamMember[]>("/users"),
  });
  const auditQuery = useQuery({
    queryKey: ["dashboard", "audit"],
    queryFn: () => authFetch<AuditLogEntry[]>("/audit-logs"),
  });

  const stats = statsQuery.data;
  const teamMembers = teamQuery.data ?? [];
  const auditEvents = auditQuery.data ?? [];

  const statsForbidden = statsQuery.error instanceof ApiError && statsQuery.error.status === 403;
  const totalStatus = useMemo(
    () => stats?.conversations_by_status.reduce((sum, item) => sum + item.count, 0) ?? 0,
    [stats?.conversations_by_status]
  );

  const metrics = [
    {
      label: "Total Conversations",
      value: stats?.total_conversations ?? 0,
      delta: "+12.5%",
      trend: "up" as const,
      detail: "vs last 7 days",
    },
    {
      label: "Open Conversations",
      value: stats?.open_conversations ?? 0,
      delta: "-8.3%",
      trend: "down" as const,
      detail: "vs last 7 days",
    },
    {
      label: "Unread Messages",
      value: stats?.unread_messages ?? 0,
      delta: "+3.2%",
      trend: "up" as const,
      detail: "vs last 7 days",
    },
    {
      label: "New Contacts",
      value: stats?.new_contacts ?? 0,
      delta: "+18.7%",
      trend: "up" as const,
      detail: "vs last 7 days",
    },
    {
      label: "Avg. Response Time",
      value: formatDuration(stats?.avg_response_seconds ?? null),
      delta: "-15.3%",
      trend: "down" as const,
      detail: "vs last 7 days",
    },
    {
      label: "Resolution Rate",
      value: stats ? `${stats.resolution_rate}%` : "0%",
      delta: "+6.5%",
      trend: "up" as const,
      detail: "vs last 7 days",
    },
  ];

  const teamPerformance = teamMembers.slice(0, 5).map((member, index) => ({
    name: member.name,
    conversations: [324, 289, 268, 195, 176][index] ?? 120,
    response: ["1m 32s", "2m 11s", "2m 45s", "3m 10s", "3m 55s"][index] ?? "2m 0s",
    rate: ["96.2%", "93.1%", "90.3%", "88.7%", "85.4%"][index] ?? "90.0%",
  }));

  const unassigned = stats?.unassigned_conversations ?? [];
  const recentActivity = auditEvents.slice(0, 4);
  const whatsappAccounts = [
    { name: "Support Team", number: "+1 916 123 4567", status: "Connected", active: true },
    { name: "Sales Team", number: "+1 500 767 6543", status: "Connected", active: true },
    { name: "Marketing", number: "+1 915 436 7890", status: "Reconnecting", active: false },
  ];

  return (
    <div className="min-h-full space-y-4 text-white">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">Dashboard</h1>
          <p className="mt-1 text-sm text-white/48">
            {user ? `Good morning, ${user.name.split(" ")[0]}.` : "Good morning."} Here&apos;s what&apos;s happening with your business today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm text-white/70">
            <span className="h-4 w-4 rounded-md border border-white/20" />
            May 12 - May 18, 2024
            <ChevronDown size={14} />
          </button>
          <button className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm text-white/70">
            <Users size={14} />
            All Accounts
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {statsForbidden ? (
        <div className="rounded-2xl border border-white/8 bg-white/5 p-5 text-sm text-white/65">
          You don&apos;t have permission to view conversation analytics.
        </div>
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-6">
            {metrics.map((metric) => (
              <div key={metric.label} className="min-h-[124px] rounded-2xl border border-white/8 bg-white/5 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.15)]">
                <p className="text-[11px] text-white/42">{metric.label}</p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <p className="text-[30px] font-semibold leading-none tracking-[-0.05em]">{metric.value}</p>
                  <div className={`flex items-center gap-1 text-xs ${metric.trend === "up" ? "text-emerald-400" : "text-rose-400"}`}>
                    {metric.trend === "up" ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {metric.delta}
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-white/38">{metric.detail}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.7fr_0.9fr_0.78fr]">
            <div className="rounded-2xl border border-white/8 bg-[#101820] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium">Conversations Overview</h2>
                  <p className="mt-1 text-xs text-white/40">Incoming vs outgoing messages</p>
                </div>
                <button className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-white/65">Last 7 Days</button>
              </div>
              <div className="h-[252px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats?.conversations_overview ?? []} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="incomingFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={OVERVIEW_COLORS.incoming} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={OVERVIEW_COLORS.incoming} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="outgoingFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={OVERVIEW_COLORS.outgoing} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={OVERVIEW_COLORS.outgoing} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tickFormatter={formatDay} tick={{ fill: "#7d8a96", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#7d8a96", fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip
                      contentStyle={{ background: "#111a23", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, fontSize: 12 }}
                      labelStyle={{ color: "#e5edf5" }}
                    />
                    <Area type="monotone" dataKey="incoming" stroke={OVERVIEW_COLORS.incoming} strokeWidth={2.5} fill="url(#incomingFill)" />
                    <Area type="monotone" dataKey="outgoing" stroke={OVERVIEW_COLORS.outgoing} strokeWidth={2.5} fill="url(#outgoingFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-[#101820] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium">Conversations by Status</h2>
                  <p className="mt-1 text-xs text-white/40">{totalStatus} total</p>
                </div>
              </div>
              <div className="h-[252px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats?.conversations_by_status ?? []}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                    >
                      {(stats?.conversations_by_status ?? []).map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#5b8cff"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#111a23", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-2 text-xs text-white/58">
                {(stats?.conversations_by_status ?? []).map((entry) => (
                  <div key={entry.status} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 capitalize">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[entry.status] ?? "#5b8cff" }} />
                      {entry.status}
                    </span>
                    <span>{entry.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-[#101820] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium">WhatsApp Accounts</h2>
                  <p className="mt-1 text-xs text-white/40">Connected inboxes</p>
                </div>
                <button className="text-xs text-emerald-400">View all</button>
              </div>
              <div className="space-y-3">
                {whatsappAccounts.map((account) => (
                  <div key={account.name} className="flex items-center justify-between rounded-2xl border border-white/6 bg-white/4 px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25d366] text-[#06120a]">
                        <MessageSquareMore size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{account.name}</p>
                        <p className="text-xs text-white/42">{account.number}</p>
                        <p className={`mt-1 text-xs ${account.active ? "text-emerald-400" : "text-amber-400"}`}>{account.status}</p>
                      </div>
                    </div>
                    <Circle size={10} className={account.active ? "fill-emerald-400 text-emerald-400" : "fill-amber-400 text-amber-400"} />
                  </div>
                ))}
                <button className="w-full rounded-xl border border-white/8 bg-white/3 py-2.5 text-sm text-white/70">Add Account</button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr_0.85fr]">
            <div className="rounded-2xl border border-white/8 bg-[#101820] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium">Team Performance</h2>
                <button className="text-xs text-emerald-400">View all</button>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/6">
                <div className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.8fr_0.5fr] bg-white/4 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/40">
                  <span>Agent</span>
                  <span>Conversations</span>
                  <span>Response Time</span>
                  <span>Resolution Rate</span>
                  <span>Rating</span>
                </div>
                <div className="divide-y divide-white/6">
                  {teamPerformance.map((member) => (
                    <div key={member.name} className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.8fr_0.5fr] items-center px-4 py-3 text-sm">
                      <span>{member.name}</span>
                      <span className="text-white/70">{member.conversations}</span>
                      <span className="text-white/70">{member.response}</span>
                      <span className="text-white/70">{member.rate}</span>
                      <span className="flex text-amber-400">{Array.from({ length: 5 }).map((_, idx) => <Star key={idx} size={12} fill={idx < 4 ? "currentColor" : "none"} />)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-[#101820] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium">Unassigned Conversations</h2>
                <button className="text-xs text-emerald-400">View all</button>
              </div>
              <div className="space-y-3">
                {unassigned.length === 0 ? (
                  <p className="text-sm text-white/45">Nothing unassigned right now.</p>
                ) : (
                  unassigned.slice(0, 4).map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-2xl border border-white/6 bg-white/4 px-3 py-3">
                      <div>
                        <p className="text-sm font-medium">{item.contact_name ?? item.contact_phone}</p>
                        <p className="text-xs text-white/45">{item.contact_phone}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-white/45">{item.last_message_at ? new Date(item.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now"}</p>
                        <div className="mt-2 flex justify-end">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-[#101820] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium">Recent Activity</h2>
              </div>
              <div className="space-y-3">
                {recentActivity.length === 0 ? (
                  <p className="text-sm text-white/45">No recent events yet.</p>
                ) : (
                  recentActivity.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 rounded-2xl border border-white/6 bg-white/4 px-3 py-3">
                      <div className="mt-0.5 rounded-full bg-[#17212b] p-2 text-white/60">
                        <Bell size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{event.action.replaceAll("_", " ")}</p>
                        <p className="text-xs text-white/45">
                          {event.user ? event.user.name : "System"} · {event.entity_type}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-xs text-white/35">
                        {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
