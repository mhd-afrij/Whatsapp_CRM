"use client";

import { useQuery } from "@tanstack/react-query";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PageHeader } from "@/components/ui/PageHeader";
import { authFetch } from "@/stores/auth-store";
import { ApiError } from "@/lib/api-error";
import type { DashboardStats } from "@/types/inbox";
import type { Lead, TaskItem } from "@/types/admin";

const STAGE_COLORS: Record<string, string> = {
  new: "#0369a1",
  qualified: "#0891b2",
  proposal: "#f59e0b",
  won: "#189652",
  lost: "#dc2626",
};

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remaining}s` : `${remaining}s`;
}

function computeAnalyticsSummary(leads: Lead[], tasks: TaskItem[]) {
  const nowMs = Date.now();
  const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  const todayEnd = new Date().setHours(23, 59, 59, 999);

  const newLeads = leads.filter((l) => new Date(l.created_at).getTime() >= weekAgo).length;
  const wonLeads = leads.filter((l) => l.stage === "won").length;
  const conversionRate = leads.length > 0 ? Math.round((wonLeads / leads.length) * 100) : 0;
  const pipelineValue = leads
    .filter((l) => l.stage !== "won" && l.stage !== "lost")
    .reduce((sum, l) => sum + (Number(l.value) || 0), 0);

  const openTasks = tasks.filter((t) => t.status === "open");
  const tasksDueToday = openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() <= todayEnd).length;
  const overdueTasks = openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < nowMs).length;

  return { newLeads, conversionRate, pipelineValue, tasksDueToday, overdueTasks };
}

export default function AnalyticsPage() {
  const statsQuery = useQuery({
    queryKey: ["analytics", "dashboard-stats"],
    queryFn: () => authFetch<DashboardStats>("/dashboard/stats"),
  });
  const leadsQuery = useQuery({
    queryKey: ["analytics", "leads"],
    queryFn: () => authFetch<Lead[]>("/crm/leads"),
  });
  const tasksQuery = useQuery({
    queryKey: ["analytics", "tasks"],
    queryFn: () => authFetch<TaskItem[]>("/crm/tasks"),
  });

  const forbidden =
    (statsQuery.error instanceof ApiError && statsQuery.error.status === 403) ||
    (leadsQuery.error instanceof ApiError && leadsQuery.error.status === 403) ||
    (tasksQuery.error instanceof ApiError && tasksQuery.error.status === 403);

  const stats = statsQuery.data;
  const leads = leadsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];

  const { newLeads, conversionRate, pipelineValue, tasksDueToday, overdueTasks } = computeAnalyticsSummary(
    leads,
    tasks
  );

  const kpis = [
    { label: "Open conversations", value: stats ? String(stats.open_conversations) : "—" },
    { label: "Avg. first response time", value: stats ? formatDuration(stats.avg_response_seconds) : "—" },
    { label: "Resolution rate", value: stats ? `${stats.resolution_rate}%` : "—" },
    { label: "New leads (7d)", value: String(newLeads) },
    { label: "Conversion rate", value: `${conversionRate}%` },
    { label: "Pipeline value", value: pipelineValue.toLocaleString(undefined, { style: "currency", currency: "USD" }) },
    { label: "Tasks due today", value: String(tasksDueToday) },
    { label: "Overdue tasks", value: String(overdueTasks) },
  ];

  const leadsByStage = Object.entries(
    leads.reduce<Record<string, number>>((acc, lead) => {
      acc[lead.stage] = (acc[lead.stage] ?? 0) + 1;
      return acc;
    }, {})
  ).map(([stage, count]) => ({ stage, count }));

  return (
    <div>
      <PageHeader title="Analytics" description="Workspace-wide KPIs across conversations, leads, and tasks." />

      {forbidden && (
        <div className="rounded-[10px] border border-border-muted bg-surface p-5 text-sm text-text-muted mb-6">
          You don&apos;t have permission to view some of this analytics data.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-[10px] border border-border bg-surface p-5">
            <p className="text-xs text-text-muted mb-2">{kpi.label}</p>
            <p className="text-2xl font-semibold text-text-primary">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-[10px] border border-border bg-surface p-5">
          <p className="text-sm font-medium text-text-primary mb-1">Conversations by status</p>
          <p className="text-xs text-text-muted mb-4">{stats?.total_conversations ?? 0} total</p>
          <div className="h-56">
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
                    <Cell key={entry.status} fill={entry.status === "open" ? "#25d366" : "#718087"} />
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
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[10px] border border-border bg-surface p-5">
          <p className="text-sm font-medium text-text-primary mb-1">Leads by stage</p>
          <p className="text-xs text-text-muted mb-4">Current pipeline distribution</p>
          {leadsByStage.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-text-muted">No leads yet.</div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={leadsByStage} dataKey="count" nameKey="stage" innerRadius={55} outerRadius={80} paddingAngle={2}>
                    {leadsByStage.map((entry) => (
                      <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] ?? "#718087"} />
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
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
