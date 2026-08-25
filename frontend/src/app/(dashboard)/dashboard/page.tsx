"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertCircle, CheckCircle2, Clock3, Download, Inbox, MessageSquare, RefreshCw, Users, WalletCards } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RequirePermission } from "@/components/auth/require-permission";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { DashboardHeroChart } from "@/components/dashboard/dashboard-hero-chart";
import { DashboardKpiCard } from "@/components/dashboard/dashboard-kpi-card";
import { usePermission } from "@/hooks/use-permission";
import { useUsers } from "@/hooks/use-users";
import { DashboardOverviewWidgets } from "@/components/dashboard/dashboard-overview-widgets";
import { useAgentPerformance, useConversationVolume, useDashboardSummary, useResponseTimeTrend, useTaskCompletionRate, useWonVsLost } from "@/hooks/use-analytics";
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
function currency(value: number) { return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }
function chartValues<T>(data: T[] | undefined, selector: (item: T) => number | null) { return (data ?? []).map(selector).filter((value): value is number => value != null); }

function ChartCard({ title, isLoading, isError, isEmpty, emptyLabel, onRetry, children }: { title: string; isLoading: boolean; isError?: boolean; isEmpty: boolean; emptyLabel: string; onRetry?: () => void; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"><h2 className="mb-4 text-sm font-bold text-text">{title}</h2>{isLoading ? <div className="h-64 animate-pulse rounded-xl bg-border/60" /> : isError ? <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-danger"><span>Unable to load {emptyLabel}.</span>{onRetry && <button type="button" onClick={onRetry} className="text-xs font-semibold text-primary hover:underline">Retry</button>}</div> : isEmpty ? <div className="flex h-64 items-center justify-center text-sm text-muted">No {emptyLabel} yet for this period.</div> : children}</section>;
}

function ExportCta({ from, to }: { from: string; to: string }) {
  const canExport = usePermission("analytics.export");
  const [state, setState] = useState<"idle" | "generating" | "queued" | "error">("idle");
  if (!canExport) return null;
  async function trigger() { setState("generating"); try { await requestReportExport("deals", { from, to }); setState("queued"); window.setTimeout(() => setState("idle"), 8000); } catch { setState("error"); window.setTimeout(() => setState("idle"), 4000); } }
  return <div className="flex items-center gap-2">
    {state === "queued" && <Link href="/settings/notifications" className="text-xs font-semibold text-primary hover:underline">Open notification</Link>}
    <button type="button" onClick={trigger} disabled={state === "generating"} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark disabled:opacity-60"><Download className="size-4" />{state === "generating" ? "Generating..." : state === "queued" ? "Report queued" : state === "error" ? "Export failed - retry" : "Export current report"}</button>
  </div>;
}

export default function DashboardPage() { return <RequirePermission permission="dashboard.view_workspace"><DashboardContent /></RequirePermission>; }

function DashboardContent() {
  const [from, setFrom] = useState(todayIso(-29));
  const [to, setTo] = useState(todayIso());
  const [agentUserId, setAgentUserId] = useState<number | "">("");
  const canViewUsers = usePermission("users.view");
  const { data: users } = useUsers();
  const baseFilters = useMemo(() => ({ from, to }), [from, to]);
  const agentFilters = useMemo(() => ({ from, to, agent_user_id: agentUserId === "" ? undefined : agentUserId }), [from, to, agentUserId]);
  const summary = useDashboardSummary(baseFilters);
  const volume = useConversationVolume(baseFilters);
  const responseTrend = useResponseTimeTrend(baseFilters);
  const wonVsLost = useWonVsLost(agentFilters);
  const agentPerformance = useAgentPerformance(agentFilters);
  const taskCompletion = useTaskCompletionRate(agentFilters);
  const s = summary.data;
  const analyticsQueries = [summary, volume, responseTrend, wonVsLost, agentPerformance, taskCompletion];
  const refreshing = analyticsQueries.some((query) => query.isFetching);
  const refresh = () => { void Promise.all(analyticsQueries.map((query) => query.refetch())); };
  const periodLabel = `${from} to ${to}`;

  return <div className="space-y-6 pb-8">
    <header className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-primary-soft/80 via-surface to-surface p-1 sm:flex-row sm:items-end sm:justify-between">
      <div className="px-1"><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Workspace intelligence</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-text">{greeting()}, here&apos;s the pulse.</h1><p className="mt-1 text-sm text-muted">A clear view of conversations, pipeline momentum, and team execution.</p></div>
      <div className="flex items-center gap-2"><button type="button" onClick={refresh} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-text transition hover:bg-background disabled:opacity-60"><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />Refresh</button><ExportCta from={from} to={to} /></div>
    </header>
    <DashboardFilters from={from} to={to} today={todayIso()} agentUserId={agentUserId} users={users ?? []} canViewUsers={canViewUsers} onFromChange={setFrom} onToChange={setTo} onAgentChange={setAgentUserId} />
    <p className="text-xs text-muted">Showing workspace performance for <span className="font-semibold text-text">{periodLabel}</span>{agentUserId !== "" ? " and the selected agent" : " across all agents"}.</p>

    {summary.isLoading ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl bg-border/60" />)}</div> : summary.isError ? <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-light/30 p-4 text-sm text-danger"><AlertCircle className="size-4" />Unable to load dashboard summary.</div> : s && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <DashboardKpiCard label="Open conversations" value={String(s.conversations.open)} supportingText={`${s.conversations.unassigned} unassigned to an agent`} icon={Inbox} tone="blue" />
      <DashboardKpiCard label="New contacts" value={String(s.contacts.new)} supportingText="Added during this period" icon={Users} tone="green" />
      <DashboardKpiCard label="Pipeline value" value={currency(s.deals.pipeline_value)} supportingText="Current open deal value" icon={WalletCards} tone="violet" />
      <DashboardKpiCard label="Won value" value={currency(s.deals.won_value)} supportingText={`${s.deals.lost_count} lost deals in period`} icon={CheckCircle2} tone="green" trend={chartValues(wonVsLost.data, (point) => point.won_value)} />
      <DashboardKpiCard label="Avg first response" value={s.response_time.avg_first_response_minutes != null ? `${s.response_time.avg_first_response_minutes} min` : "N/A"} supportingText={s.response_time.sample_size > 0 ? `${s.response_time.sample_size} measured replies` : "No replies measured yet"} icon={Clock3} tone="orange" trend={chartValues(responseTrend.data, (point) => point.avg_response_minutes)} />
      <DashboardKpiCard label="Overdue tasks" value={String(s.tasks.overdue)} supportingText="Needs attention from the team" icon={AlertCircle} tone="red" />
    </div>}

      <DashboardHeroChart data={wonVsLost.data} isLoading={wonVsLost.isLoading} isError={wonVsLost.isError} />

      <DashboardOverviewWidgets filters={agentFilters} summary={s} agentPerformance={agentPerformance.data} />

      <div className="grid gap-4 xl:grid-cols-2">
      <ChartCard title="Conversation volume" isLoading={volume.isLoading} isError={volume.isError} onRetry={() => volume.refetch()} isEmpty={!volume.data?.some((point) => point.count > 0)} emptyLabel="conversations"><ResponsiveContainer width="100%" height={256}><BarChart data={volume.data ?? []}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted)" }} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="count" name="New conversations" fill={SERIES[0]} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Response time trend" isLoading={responseTrend.isLoading} isError={responseTrend.isError} onRetry={() => responseTrend.refetch()} isEmpty={!responseTrend.data?.some((point) => point.avg_response_minutes != null)} emptyLabel="response data"><ResponsiveContainer width="100%" height={256}><LineChart data={responseTrend.data ?? []}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} /><YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} /><Tooltip contentStyle={tooltipStyle} /><Line type="monotone" dataKey="avg_response_minutes" name="Avg response (min)" stroke={SERIES[1]} strokeWidth={2} dot={{ r: 3 }} connectNulls /></LineChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Agent performance" isLoading={agentPerformance.isLoading} isError={agentPerformance.isError} onRetry={() => agentPerformance.refetch()} isEmpty={!(agentPerformance.data && agentPerformance.data.length > 0)} emptyLabel="agent activity"><ResponsiveContainer width="100%" height={256}><BarChart data={agentPerformance.data ?? []}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted)" }} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted)" }} /><Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11, color: "var(--color-muted)" }} /><Bar dataKey="conversations_handled" name="Conversations closed" fill={SERIES[0]} radius={[4, 4, 0, 0]} /><Bar dataKey="tasks_completed" name="Tasks completed" fill={SERIES[3]} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard>
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"><div className="flex items-center gap-2"><Activity className="size-4 text-primary" /><h2 className="text-sm font-bold text-text">Task completion</h2></div>{taskCompletion.isLoading ? <div className="mt-6 h-3 animate-pulse rounded-full bg-border/60" /> : taskCompletion.data && taskCompletion.data.total > 0 ? <><div className="mt-6 h-3 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${taskCompletion.data.rate_percent}%` }} /></div><div className="mt-3 flex items-end justify-between"><p className="text-3xl font-bold text-text">{taskCompletion.data.rate_percent}%</p><p className="text-sm text-muted">{taskCompletion.data.completed} of {taskCompletion.data.total} tasks completed</p></div></> : <p className="mt-8 text-sm text-muted">No tasks created in this period yet.</p>}</section>
    </div>
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted shadow-sm"><MessageSquare className="size-4 text-primary" />Use the filters above to compare workspace performance across different periods and owners.</div>
  </div>;
}
