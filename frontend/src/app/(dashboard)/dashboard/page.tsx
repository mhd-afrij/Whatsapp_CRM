"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { useUsers } from "@/hooks/use-users";
import {
  useAgentPerformance,
  useConversationVolume,
  useDashboardSummary,
  useLeadFunnel,
  usePipelineStageDistribution,
  useResponseTimeTrend,
  useTaskCompletionRate,
  useWonVsLost,
} from "@/hooks/use-analytics";
import { requestReportExport, type ReportExportType } from "@/lib/analytics-api";

const SERIES = [
  "var(--chart-series-1)",
  "var(--chart-series-2)",
  "var(--chart-series-3)",
  "var(--chart-series-4)",
  "var(--chart-series-5)",
  "var(--chart-series-6)",
];

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function ChartSkeleton() {
  return <div className="h-64 animate-pulse rounded bg-border/60" />;
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted">
      No {label} yet for this period.
    </div>
  );
}

function ChartCard({
  title,
  isLoading,
  isEmpty,
  emptyLabel,
  children,
}: {
  title: string;
  isLoading: boolean;
  isEmpty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text">{title}</h2>
      {isLoading ? <ChartSkeleton /> : isEmpty ? <EmptyChart label={emptyLabel} /> : children}
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--color-text)",
};

function ExportButton({ type, label, from, to }: { type: ReportExportType; label: string; from: string; to: string }) {
  const canExport = usePermission("analytics.export");
  const [state, setState] = useState<"idle" | "generating" | "queued" | "error">("idle");

  if (!canExport) return null;

  const trigger = async () => {
    setState("generating");
    try {
      await requestReportExport(type, { from, to });
      setState("queued");
      setTimeout(() => setState("idle"), 4000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 4000);
    }
  };

  return (
    <button
      type="button"
      onClick={trigger}
      disabled={state === "generating"}
      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-primary-soft/40 disabled:opacity-60"
    >
      {state === "generating"
        ? "Generating..."
        : state === "queued"
        ? "Queued - check notifications"
        : state === "error"
        ? "Failed - retry"
        : `Export ${label}`}
    </button>
  );
}

export default function DashboardPage() {
  return (
    <RequirePermission permission="dashboard.view_workspace">
      <DashboardContent />
    </RequirePermission>
  );
}

function DashboardContent() {
  const [from, setFrom] = useState(todayIso(-29));
  const [to, setTo] = useState(todayIso(0));
  const [agentUserId, setAgentUserId] = useState<number | "">("");

  const canViewUsers = usePermission("users.view");
  const { data: users } = useUsers();

  const baseFilters = useMemo(() => ({ from, to }), [from, to]);
  const agentFilters = useMemo(
    () => ({ from, to, agent_user_id: agentUserId === "" ? undefined : agentUserId }),
    [from, to, agentUserId]
  );

  const summary = useDashboardSummary(baseFilters);
  const volume = useConversationVolume(baseFilters);
  const responseTrend = useResponseTimeTrend(baseFilters);
  const funnel = useLeadFunnel(agentFilters);
  const stageDistribution = usePipelineStageDistribution(agentFilters);
  const wonVsLost = useWonVsLost(agentFilters);
  const agentPerformance = useAgentPerformance(agentFilters);
  const taskCompletion = useTaskCompletionRate(agentFilters);

  const s = summary.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Workspace activity and performance overview.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-muted">
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
          />
        </label>
        <label className="flex flex-col text-xs text-muted">
          To
          <input
            type="date"
            value={to}
            min={from}
            max={todayIso(0)}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
          />
        </label>
        {canViewUsers && (
          <label className="flex flex-col text-xs text-muted">
            Agent
            <select
              value={agentUserId}
              onChange={(e) => setAgentUserId(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
            >
              <option value="">All agents</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {summary.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-border/60" />
          ))}
        </div>
      ) : summary.isError ? (
        <p className="text-sm text-danger">Unable to load dashboard summary.</p>
      ) : (
        s && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="New conversations" value={String(s.conversations.new)} />
            <MetricCard label="Open conversations" value={String(s.conversations.open)} sub={`${s.conversations.unassigned} unassigned`} />
            <MetricCard label="Closed conversations" value={String(s.conversations.closed)} />
            <MetricCard
              label="Avg first response"
              value={s.response_time.avg_first_response_minutes != null ? `${s.response_time.avg_first_response_minutes} min` : "N/A"}
              sub={s.response_time.sample_size > 0 ? `${s.response_time.sample_size} samples` : "No replies yet"}
            />
            <MetricCard label="New contacts" value={String(s.contacts.new)} />
            <MetricCard label="New leads" value={String(s.leads.new)} sub={`${s.leads.conversion_rate_percent}% converted`} />
            <MetricCard label="Pipeline value" value={`$${s.deals.pipeline_value.toLocaleString()}`} />
            <MetricCard label="Won value" value={`$${s.deals.won_value.toLocaleString()}`} sub={`${s.deals.lost_count} lost`} />
            <MetricCard label="Overdue tasks" value={String(s.tasks.overdue)} />
          </div>
        )
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Conversation volume" isLoading={volume.isLoading} isEmpty={!volume.data?.some((d) => d.count > 0)} emptyLabel="conversations">
          <ResponsiveContainer width="100%" height={256}>
            <BarChart data={volume.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="New conversations" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Response time trend (minutes)"
          isLoading={responseTrend.isLoading}
          isEmpty={!responseTrend.data?.some((d) => d.avg_response_minutes != null)}
          emptyLabel="response data"
        >
          <ResponsiveContainer width="100%" height={256}>
            <LineChart data={responseTrend.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="avg_response_minutes" name="Avg response (min)" stroke={SERIES[1]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lead funnel" isLoading={funnel.isLoading} isEmpty={!funnel.data?.some((d) => d.count > 0)} emptyLabel="leads">
          <ResponsiveContainer width="100%" height={256}>
            <BarChart data={funnel.data ?? []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis type="category" dataKey="status" tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={90} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Leads" fill={SERIES[2]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Pipeline stage distribution"
          isLoading={stageDistribution.isLoading}
          isEmpty={!(stageDistribution.data && stageDistribution.data.length > 0)}
          emptyLabel="open deals"
        >
          <ResponsiveContainer width="100%" height={256}>
            <PieChart>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, _name, item) => [
                  `${value} deals ($${Number(item.payload.value).toLocaleString()})`,
                  item.payload.stage_name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--color-muted)" }} />
              <Pie
                data={stageDistribution.data ?? []}
                dataKey="count"
                nameKey="stage_name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={(entry) => (entry as unknown as { stage_name: string }).stage_name}
              >
                {(stageDistribution.data ?? []).map((entry, i) => (
                  <Cell key={entry.stage_id ?? i} fill={SERIES[i % SERIES.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Won vs. lost"
          isLoading={wonVsLost.isLoading}
          isEmpty={!wonVsLost.data?.some((d) => d.won_count > 0 || d.lost_count > 0)}
          emptyLabel="closed deals"
        >
          <ResponsiveContainer width="100%" height={256}>
            <AreaChart data={wonVsLost.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--color-muted)" }} />
              <Area type="monotone" dataKey="won_count" name="Won" stroke={SERIES[2]} fill={SERIES[2]} fillOpacity={0.25} strokeWidth={2} />
              <Area type="monotone" dataKey="lost_count" name="Lost" stroke={SERIES[4]} fill={SERIES[4]} fillOpacity={0.25} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Agent performance"
          isLoading={agentPerformance.isLoading}
          isEmpty={!(agentPerformance.data && agentPerformance.data.length > 0)}
          emptyLabel="agent activity"
        >
          <ResponsiveContainer width="100%" height={256}>
            <BarChart data={agentPerformance.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--color-muted)" }} />
              <Bar dataKey="conversations_handled" name="Conversations closed" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="tasks_completed" name="Tasks completed" fill={SERIES[3]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-text">Task completion rate</h2>
        {taskCompletion.isLoading ? (
          <div className="h-10 animate-pulse rounded bg-border/60" />
        ) : taskCompletion.data && taskCompletion.data.total > 0 ? (
          <p className="text-sm text-text">
            {taskCompletion.data.completed} of {taskCompletion.data.total} tasks completed (
            <span className="font-semibold">{taskCompletion.data.rate_percent}%</span>)
          </p>
        ) : (
          <p className="text-sm text-muted">No tasks created in this period yet.</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text">Export reports</h2>
        <div className="flex flex-wrap gap-2">
          <ExportButton type="contacts" label="contacts" from={from} to={to} />
          <ExportButton type="leads" label="leads" from={from} to={to} />
          <ExportButton type="deals" label="deals" from={from} to={to} />
          <ExportButton type="tasks" label="tasks" from={from} to={to} />
        </div>
        <p className="mt-2 text-xs text-muted">
          Exports are generated in the background - you&apos;ll get a notification with a download link when ready.
        </p>
      </div>
    </div>
  );
}
