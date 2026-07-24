"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/ui/PageHeader";
import { authFetch, useAuthStore } from "@/stores/auth-store";
import { ApiError } from "@/lib/api-error";
import type { AuditLogEntry, RoleWithPermissions, TeamMember } from "@/types/admin";
import type { DashboardStats } from "@/types/inbox";

const STATUS_COLORS: Record<string, string> = {
  open: "#25d366",
  pending: "#fbbf24",
  closed: "#718087",
};

const OVERVIEW_COLORS = { incoming: "#189652", outgoing: "#0369a1" };

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remaining}s` : `${remaining}s`;
}

function formatDay(dateIso: string) {
  return new Date(dateIso).toLocaleDateString([], { weekday: "short" });
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
  const rolesQuery = useQuery({
    queryKey: ["dashboard", "roles"],
    queryFn: () => authFetch<RoleWithPermissions[]>("/roles"),
  });
  const permissionsQuery = useQuery({
    queryKey: ["dashboard", "permissions"],
    queryFn: () => authFetch<{ id: number; key: string }[]>("/permissions"),
  });
  const auditQuery = useQuery({
    queryKey: ["dashboard", "audit"],
    queryFn: () => authFetch<AuditLogEntry[]>("/audit-logs"),
  });

  const teamMembers = teamQuery.data ?? [];
  const activeMembers = teamMembers.filter((member) => member.status === "active").length;
  const auditEvents = auditQuery.data ?? [];
  const recentAuditEvents = auditEvents.slice(0, 4);

  const stats = statsQuery.data;
  const statsForbidden = statsQuery.error instanceof ApiError && statsQuery.error.status === 403;

  const conversationKpis = [
    { label: "Total Conversations", value: stats ? String(stats.total_conversations) : "—" },
    { label: "Open Conversations", value: stats ? String(stats.open_conversations) : "—" },
    { label: "Unread Messages", value: stats ? String(stats.unread_messages) : "—" },
    { label: "New Contacts (7d)", value: stats ? String(stats.new_contacts) : "—" },
    { label: "Avg Response Time", value: stats ? formatDuration(stats.avg_response_seconds) : "—" },
    { label: "Resolution Rate", value: stats ? `${stats.resolution_rate}%` : "—" },
  ];

  const kpis = [
    { label: "Team members", value: teamQuery.isLoading ? "..." : String(teamMembers.length) },
    { label: "Active members", value: teamQuery.isLoading ? "..." : String(activeMembers) },
    { label: "Roles", value: rolesQuery.isLoading ? "..." : String(rolesQuery.data?.length ?? 0) },
    { label: "Permissions", value: permissionsQuery.isLoading ? "..." : String(permissionsQuery.data?.length ?? 0) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={user ? `Welcome back, ${user.name.split(" ")[0]}` : "Dashboard"}
        description={`${user?.workspace.name ?? "Workspace"} · Signed in as ${
          user?.roles.join(", ") ?? "member"
        }`}
      />

      {statsForbidden ? (
        <div className="rounded-[10px] border border-border-muted bg-surface p-5 text-sm text-text-muted">
          You don&apos;t have permission to view conversation analytics.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
            {conversationKpis.map((kpi) => (
              <div key={kpi.label} className="rounded-[10px] border border-border bg-surface p-5">
                <p className="text-xs text-text-muted mb-2">{kpi.label}</p>
                <p className="text-2xl font-semibold text-text-primary">{kpi.value}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
            <div className="rounded-[10px] border border-border bg-surface p-5">
              <p className="text-sm font-medium text-text-primary mb-1">Conversations Overview</p>
              <p className="text-xs text-text-muted mb-4">Incoming vs. outgoing messages, last 7 days</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats?.conversations_overview ?? []} margin={{ left: -16, right: 8 }}>
                    <defs>
                      <linearGradient id="incomingFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={OVERVIEW_COLORS.incoming} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={OVERVIEW_COLORS.incoming} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="outgoingFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={OVERVIEW_COLORS.outgoing} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={OVERVIEW_COLORS.outgoing} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-muted)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDay}
                      tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                      axisLine={{ stroke: "var(--border-muted)" }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      labelFormatter={(value) => (typeof value === "string" ? new Date(value).toLocaleDateString() : value)}
                      contentStyle={{
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="incoming"
                      name="Incoming"
                      stroke={OVERVIEW_COLORS.incoming}
                      strokeWidth={2}
                      fill="url(#incomingFill)"
                    />
                    <Area
                      type="monotone"
                      dataKey="outgoing"
                      name="Outgoing"
                      stroke={OVERVIEW_COLORS.outgoing}
                      strokeWidth={2}
                      fill="url(#outgoingFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-[10px] border border-border bg-surface p-5">
              <p className="text-sm font-medium text-text-primary mb-1">Conversations by Status</p>
              <p className="text-xs text-text-muted mb-4">{stats?.total_conversations ?? 0} total</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats?.conversations_by_status ?? []}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {(stats?.conversations_by_status ?? []).map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#718087"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(value: string) => value.charAt(0).toUpperCase() + value.slice(1)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="rounded-[10px] border border-border bg-surface p-5">
            <p className="text-sm font-medium text-text-primary mb-1">Unassigned Conversations</p>
            <p className="text-xs text-text-muted mb-4">Open conversations waiting for an owner</p>
            {(stats?.unassigned_conversations ?? []).length === 0 ? (
              <p className="text-sm text-text-muted">Nothing unassigned right now.</p>
            ) : (
              <div className="space-y-3">
                {stats?.unassigned_conversations.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-text-primary">{c.contact_name ?? c.contact_phone}</p>
                      <p className="text-xs text-text-muted">{c.contact_phone}</p>
                    </div>
                    <span className="text-xs text-text-muted whitespace-nowrap">
                      {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-[10px] border border-border bg-surface p-5">
            <p className="text-xs text-text-muted mb-2">{kpi.label}</p>
            <p className="text-2xl font-semibold text-text-primary">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-[10px] border border-border bg-surface p-5">
          <p className="text-sm font-medium text-text-primary mb-1">Workspace snapshot</p>
          <p className="text-xs text-text-muted mb-4">Live summary from the CRM API</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-text-secondary">Workspace</span>
              <span className="text-text-primary">{user?.workspace.slug ?? "demo"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-text-secondary">Timezone</span>
              <span className="text-text-primary">{user?.workspace.timezone ?? "UTC"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-text-secondary">Audit events</span>
              <span className="text-text-primary">{auditEvents.length}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[10px] border border-border bg-surface p-5">
          <p className="text-sm font-medium text-text-primary mb-1">Recent activity</p>
          <p className="text-xs text-text-muted mb-4">Latest events in this workspace</p>
          <div className="space-y-3">
            {recentAuditEvents.length === 0 ? (
              <p className="text-sm text-text-muted">No recent events yet.</p>
            ) : (
              recentAuditEvents.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-text-primary">{event.action}</p>
                    <p className="text-xs text-text-muted">
                      {event.entity_type}
                      {event.entity_id ? ` #${event.entity_id}` : ""}
                      {event.user ? ` · ${event.user.name}` : " · System"}
                    </p>
                  </div>
                  <span className="text-xs text-text-muted whitespace-nowrap">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
