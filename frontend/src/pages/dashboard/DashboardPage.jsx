import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dashboardService } from "../../services/dashboardService.js";
import { useAuthStore } from "../../store/index.js";
import { ActivityFeed } from "../../components/common/ActivityFeed.jsx";
import { formatDuration } from "../../utils/formatDate.js";

const STATUS_COLORS = { open: "#25d366", pending: "#fbbf24", closed: "#718087" };
const OVERVIEW_COLORS = { incoming: "#189652", outgoing: "#0369a1" };
const FUNNEL_COLORS = ["#25d366", "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"];

function formatDay(dateIso) {
  return new Date(dateIso).toLocaleDateString([], { weekday: "short" });
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [volumePeriod, setVolumePeriod] = useState("7d");

  const statsQuery = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: dashboardService.getStats,
    refetchInterval: 30000,
  });

  const agentQuery = useQuery({
    queryKey: ["dashboard", "agents"],
    queryFn: dashboardService.getAgentPerformance,
  });

  const volumeQuery = useQuery({
    queryKey: ["dashboard", "volume", volumePeriod],
    queryFn: () => dashboardService.getMessageVolume(volumePeriod),
  });

  const funnelQuery = useQuery({
    queryKey: ["dashboard", "funnel"],
    queryFn: dashboardService.getFunnel,
  });

  const activityQuery = useQuery({
    queryKey: ["dashboard", "activity"],
    queryFn: dashboardService.getActivity,
  });

  const stats = statsQuery.data;
  const statsForbidden = statsQuery.error?.status === 403;

  const conversationKpis = [
    { label: "Total Conversations", value: stats ? String(stats.total_conversations) : "\u2014" },
    { label: "Open Conversations", value: stats ? String(stats.open_conversations) : "\u2014" },
    { label: "Unread Messages", value: stats ? String(stats.unread_messages) : "\u2014" },
    { label: "New Contacts (7d)", value: stats ? String(stats.new_contacts) : "\u2014" },
    { label: "Avg Response Time", value: stats ? formatDuration(stats.avg_response_seconds) : "\u2014" },
    { label: "Resolution Rate", value: stats ? `${stats.resolution_rate}%` : "\u2014" },
    { label: "Active Agents", value: stats ? String(stats.active_agents) : "\u2014" },
    { label: "Overdue Tasks", value: stats ? String(stats.overdue_tasks) : "\u2014" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          {user ? `Welcome back, ${user.name.split(" ")[0]}` : "Dashboard"}
        </h1>
        <p className="text-sm text-text-muted mt-1">{user?.workspace?.name ?? "Workspace"}</p>
      </div>

      {statsForbidden ? (
        <div className="rounded-[10px] border border-border-muted bg-surface p-5 text-sm text-text-muted">
          You don't have permission to view conversation analytics.
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {conversationKpis.map((kpi) => (
              <div key={kpi.label} className="rounded-[10px] border border-border bg-surface p-5">
                <p className="text-xs text-text-muted mb-2">{kpi.label}</p>
                <p className="text-2xl font-semibold text-text-primary">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Message Volume Chart */}
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-text-primary">Message Volume</p>
                <p className="text-xs text-text-muted">Incoming vs. outgoing messages</p>
              </div>
              <div className="flex gap-1">
                {["7d", "30d", "90d"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setVolumePeriod(p)}
                    className={`px-2.5 py-1 text-xs rounded-md ${
                      volumePeriod === p ? "bg-primary text-primary-foreground" : "bg-surface-raised text-text-muted hover:bg-surface-hover"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeQuery.data ?? []} margin={{ left: -16, right: 8 }}>
                  <defs>
                    <linearGradient id="incFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={OVERVIEW_COLORS.incoming} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={OVERVIEW_COLORS.incoming} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={OVERVIEW_COLORS.outgoing} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={OVERVIEW_COLORS.outgoing} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-muted)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDay} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--border-muted)" }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="incoming" name="Incoming" stroke={OVERVIEW_COLORS.incoming} strokeWidth={2} fill="url(#incFill)" />
                  <Area type="monotone" dataKey="outgoing" name="Outgoing" stroke={OVERVIEW_COLORS.outgoing} strokeWidth={2} fill="url(#outFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Agent Performance */}
            <div className="rounded-[10px] border border-border bg-surface p-5">
              <p className="text-sm font-medium text-text-primary mb-1">Agent Leaderboard</p>
              <p className="text-xs text-text-muted mb-4">Top agents by conversations resolved</p>
              {agentQuery.data && agentQuery.data.length > 0 ? (
                <div className="space-y-3">
                  {agentQuery.data.slice(0, 5).map((agent, idx) => (
                    <div key={agent.agent_id} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-text-muted w-4">{idx + 1}.</span>
                      <div className="h-7 w-7 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-primary shrink-0">
                        {agent.name?.charAt(0) ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{agent.name}</p>
                      </div>
                      <span className="text-xs text-text-muted">{agent.conversations_resolved} resolved</span>
                      <span className="text-xs text-text-muted">{agent.messages_sent} msgs</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">No agent data yet.</p>
              )}
            </div>

            {/* Lead Funnel */}
            <div className="rounded-[10px] border border-border bg-surface p-5">
              <p className="text-sm font-medium text-text-primary mb-1">Lead Funnel</p>
              <p className="text-xs text-text-muted mb-4">Leads by pipeline stage</p>
              {funnelQuery.data && funnelQuery.data.length > 0 ? (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelQuery.data} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-muted)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="stage" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {funnelQuery.data.map((_, i) => (
                          <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-text-muted">No leads yet.</p>
              )}
            </div>

            {/* Status Pie */}
            <div className="rounded-[10px] border border-border bg-surface p-5">
              <p className="text-sm font-medium text-text-primary mb-1">Conversations by Status</p>
              <p className="text-xs text-text-muted mb-4">{stats?.total_conversations ?? 0} total</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats?.conversations_by_status ?? []} dataKey="count" nameKey="status" innerRadius={45} outerRadius={70} paddingAngle={2}>
                      {(stats?.conversations_by_status ?? []).map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#718087"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Activity Feed */}
            <div className="rounded-[10px] border border-border bg-surface p-5">
              <p className="text-sm font-medium text-text-primary mb-1">Recent Activity</p>
              <p className="text-xs text-text-muted mb-4">Latest actions across your workspace</p>
              <div className="max-h-56 overflow-y-auto">
                <ActivityFeed activities={activityQuery.data} />
              </div>
            </div>
          </div>

          {/* Unassigned Conversations */}
          {stats?.unassigned_conversations?.length > 0 && (
            <div className="rounded-[10px] border border-yellow-200 bg-yellow-50 p-5">
              <p className="text-sm font-medium text-yellow-800 mb-2">Unassigned Conversations</p>
              <div className="space-y-2">
                {stats.unassigned_conversations.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-yellow-900">{c.contact_name} ({c.contact_phone})</span>
                    <span className="text-yellow-700 text-xs">{c.last_message_at ? new Date(c.last_message_at).toLocaleString() : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
