"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  FileSpreadsheet,
  Minus,
  Printer,
  RefreshCw,
  Timer,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RequirePermission } from "@/components/auth/require-permission";
import { secondary } from "@/components/settings/styles";
import { usePermission } from "@/hooks/use-permission";
import { useUsers } from "@/hooks/use-users";
import {
  useAgentPerformance,
  useConversationVolume,
  useResponseTimeTrend,
  useTaskCompletionRate,
  useWonVsLost,
} from "@/hooks/use-analytics";
import { requestReportExport } from "@/lib/analytics-api";
import { cn } from "@/lib/utils";

// ── Design tokens ───────────────────────────────────────────────

const CHART = {
  won: "var(--chart-series-3)",
  lost: "var(--chart-series-5)",
  primary: "var(--chart-series-1)",
  muted: "var(--color-border)",
};

const tooltipStyle = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--color-text)",
  boxShadow: "0 4px 12px rgb(0 0 0 / 0.08)",
};

const axisTick = { fontSize: 11, fill: "var(--color-muted)" };

// ── Date & format helpers ───────────────────────────────────────

function todayIso(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function currency(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function weekdayShort(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
}

/** Previous window of the same length, immediately before `from`. */
function previousWindow(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  const lengthDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1);
  const prevTo = new Date(fromDate);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (lengthDays - 1));
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(prevFrom), to: iso(prevTo) };
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

// ── Building blocks ─────────────────────────────────────────────

/** Unified report card: icon header, consistent padding, load/empty/error states. */
function ReportCard({
  title,
  subtitle,
  icon: Icon,
  isLoading,
  isError,
  isEmpty,
  emptyLabel,
  onRetry,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  emptyLabel?: string;
  onRetry?: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-2xl border border-border bg-surface shadow-xs print:break-inside-avoid", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-text">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="flex-1 p-5">
        {isLoading ? (
          <div className="h-60 animate-pulse rounded-xl bg-border/50" />
        ) : isError ? (
          <div className="flex h-60 flex-col items-center justify-center gap-2 text-xs text-danger">
            <AlertCircle className="h-5 w-5" />
            <span>Couldn&apos;t load {emptyLabel ?? "this section"}.</span>
            {onRetry && (
              <button type="button" onClick={onRetry} className="font-semibold text-primary hover:underline">
                Retry
              </button>
            )}
          </div>
        ) : isEmpty ? (
          <div className="flex h-60 flex-col items-center justify-center gap-2 text-center">
            <Icon className="h-6 w-6 text-muted/60" />
            <p className="text-xs text-muted">No {emptyLabel ?? "data"} for this period.</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** Compact period-over-period change badge: percent only, color = good/bad. */
function DeltaBadge({ current, previous, lowerIsBetter = false }: { current: number; previous: number; lowerIsBetter?: boolean }) {
  const change = percentChange(current, previous);
  if (change == null) {
    return <span className="inline-flex items-center rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted">new</span>;
  }
  const flat = Math.abs(change) < 0.05;
  const improved = flat ? null : lowerIsBetter ? change < 0 : change > 0;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      title={`Previous period: ${Math.round(previous * 100) / 100}`}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        improved == null ? "bg-muted/40 text-muted" : improved ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
      )}
    >
      <Icon className="h-3 w-3" />
      {flat ? "0%" : `${Math.abs(change) >= 10 ? Math.round(change) : change.toFixed(1)}%`}
    </span>
  );
}

const KPI_TONES = {
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  green: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  orange: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
} as const;

type KpiTone = keyof typeof KPI_TONES;

/** Compact KPI tile: label / value / delta row — uniform height. */
function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: KpiTone;
  delta?: { current: number; previous: number; lowerIsBetter?: boolean };
}) {
  return (
    <article className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", KPI_TONES[tone])}>
          <Icon className="h-4 w-4" />
        </span>
        {delta && <DeltaBadge current={delta.current} previous={delta.previous} lowerIsBetter={delta.lowerIsBetter} />}
      </div>
      <div className="mt-3">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
        <p className="mt-0.5 text-[22px] font-bold leading-7 tracking-tight tabular-nums text-text">{value}</p>
        {hint && <p className="mt-0.5 truncate text-[11px] text-muted">{hint}</p>}
      </div>
    </article>
  );
}

// ── CSV helpers ─────────────────────────────────────────────────

type CsvCell = string | number | null;

function toCsv(rows: CsvCell[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? "" : String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(",")
    )
    .join("\r\n");
}

function downloadCsv(filename: string, rows: CsvCell[][]) {
  const blob = new Blob([`\uFEFF${toCsv(rows)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

// ── Page ────────────────────────────────────────────────────────

export default function ReportsPage() {
  return (
    <RequirePermission permission="analytics.view">
      <ReportsContent />
    </RequirePermission>
  );
}

const PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
] as const;

function ReportsContent() {
  const [from, setFrom] = useState(todayIso(-29));
  const [to, setTo] = useState(todayIso());
  const [agentUserId, setAgentUserId] = useState<number | "">("");
  const canViewUsers = usePermission("users.view");
  const canExport = usePermission("analytics.export");
  const { data: users } = useUsers();

  const activePreset = PRESETS.find((p) => from === todayIso(-(p.days - 1)) && to === todayIso())?.label ?? null;

  const baseFilters = useMemo(() => ({ from, to }), [from, to]);
  const agentFilters = useMemo(
    () => ({ from, to, agent_user_id: agentUserId === "" ? undefined : agentUserId }),
    [from, to, agentUserId]
  );
  const prev = useMemo(() => previousWindow(from, to), [from, to]);
  const prevFilters = useMemo(() => ({ from: prev.from, to: prev.to }), [prev]);

  // Current period
  const volume = useConversationVolume(baseFilters);
  const responseTrend = useResponseTimeTrend(baseFilters);
  const wonVsLost = useWonVsLost(agentFilters);
  const completionRate = useTaskCompletionRate(agentFilters);
  const agentPerformance = useAgentPerformance(agentFilters);

  // Previous period (deltas only)
  const prevVolume = useConversationVolume(prevFilters);
  const prevResponse = useResponseTimeTrend(prevFilters);
  const prevWonVsLost = useWonVsLost(prevFilters);
  const prevCompletion = useTaskCompletionRate(prevFilters);

  const currentQueries = [volume, responseTrend, wonVsLost, completionRate, agentPerformance];
  const refreshing = currentQueries.some((q) => q.isFetching);
  const refresh = () => void Promise.all(currentQueries.map((q) => q.refetch()));

  // ── Aggregates: current period ────────────────────────────────
  const totals = useMemo(() => {
    const data = wonVsLost.data ?? [];
    const wonCount = data.reduce((s, p) => s + (p.won_count ?? 0), 0);
    const lostCount = data.reduce((s, p) => s + (p.lost_count ?? 0), 0);
    const wonValue = data.reduce((s, p) => s + (p.won_value ?? 0), 0);
    const lostValue = data.reduce((s, p) => s + (p.lost_value ?? 0), 0);
    const newConversations = (volume.data ?? []).reduce((s, p) => s + p.count, 0);
    const responseDays = (responseTrend.data ?? []).filter(
      (p): p is { date: string; avg_response_minutes: number } => p.avg_response_minutes != null
    );
    const avgResponse =
      responseDays.length > 0 ? responseDays.reduce((s, p) => s + p.avg_response_minutes, 0) / responseDays.length : null;
    const winRate = wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : null;
    return { wonCount, lostCount, wonValue, lostValue, newConversations, avgResponse, winRate };
  }, [wonVsLost.data, volume.data, responseTrend.data]);

  const prevTotals = useMemo(() => {
    const data = prevWonVsLost.data ?? [];
    const wonCount = data.reduce((s, p) => s + (p.won_count ?? 0), 0);
    const lostCount = data.reduce((s, p) => s + (p.lost_count ?? 0), 0);
    const wonValue = data.reduce((s, p) => s + (p.won_value ?? 0), 0);
    const lostValue = data.reduce((s, p) => s + (p.lost_value ?? 0), 0);
    const newConversations = (prevVolume.data ?? []).reduce((s, p) => s + p.count, 0);
    const responseDays = (prevResponse.data ?? []).filter(
      (p): p is { date: string; avg_response_minutes: number } => p.avg_response_minutes != null
    );
    const avgResponse =
      responseDays.length > 0 ? responseDays.reduce((s, p) => s + p.avg_response_minutes, 0) / responseDays.length : null;
    const winRate = wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : null;
    return { wonCount, lostCount, wonValue, lostValue, newConversations, avgResponse, winRate };
  }, [prevWonVsLost.data, prevVolume.data, prevResponse.data]);

  // ── Weekly revenue (Monday-based weeks) ───────────────────────
  const weeklyRevenue = useMemo(() => {
    const byWeek = new Map<string, { won: number; lost: number }>();
    for (const point of wonVsLost.data ?? []) {
      const date = new Date(`${point.date}T00:00:00`);
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); // back to Monday
      const key = todayIso(0) && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const entry = byWeek.get(key) ?? { won: 0, lost: 0 };
      entry.won += point.won_value ?? 0;
      entry.lost += point.lost_value ?? 0;
      byWeek.set(key, entry);
    }
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, v]) => ({
        week: shortDate(weekStart),
        won: Math.round(v.won),
        lost: Math.round(v.lost),
      }));
  }, [wonVsLost.data]);

  // ── Response-speed bands ──────────────────────────────────────
  const responseBands = useMemo(() => {
    const bands = [
      { label: "Under 5 min", max: 5, days: 0 },
      { label: "5 – 15 min", max: 15, days: 0 },
      { label: "15 – 60 min", max: 60, days: 0 },
      { label: "Over 1 hour", max: Number.POSITIVE_INFINITY, days: 0 },
    ];
    let noReplyDays = 0;
    for (const point of responseTrend.data ?? []) {
      const minutes = point.avg_response_minutes;
      if (minutes == null) {
        noReplyDays += 1;
        continue;
      }
      (bands.find((b) => minutes < b.max) ?? bands[bands.length - 1]).days += 1;
    }
    return { bands, noReplyDays };
  }, [responseTrend.data]);
  const maxBandDays = Math.max(1, ...responseBands.bands.map((b) => b.days), responseBands.noReplyDays);

  // ── Agent leaderboard ─────────────────────────────────────────
  const leaderboard = useMemo(
    () =>
      [...(agentPerformance.data ?? [])]
        .map((a) => ({ ...a, total: a.conversations_handled + a.tasks_completed }))
        .sort((a, b) => b.total - a.total),
    [agentPerformance.data]
  );
  const leaderboardMax = Math.max(1, ...leaderboard.map((a) => a.total));

  // ── Daily rows ────────────────────────────────────────────────
  const dailyRows = useMemo(() => {
    const responseByDate = new Map((responseTrend.data ?? []).map((p) => [p.date, p.avg_response_minutes]));
    const dealsByDate = new Map((wonVsLost.data ?? []).map((p) => [p.date, p]));
    return [...(volume.data ?? [])]
      .reverse()
      .slice(0, 14)
      .map((point) => ({
        date: point.date,
        conversations: point.count,
        responseMinutes: responseByDate.get(point.date) ?? null,
        wonCount: dealsByDate.get(point.date)?.won_count ?? 0,
        wonValue: dealsByDate.get(point.date)?.won_value ?? 0,
        lostCount: dealsByDate.get(point.date)?.lost_count ?? 0,
        lostValue: dealsByDate.get(point.date)?.lost_value ?? 0,
      }));
  }, [volume.data, responseTrend.data, wonVsLost.data]);

  // ── Exports ───────────────────────────────────────────────────
  const dailyCsv = useMemo<CsvCell[][]>(
    () => [
      ["Date", "New conversations", "Avg response (min)", "Deals won", "Won value", "Deals lost", "Lost value"],
      ...dailyRows
        .slice()
        .reverse()
        .map((r) => [r.date, r.conversations, r.responseMinutes ?? "", r.wonCount, r.wonValue, r.lostCount, r.lostValue]),
    ],
    [dailyRows]
  );

  const agentCsv = useMemo<CsvCell[][]>(
    () => [
      ["Rank", "Agent", "Conversations handled", "Tasks completed", "Total"],
      ...leaderboard.map((a, i) => [i + 1, a.name, a.conversations_handled, a.tasks_completed, a.total]),
    ],
    [leaderboard]
  );

  const queueExport = useMutation({
    mutationFn: (type: "contacts" | "deals" | "tasks") => requestReportExport(type, { from, to }),
  });

  const kpis: {
    label: string;
    value: string;
    hint?: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: KpiTone;
    delta?: { current: number; previous: number; lowerIsBetter?: boolean };
  }[] = [
    {
      label: "Conversations",
      value: totals.newConversations.toLocaleString(),
      hint: "new in period",
      icon: Users,
      tone: "blue",
      delta: { current: totals.newConversations, previous: prevTotals.newConversations },
    },
    {
      label: "Won value",
      value: currency(totals.wonValue),
      hint: `${totals.wonCount} deals closed`,
      icon: TrendingUp,
      tone: "green",
      delta: { current: totals.wonValue, previous: prevTotals.wonValue },
    },
    {
      label: "Win rate",
      value: totals.winRate != null ? `${totals.winRate.toFixed(1)}%` : "--",
      hint: `${totals.wonCount}W · ${totals.lostCount}L`,
      icon: Trophy,
      tone: "violet",
      delta: { current: totals.winRate ?? 0, previous: prevTotals.winRate ?? 0 },
    },
    {
      label: "Avg response",
      value: totals.avgResponse != null ? `${Math.round(totals.avgResponse)} min` : "N/A",
      hint: "first reply speed",
      icon: Clock3,
      tone: "orange",
      delta: { current: totals.avgResponse ?? 0, previous: prevTotals.avgResponse ?? 0, lowerIsBetter: true },
    },
    {
      label: "Task completion",
      value: completionRate.data && completionRate.data.total > 0 ? `${Math.round(completionRate.data.rate_percent)}%` : "--",
      hint: completionRate.data ? `${completionRate.data.completed} of ${completionRate.data.total} tasks` : undefined,
      icon: CheckCircle2,
      tone: "slate",
      delta: { current: completionRate.data?.rate_percent ?? 0, previous: prevCompletion.data?.rate_percent ?? 0 },
    },
    {
      label: "Lost value",
      value: currency(totals.lostValue),
      hint: `${totals.lostCount} deals lost`,
      icon: AlertCircle,
      tone: "red",
      delta: { current: totals.lostValue, previous: prevTotals.lostValue, lowerIsBetter: true },
    },
  ];

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 pb-4">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <header className="rounded-2xl border border-border bg-surface p-4 shadow-xs print:border-0 print:shadow-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-text">Analytics report</h1>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary print:hidden">
                {shortDate(from)} – {shortDate(to)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Performance vs the previous {prev.from === prev.to ? "day" : "period"} ({shortDate(prev.from)} – {shortDate(prev.to)}) ·{" "}
              <Link href="/dashboard" className="font-medium text-primary hover:underline">
                live dashboard
              </Link>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {/* Preset segmented control */}
            <div className="flex rounded-lg border border-border bg-bg p-0.5" role="group" aria-label="Period presets">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setTo(todayIso());
                    setFrom(todayIso(-(preset.days - 1)));
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                    activePreset === preset.label ? "bg-primary text-primary-foreground shadow-sm" : "text-muted hover:text-text"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom range */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5">
              <input
                type="date"
                aria-label="From date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[118px] bg-transparent text-xs tabular-nums text-text outline-none"
              />
              <span className="text-xs text-muted">–</span>
              <input
                type="date"
                aria-label="To date"
                value={to}
                min={from}
                max={todayIso()}
                onChange={(e) => setTo(e.target.value)}
                className="w-[118px] bg-transparent text-xs tabular-nums text-text outline-none"
              />
            </div>

            {canViewUsers && (
              <select
                aria-label="Agent filter"
                value={agentUserId}
                onChange={(e) => setAgentUserId(e.target.value ? Number(e.target.value) : "")}
                className="h-[34px] rounded-lg border border-border bg-bg px-2.5 text-xs text-text outline-none transition focus:border-primary/50"
              >
                <option value="">All agents</option>
                {(users ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-border bg-bg px-3 text-xs font-medium text-text transition hover:bg-surface disabled:opacity-60"
              >
                <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
                Refresh
              </button>
              <button type="button" onClick={() => window.print()} className={cn(secondary, "h-[34px] px-3 text-xs")}>
                <Printer className="h-3.5 w-3.5" />
                PDF
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Print-only report header */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold text-text">Analytics report</h1>
        <p className="mt-1 text-xs text-muted">
          Period {from} to {to} · compared with {prev.from} to {prev.to} · Generated{" "}
          <span suppressHydrationWarning>{new Date().toLocaleString()}</span>
        </p>
      </div>

      {/* ── KPI strip ───────────────────────────────────────────── */}
      <section aria-label="Executive summary">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((kpi) => (
            <KpiTile key={kpi.label} {...kpi} />
          ))}
        </div>
      </section>

      {/* ── Revenue trend (hero) ────────────────────────────────── */}
      <ReportCard
        title="Weekly revenue"
        subtitle="Won vs lost deal value, stacked by week"
        icon={BarChart3}
        isLoading={wonVsLost.isLoading}
        isError={wonVsLost.isError}
        onRetry={() => wonVsLost.refetch()}
        isEmpty={!weeklyRevenue.some((w) => w.won > 0 || w.lost > 0)}
        emptyLabel="closed deal value"
        action={
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full" style={{ backgroundColor: CHART.won }} /> Won {currency(totals.wonValue)}
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full" style={{ backgroundColor: CHART.lost }} /> Lost {currency(totals.lostValue)}
            </span>
          </div>
        }
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyRevenue} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-border)", opacity: 0.25 }} />
              <Bar dataKey="won" name="Won" stackId="rev" fill={CHART.won} radius={[0, 0, 4, 4]} maxBarSize={44} />
              <Bar dataKey="lost" name="Lost" stackId="rev" fill={CHART.lost} radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      {/* ── Outcomes + task completion ──────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-2">
        <ReportCard
          title="Deal outcomes"
          subtitle={`${totals.wonCount + totals.lostCount} deals closed in period`}
          icon={Trophy}
          isLoading={wonVsLost.isLoading}
          isError={wonVsLost.isError}
          onRetry={() => wonVsLost.refetch()}
          isEmpty={totals.wonCount + totals.lostCount === 0}
          emptyLabel="closed deals"
        >
          <div className="grid grid-cols-[1fr_auto] items-center gap-6">
            <div className="relative h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "Won", value: totals.wonCount },
                      { name: "Lost", value: totals.lostCount },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    <Cell fill={CHART.won} />
                    <Cell fill={CHART.lost} />
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold tabular-nums text-text">{totals.winRate != null ? `${totals.winRate.toFixed(0)}%` : "--"}</p>
                <p className="text-[11px] text-muted">win rate</p>
              </div>
            </div>
            <div className="space-y-3 pr-2">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="size-2 rounded-full" style={{ backgroundColor: CHART.won }} /> Won
                </p>
                <p className="text-lg font-bold tabular-nums text-text">{totals.wonCount}</p>
                <p className="text-[11px] tabular-nums text-muted">{currency(totals.wonValue)}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="size-2 rounded-full" style={{ backgroundColor: CHART.lost }} /> Lost
                </p>
                <p className="text-lg font-bold tabular-nums text-text">{totals.lostCount}</p>
                <p className="text-[11px] tabular-nums text-muted">{currency(totals.lostValue)}</p>
              </div>
            </div>
          </div>
        </ReportCard>

        <ReportCard
          title="Task completion"
          subtitle="Tasks created in the period"
          icon={CheckCircle2}
          isLoading={completionRate.isLoading}
          isError={completionRate.isError}
          onRetry={() => completionRate.refetch()}
          isEmpty={!completionRate.data || completionRate.data.total === 0}
          emptyLabel="tasks"
        >
          {completionRate.data && (
            <div className="flex h-full flex-col justify-center">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-4xl font-bold tabular-nums tracking-tight text-text">
                    {Math.round(completionRate.data.rate_percent)}
                    <span className="text-lg text-muted">%</span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {completionRate.data.completed} completed of {completionRate.data.total}
                  </p>
                </div>
                <DeltaBadge
                  current={completionRate.data.rate_percent}
                  previous={prevCompletion.data?.rate_percent ?? 0}
                />
              </div>
              <div className="mt-5">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-border/60">
                  <div className="h-full bg-success" style={{ width: `${completionRate.data.rate_percent}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-success" /> Completed {completionRate.data.completed}
                  </span>
                  <span>Outstanding {Math.max(0, completionRate.data.total - completionRate.data.completed)}</span>
                </div>
              </div>
            </div>
          )}
        </ReportCard>
      </div>

      {/* ── Response speed ──────────────────────────────────────── */}
      <ReportCard
        title="Response speed"
        subtitle={`Days in each speed band · avg ${totals.avgResponse != null ? `${Math.round(totals.avgResponse)} min` : "n/a"}`}
        icon={Timer}
        isLoading={responseTrend.isLoading}
        isError={responseTrend.isError}
        onRetry={() => responseTrend.refetch()}
        isEmpty={responseBands.bands.every((b) => b.days === 0) && responseBands.noReplyDays === 0}
        emptyLabel="response data"
        action={
          <DeltaBadge current={totals.avgResponse ?? 0} previous={prevTotals.avgResponse ?? 0} lowerIsBetter />
        }
      >
        <div className="space-y-4">
          {responseBands.bands.map((band) => (
            <div key={band.label} className="grid grid-cols-[110px_1fr_48px] items-center gap-3">
              <span className="truncate text-xs text-muted">{band.label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-border/60">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(band.days / maxBandDays) * 100}%` }} />
              </div>
              <span className="text-right text-xs font-semibold tabular-nums text-text">{band.days}d</span>
            </div>
          ))}
          <div className="grid grid-cols-[110px_1fr_48px] items-center gap-3 border-t border-border/60 pt-4">
            <span className="truncate text-xs text-muted">No reply yet</span>
            <div className="h-2 overflow-hidden rounded-full bg-border/60">
              <div className="h-full rounded-full bg-muted" style={{ width: `${(responseBands.noReplyDays / maxBandDays) * 100}%` }} />
            </div>
            <span className="text-right text-xs font-semibold tabular-nums text-muted">{responseBands.noReplyDays}d</span>
          </div>
        </div>
      </ReportCard>

      {/* ── Agent leaderboard ───────────────────────────────────── */}
      <ReportCard
        title="Agent leaderboard"
        subtitle="Ranked by conversations handled + tasks completed"
        icon={Users}
        isLoading={agentPerformance.isLoading}
        isError={agentPerformance.isError}
        onRetry={() => agentPerformance.refetch()}
        isEmpty={leaderboard.length === 0}
        emptyLabel="agent activity"
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[620px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="border-b border-border px-3 py-2.5">Rank</th>
                <th className="border-b border-border px-3 py-2.5">Agent</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Chats</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Tasks</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Total</th>
                <th className="border-b border-border px-3 py-2.5">Share of top</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((agent, index) => (
                <tr key={agent.user_id} className="group">
                  <td className="border-b border-border/60 px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold tabular-nums",
                        index === 0
                          ? "bg-warning/15 text-warning-dark"
                          : index === 1
                            ? "bg-muted/50 text-text"
                            : index === 2
                              ? "bg-danger-light text-danger-dark"
                              : "text-muted"
                      )}
                    >
                      {index + 1}
                    </span>
                  </td>
                  <td className="border-b border-border/60 px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary-dark">
                        {agent.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="font-medium text-text">{agent.name}</span>
                    </div>
                  </td>
                  <td className="border-b border-border/60 px-3 py-3 text-right tabular-nums text-muted">{agent.conversations_handled}</td>
                  <td className="border-b border-border/60 px-3 py-3 text-right tabular-nums text-muted">{agent.tasks_completed}</td>
                  <td className="border-b border-border/60 px-3 py-3 text-right font-semibold tabular-nums text-text">{agent.total}</td>
                  <td className="border-b border-border/60 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-border/60">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round((agent.total / leaderboardMax) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] tabular-nums text-muted">{Math.round((agent.total / leaderboardMax) * 100)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportCard>

      {/* ── Daily breakdown ─────────────────────────────────────── */}
      <ReportCard
        title="Daily breakdown"
        subtitle="Most recent 14 days of the selected period"
        icon={Database}
        isLoading={volume.isLoading || responseTrend.isLoading || wonVsLost.isLoading}
        isError={volume.isError || responseTrend.isError || wonVsLost.isError}
        isEmpty={dailyRows.length === 0}
        emptyLabel="daily data"
        action={
          <button
            type="button"
            onClick={() => downloadCsv(`analytics-daily_${from}_to_${to}.csv`, dailyCsv)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text transition hover:bg-bg print:hidden"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            CSV
          </button>
        }
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[680px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="border-b border-border px-3 py-2.5">Date</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Chats</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Avg response</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Won</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Won value</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Lost</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Lost value</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((row) => (
                <tr key={row.date}>
                  <td className="border-b border-border/60 px-3 py-2.5">
                    <span className="font-medium text-text">{shortDate(row.date)}</span>
                    <span className="ml-1.5 text-[11px] text-muted">{weekdayShort(row.date)}</span>
                  </td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-muted">{row.conversations}</td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-muted">
                    {row.responseMinutes != null ? `${Math.round(row.responseMinutes)} min` : "--"}
                  </td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-success">{row.wonCount || "–"}</td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-muted">{currency(row.wonValue)}</td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-danger">{row.lostCount || "–"}</td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-muted">{currency(row.lostValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportCard>

      {/* ── Exports ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-xs print:hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-text">Export</h2>
            <p className="mt-0.5 text-xs text-muted">
              Instant CSV downloads from the loaded data, or queue a full background export delivered to your notification bell.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={cn(secondary, "h-9 text-xs")}
              onClick={() => downloadCsv(`analytics-daily_${from}_to_${to}.csv`, dailyCsv)}
              disabled={dailyCsv.length <= 1}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Daily metrics
            </button>
            <button
              type="button"
              className={cn(secondary, "h-9 text-xs")}
              onClick={() => downloadCsv(`agent-performance_${from}_to_${to}.csv`, agentCsv)}
              disabled={agentCsv.length <= 1}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Agent summary
            </button>
            {canExport && (
              <button
                type="button"
                className={cn(secondary, "h-9 text-xs")}
                disabled={queueExport.isPending}
                onClick={() => queueExport.mutate("deals")}
              >
                <Database className="h-4 w-4" />
                {queueExport.isPending ? "Queuing…" : "Background deals export"}
              </button>
            )}
          </div>
        </div>
        {queueExport.isSuccess && (
          <p className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
            Background export queued — the notification bell will show the download when it&apos;s ready.
          </p>
        )}
        {queueExport.isError && (
          <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
            Couldn&apos;t queue the background export. Try an instant CSV download instead.
          </p>
        )}
      </section>
    </div>
  );
}
