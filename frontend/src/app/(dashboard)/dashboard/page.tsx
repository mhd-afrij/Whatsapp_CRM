"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock3, Download, Inbox, RefreshCw, Users, WalletCards } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RequirePermission } from "@/components/auth/require-permission";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { DashboardHeroChart } from "@/components/dashboard/dashboard-hero-chart";
import { DashboardKpiCard } from "@/components/dashboard/dashboard-kpi-card";
import { usePermission } from "@/hooks/use-permission";
import { useUsers } from "@/hooks/use-users";
import { DashboardOverviewWidgets } from "@/components/dashboard/dashboard-overview-widgets";
import { useAgentPerformance, useConversationVolume, useDashboardSummary, useResponseTimeTrend, useWonVsLost } from "@/hooks/use-analytics";
import { requestReportExport } from "@/lib/analytics-api";

const SERIES = ["var(--chart-series-1)", "var(--chart-series-2)", "var(--chart-series-3)", "var(--chart-series-4)", "var(--chart-series-5)"];
const tooltipStyle = { backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 12, color: "var(--color-text)" };

/** Local-calendar date (YYYY-MM-DD), not UTC — avoids off-by-one-day windows near midnight. */
function todayIso(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function currency(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function chartValues<T>(data: T[] | undefined, selector: (item: T) => number | null) {
  return (data ?? []).map(selector).filter((value): value is number => value != null);
}

function ChartCard({
  title,
  isLoading,
  isError,
  isEmpty,
  emptyLabel,
  onRetry,
  children,
}: {
  title: string;
  isLoading: boolean;
  isError?: boolean;
  isEmpty: boolean;
  emptyLabel: string;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-xs">
      <h2 className="mb-2 text-sm font-bold text-text">{title}</h2>
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-border/60" />
      ) : isError ? (
        <div className="flex h-24 flex-col items-center justify-center gap-1.5 text-xs text-danger">
          <span>Unable to load {emptyLabel}.</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="text-xs font-semibold text-primary hover:underline">
              Retry
            </button>
          )}
        </div>
      ) : isEmpty ? (
        <div className="flex h-24 items-center justify-center text-xs text-muted">
          No {emptyLabel} yet for this period.
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function ExportCta({ from, to }: { from: string; to: string }) {
  const canExport = usePermission("analytics.export");
  const [state, setState] = useState<"idle" | "generating" | "queued" | "error">("idle");
  if (!canExport) return null;
  async function trigger() {
    setState("generating");
    try {
      await requestReportExport("deals", { from, to });
      setState("queued");
      window.setTimeout(() => setState("idle"), 8000);
    } catch {
      setState("error");
      window.setTimeout(() => setState("idle"), 4000);
    }
  }
  return (
    <div className="flex items-center gap-2">
      {state === "queued" && (
        <Link href="/settings/notifications" className="text-xs font-semibold text-primary hover:underline">
          Open notification
        </Link>
      )}
      <button
        type="button"
        onClick={trigger}
        disabled={state === "generating"}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-primary-dark disabled:opacity-60"
      >
        <Download className="size-3.5" />
        {state === "generating"
          ? "Generating..."
          : state === "queued"
            ? "Report queued"
            : state === "error"
              ? "Export failed - retry"
              : "Export report"}
      </button>
    </div>
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
  const [to, setTo] = useState(todayIso());
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
  const wonVsLost = useWonVsLost(agentFilters);
  const agentPerformance = useAgentPerformance(agentFilters);
  const s = summary.data;
  const analyticsQueries = [summary, volume, responseTrend, wonVsLost, agentPerformance];
  const refreshing = analyticsQueries.some((query) => query.isFetching);
  const refresh = () => {
    void Promise.all(analyticsQueries.map((query) => query.refetch()));
  };

  return (
    <div className="space-y-4 pb-2">
      <header className="rounded-xl border border-border bg-surface p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-text sm:text-lg">
                {greeting()}, here&apos;s the pulse
              </h1>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                Workspace
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              A clear view of conversations, pipeline momentum, and team execution.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-text transition hover:bg-surface disabled:opacity-60"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <ExportCta from={from} to={to} />
          </div>
        </div>
        <div className="mt-3.5 border-t border-border/60 pt-3">
          <DashboardFilters
            from={from}
            to={to}
            today={todayIso()}
            agentUserId={agentUserId}
            users={users ?? []}
            canViewUsers={canViewUsers}
            onFromChange={setFrom}
            onToChange={setTo}
            onAgentChange={setAgentUserId}
          />
        </div>
      </header>

      {summary.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-border/60" />
          ))}
        </div>
      ) : summary.isError ? (
        <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-light/30 p-4 text-sm text-danger">
          <AlertCircle className="size-4" />
          Unable to load dashboard summary.
        </div>
      ) : (
        s && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <DashboardKpiCard
              label="Open conversations"
              value={String(s.conversations.open)}
              supportingText={`${s.conversations.unassigned} unassigned to an agent`}
              icon={Inbox}
              tone="blue"
            />
            <DashboardKpiCard
              label="New contacts"
              value={String(s.contacts.new)}
              supportingText="Added during this period"
              icon={Users}
              tone="green"
            />
            <DashboardKpiCard
              label="Pipeline value"
              value={currency(s.deals.pipeline_value)}
              supportingText="Current open deal value"
              icon={WalletCards}
              tone="violet"
            />
            <DashboardKpiCard
              label="Won value"
              value={currency(s.deals.won_value)}
              supportingText={`${s.deals.lost_count} lost deals in period`}
              icon={CheckCircle2}
              tone="green"
              trend={chartValues(wonVsLost.data, (point) => point.won_value)}
            />
            <DashboardKpiCard
              label="Avg first response"
              value={s.response_time.avg_first_response_minutes != null ? `${s.response_time.avg_first_response_minutes} min` : "N/A"}
              supportingText={s.response_time.sample_size > 0 ? `${s.response_time.sample_size} measured replies` : "No replies measured yet"}
              icon={Clock3}
              tone="orange"
              trend={chartValues(responseTrend.data, (point) => point.avg_response_minutes)}
            />
            <DashboardKpiCard
              label="Overdue tasks"
              value={String(s.tasks.overdue)}
              supportingText="Needs attention from the team"
              icon={AlertCircle}
              tone="red"
            />
          </div>
        )
      )}

      <DashboardHeroChart data={wonVsLost.data} isLoading={wonVsLost.isLoading} isError={wonVsLost.isError} />

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Conversation volume"
          isLoading={volume.isLoading}
          isError={volume.isError}
          onRetry={() => volume.refetch()}
          isEmpty={!volume.data?.some((point) => point.count > 0)}
          emptyLabel="conversations"
        >
          <ResponsiveContainer width="100%" height={240}>
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
          title="Response time trend"
          isLoading={responseTrend.isLoading}
          isError={responseTrend.isError}
          onRetry={() => responseTrend.refetch()}
          isEmpty={!responseTrend.data?.some((point) => point.avg_response_minutes != null)}
          emptyLabel="response data"
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={responseTrend.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="avg_response_minutes"
                name="Avg response (min)"
                stroke={SERIES[1]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <DashboardOverviewWidgets filters={agentFilters} summary={s} agentPerformance={agentPerformance.data} />
    </div>
  );
}
