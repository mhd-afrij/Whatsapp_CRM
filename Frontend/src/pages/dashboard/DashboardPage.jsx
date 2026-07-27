import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { authFetch, useAuthStore } from "../../store/index.js";
import { ApiError } from "../../utils/apiError.js";
import { formatDuration } from "../../utils/formatDate.js";

const STATUS_COLORS = { open: "#25d366", pending: "#fbbf24", closed: "#718087" };
const OVERVIEW_COLORS = { incoming: "#189652", outgoing: "#0369a1" };

function formatDay(dateIso) {
  return new Date(dateIso).toLocaleDateString([], { weekday: "short" });
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  const statsQuery = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => authFetch("/dashboard/stats"),
    refetchInterval: 30000,
  });

  const stats = statsQuery.data;
  const statsForbidden = statsQuery.error instanceof ApiError && statsQuery.error.status === 403;

  const conversationKpis = [
    { label: "Total Conversations", value: stats ? String(stats.total_conversations) : "\u2014" },
    { label: "Open Conversations", value: stats ? String(stats.open_conversations) : "\u2014" },
    { label: "Unread Messages", value: stats ? String(stats.unread_messages) : "\u2014" },
    { label: "New Contacts (7d)", value: stats ? String(stats.new_contacts) : "\u2014" },
    { label: "Avg Response Time", value: stats ? formatDuration(stats.avg_response_seconds) : "\u2014" },
    { label: "Resolution Rate", value: stats ? `${stats.resolution_rate}%` : "\u2014" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          {user ? `Welcome back, ${user.name.split(" ")[0]}` : "Dashboard"}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {user?.workspace.name ?? "Workspace"}
        </p>
      </div>

      {statsForbidden ? (
        <div className="rounded-[10px] border border-border-muted bg-surface p-5 text-sm text-text-muted">
          You don't have permission to view conversation analytics.
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
                    <XAxis dataKey="date" tickFormatter={formatDay} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--border-muted)" }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip labelFormatter={(value) => typeof value === "string" ? new Date(value).toLocaleDateString() : value} contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="incoming" name="Incoming" stroke={OVERVIEW_COLORS.incoming} strokeWidth={2} fill="url(#incomingFill)" />
                    <Area type="monotone" dataKey="outgoing" name="Outgoing" stroke={OVERVIEW_COLORS.outgoing} strokeWidth={2} fill="url(#outgoingFill)" />
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
                    <Pie data={stats?.conversations_by_status ?? []} dataKey="count" nameKey="status" innerRadius={55} outerRadius={80} paddingAngle={2}>
                      {(stats?.conversations_by_status ?? []).map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#718087"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
