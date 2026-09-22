"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  FileBarChart,
  Minus,
  RefreshCw,
  Settings2,
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
import { ReportSettingsDrawer } from "@/components/reports/settings-drawer";
import { ExportsSection } from "@/components/reports/exports-section";
import { usePermission } from "@/hooks/use-permission";
import { useReportOverview, useReportSettings } from "@/hooks/use-reports";
import { useUsers } from "@/hooks/use-users";
import { useWhatsappAccounts } from "@/hooks/use-whatsapp-accounts";
import { cn } from "@/lib/utils";
import {
  formatMinutes,
  formatMoney,
  formatPercent,
  shortDate,
  todayIso,
  weekdayShort,
} from "@/lib/report-format";
import type { ReportMetric, ReportRange } from "@/lib/reports-api";

// ── Design tokens ───────────────────────────────────────────────

const CHART = {
  won: "var(--chart-series-3)",
  lost: "var(--chart-series-5)",
  open: "var(--chart-series-4)",
  primary: "var(--chart-series-1)",
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

const PRESETS: Array<{ value: ReportRange; label: string; days?: number }> = [
  { value: "7d", label: "7D", days: 7 },
  { value: "30d", label: "30D", days: 30 },
  { value: "90d", label: "90D", days: 90 },
  { value: "custom", label: "Custom" },
];

export default function ReportsPage() {
  return (
    <RequirePermission permission="reports.view">
      <Suspense fallback={null}>
        <ReportsContent />
      </Suspense>
    </RequirePermission>
  );
}

// ── Building blocks ─────────────────────────────────────────────

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
    <section className={cn("flex flex-col rounded-2xl border border-border bg-surface shadow-xs", className)}>
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

function DeltaBadge({ metric }: { metric: ReportMetric }) {
  const { change, lower_is_better, previous } = metric;
  if (change == null) {
    return (
      <span
        title={previous != null ? `Previous period: ${previous}` : "No previous-period data"}
        className="inline-flex items-center rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted"
      >
        new
      </span>
    );
  }
  const flat = Math.abs(change) < 0.05;
  const improved = flat ? null : lower_is_better ? change < 0 : change > 0;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  const label = flat ? "0%" : `${Math.abs(change) >= 10 ? Math.round(change) : change.toFixed(1)}%`;
  return (
    <span
      title={`Previous period: ${previous ?? "—"}`}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        improved == null ? "bg-muted/40 text-muted" : improved ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
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

function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  metric,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: KpiTone;
  metric?: ReportMetric;
  href?: string;
}) {
  const tile = (
    <article className="flex h-full flex-col justify-between rounded-2xl border border-border bg-surface p-4 shadow-xs transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", KPI_TONES[tone])}>
          <Icon className="h-4 w-4" />
        </span>
        {metric && <DeltaBadge metric={metric} />}
      </div>
      <div className="mt-3">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
        <p className="mt-0.5 text-[22px] font-bold leading-7 tracking-tight tabular-nums text-text">{value}</p>
        {hint && <p className="mt-0.5 truncate text-[11px] text-muted">{hint}</p>}
      </div>
    </article>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {tile}
    </Link>
  ) : (
    tile
  );
}

// ── Page ────────────────────────────────────────────────────────

function ReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [range, setRange] = useState<ReportRange>(() => {
    const raw = searchParams.get("range");
    return raw === "7d" || raw === "30d" || raw === "90d" || raw === "custom" ? raw : "30d";
  });
  const [from, setFrom] = useState(() => searchParams.get("from") ?? todayIso(-13));
  const [to, setTo] = useState(() => searchParams.get("to") ?? todayIso());
  const [agentId, setAgentId] = useState<number | "">(() => {
    const raw = searchParams.get("agent_id");
    return raw && !Number.isNaN(Number(raw)) ? Number(raw) : "";
  });
  const [accountId, setAccountId] = useState<number | "">(() => {
    const raw = searchParams.get("account_id");
    return raw && !Number.isNaN(Number(raw)) ? Number(raw) : "";
  });
  const [page, setPage] = useState(() => {
    const raw = searchParams.get("page");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
  });
  const [compare, setCompare] = useState<boolean>(() => searchParams.get("compare")?.toString() !== "0");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const canManageSettings = usePermission("reports.manage_settings");
  const canViewAllAgents = usePermission("reports.view_all_agents");
  const { data: users } = useUsers();
  const accountsQuery = useWhatsappAccounts();
  const { data: settings } = useReportSettings();

  const allowCustom = settings?.preferences.allow_custom_periods ?? true;
  const effectiveRange = range === "custom" && !allowCustom ? "30d" : range;

  // ── URL mirroring ─────────────────────────────────────────────
  const syncUrl = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `/reports?${qs}` : "/reports", { scroll: false });
    },
    [router, searchParams]
  );

  const applyPreset = (nextRange: ReportRange) => {
    setRange(nextRange);
    setPage(1);
    if (nextRange !== "custom") {
      syncUrl({ range: nextRange, page: undefined });
    } else {
      syncUrl({ range: "custom", from, to, page: undefined });
    }
  };

  const applyCustomRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    setPage(1);
    syncUrl({ from: nextFrom, to: nextTo, page: undefined });
  };

  const applyAgent = (value: number | "") => {
    setAgentId(value);
    setPage(1);
    syncUrl({ agent_id: value === "" ? undefined : String(value), page: undefined });
  };

  const applyAccount = (value: number | "") => {
    setAccountId(value);
    setPage(1);
    syncUrl({ account_id: value === "" ? undefined : String(value), page: undefined });
  };

  const applyCompare = (next: boolean) => {
    setCompare(next);
    syncUrl({ compare: next ? undefined : "0" });
  };

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    syncUrl({ page: nextPage > 1 ? String(nextPage) : undefined });
  };

  // OWN claims must not route a stale foreign-agent filter to the backend.
const filters = useMemo(
    () => ({
      range: effectiveRange,
      ...(effectiveRange === "custom" ? { from, to } : {}),
      agent_user_id: agentId === "" ? undefined : agentId,
      whatsapp_account_id: accountId === "" ? undefined : accountId,
      compare,
      page,
    }),
    [effectiveRange, from, to, agentId, accountId, compare, page]
  );

  const overview = useReportOverview(filters);
  const data = overview.data;

  const refreshing = overview.isFetching;
  const refresh = () => void overview.refetch();

  // OWN claims never show the agent filter; the backend forces the caller's own agent id anyway.
  const claim = data?.claim ?? (canViewAllAgents ? "ALL" : "OWN");
  const showAgentFilter = claim === "ALL";

  const reportCurrency = settings?.analytics.currency ?? "";

  // ── Derived panel data ────────────────────────────────────────
  const weeklyRevenue = useMemo(
    () =>
      (data?.weekly_revenue ?? []).map((w) => ({ week: shortDate(w.week_start), won: w.won, lost: w.lost })),
    [data]
  );

  const outcomesDonut = useMemo(() => {
    const o = data?.deal_outcomes;
    if (!o) return [];
    return [
      { name: "Won", value: o.won.count, fill: CHART.won },
      { name: "Lost", value: o.lost.count, fill: CHART.lost },
      { name: "Open", value: o.open.count, fill: CHART.open },
    ];
  }, [data]);

  const speedMax = useMemo(() => {
    const buckets = data?.response_speed.buckets ?? [];
    return Math.max(1, ...buckets.map((b) => b.count));
  }, [data]);

  const enquiry = {
    isLoading: overview.isLoading,
    isError: overview.isError,
  };

  // ── States ────────────────────────────────────────────────────
  if (data && !data.tracked) {
    return (
      <div className="mx-auto max-w-[1280px] space-y-5 pb-4">
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-6 py-16 text-center shadow-xs">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileBarChart className="h-6 w-6" />
          </span>
          <h1 className="text-base font-bold text-text">Reports are unavailable</h1>
          <p className="max-w-md text-xs text-muted">
            Analytics are currently disabled for this workspace. Turn on analytics tracking to unlock the reports
            dashboard.
          </p>
          <Link href="/settings/workspace/analytics" className="mt-1 text-xs font-semibold text-primary hover:underline">
            Open analytics settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 pb-4">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <header className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-text">Reports</h1>
              {data && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                  {shortDate(data.period.from)} – {shortDate(data.period.to)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {claim === "OWN" ? "Showing your own activity." : "Showing the whole workspace."}
              {data?.comparison_period &&
                ` Compared with ${shortDate(data.comparison_period.from)} – ${shortDate(data.comparison_period.to)}.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Presets */}
            <div className="flex rounded-lg border border-border bg-bg p-0.5" role="group" aria-label="Period presets">
              {PRESETS.filter((p) => p.value !== "custom" || allowCustom).map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => applyPreset(preset.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                    effectiveRange === preset.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted hover:text-text"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom range */}
            {effectiveRange === "custom" && (
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5">
                <input
                  type="date"
                  aria-label="From date"
                  value={from}
                  max={to}
                  onChange={(e) => applyCustomRange(e.target.value, to)}
                  className="w-[118px] bg-transparent text-xs tabular-nums text-text outline-none"
                />
                <span className="text-xs text-muted">–</span>
                <input
                  type="date"
                  aria-label="To date"
                  value={to}
                  min={from}
                  max={todayIso()}
                  onChange={(e) => applyCustomRange(from, e.target.value)}
                  className="w-[118px] bg-transparent text-xs tabular-nums text-text outline-none"
                />
              </div>
            )}

            {/* Compare toggle */}
            <button
              type="button"
              onClick={() => applyCompare(!compare)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                compare ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-bg text-muted hover:text-text"
              )}
            >
              Compare
            </button>

            {/* Agent filter */}
            {showAgentFilter && (
              <select
                aria-label="Agent filter"
                value={agentId}
                onChange={(e) => applyAgent(e.target.value ? Number(e.target.value) : "")}
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

            {/* Account filter */}
            {accountsQuery.data && accountsQuery.data.length > 0 && (
              <select
                aria-label="Account filter"
                value={accountId}
                onChange={(e) => applyAccount(e.target.value ? Number(e.target.value) : "")}
                className="h-[34px] rounded-lg border border-border bg-bg px-2.5 text-xs text-text outline-none transition focus:border-primary/50"
              >
                <option value="">All accounts</option>
                {accountsQuery.data.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
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
              {canManageSettings && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-border bg-bg px-3 text-xs font-medium text-text transition hover:bg-surface"
                >
                  <Settings2 className="size-3.5" />
                  Settings
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── KPI strip ───────────────────────────────────────────── */}
      <section aria-label="Executive summary">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiTile
            label="Conversations"
            value={overview.isLoading ? "…" : (data?.metrics.conversations.value ?? 0).toLocaleString()}
            hint="new in period"
            icon={Users}
            tone="blue"
            metric={data?.metrics.conversations}
            href="/inbox"
          />
          <KpiTile
            label="Won value"
            value={overview.isLoading ? "…" : formatMoney(data?.metrics.won_value.value ?? 0, reportCurrency)}
            hint={`${data?.metrics.won_count.value ?? 0} deals closed`}
            icon={TrendingUp}
            tone="green"
            metric={data?.metrics.won_value}
            href="/deals"
          />
          <KpiTile
            label="Win rate"
            value={overview.isLoading ? "…" : formatPercent(data?.metrics.win_rate.value ?? null)}
            hint={`${data?.metrics.won_count.value ?? 0}W · ${data?.metrics.lost_count.value ?? 0}L`}
            icon={Trophy}
            tone="violet"
            metric={data?.metrics.win_rate}
            href="/deals"
          />
          <KpiTile
            label="Avg response"
            value={overview.isLoading ? "…" : formatMinutes(data?.metrics.avg_response_minutes.value ?? null)}
            hint="first reply speed"
            icon={Clock3}
            tone="orange"
            metric={data?.metrics.avg_response_minutes}
            href="/inbox"
          />
          <KpiTile
            label="Task completion"
            value={overview.isLoading ? "…" : formatPercent(data?.task_completion.rate_percent ?? 0)}
            hint={data ? `${data.task_completion.completed} of ${data.task_completion.total} tasks` : undefined}
            icon={CheckCircle2}
            tone="slate"
            metric={data?.metrics.task_completion_rate}
            href="/tasks"
          />
          <KpiTile
            label="Lost value"
            value={overview.isLoading ? "…" : formatMoney(data?.metrics.lost_value.value ?? 0, reportCurrency)}
            hint={`${data?.metrics.lost_count.value ?? 0} deals lost`}
            icon={AlertCircle}
            tone="red"
            metric={data?.metrics.lost_value}
            href="/deals"
          />
        </div>
      </section>

      {/* ── Revenue trend (hero) ────────────────────────────────── */}
      <ReportCard
        title="Weekly revenue"
        subtitle="Won vs lost deal value, stacked by week"
        icon={BarChart3}
        {...enquiry}
        onRetry={refresh}
        isEmpty={!weeklyRevenue.some((w) => w.won > 0 || w.lost > 0)}
        emptyLabel="closed deal value"
        action={
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full" style={{ backgroundColor: CHART.won }} /> Won{" "}
              {data ? formatMoney(data.metrics.won_value.value ?? 0, reportCurrency) : ""}
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full" style={{ backgroundColor: CHART.lost }} /> Lost{" "}
              {data ? formatMoney(data.metrics.lost_value.value ?? 0, reportCurrency) : ""}
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
          subtitle={`${data?.deal_outcomes.total ?? 0} deals in pipeline`}
          icon={Trophy}
          {...enquiry}
          onRetry={refresh}
          isEmpty={(data?.deal_outcomes.total ?? 0) === 0}
          emptyLabel="deals"
        >
          <div className="grid grid-cols-[1fr_auto] items-center gap-6">
            <div className="relative h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={outcomesDonut}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {outcomesDonut.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold tabular-nums text-text">
                  {data?.metrics.win_rate.value != null ? `${data.metrics.win_rate.value.toFixed(0)}%` : "--"}
                </p>
                <p className="text-[11px] text-muted">win rate</p>
              </div>
            </div>
            <div className="space-y-3 pr-2">
              {(["won", "lost", "open"] as const).map((key) => {
                const slice = data?.deal_outcomes?.[key];
                if (!slice) return null;
                return (
                  <div key={key}>
                    <p className="flex items-center gap-1.5 text-[11px] text-muted">
                      <span className="size-2 rounded-full" style={{ backgroundColor: CHART[key] }} />{" "}
                      {key[0].toUpperCase() + key.slice(1)}
                    </p>
                    <p className="text-lg font-bold tabular-nums text-text">{slice.count}</p>
                    <p className="text-[11px] tabular-nums text-muted">
                      {slice.pct}% · {formatMoney(slice.value, reportCurrency)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </ReportCard>

        <ReportCard
          title="Task completion"
          subtitle="Tasks created in the period"
          icon={CheckCircle2}
          {...enquiry}
          onRetry={refresh}
          isEmpty={!data || data.task_completion.total === 0}
          emptyLabel="tasks"
        >
          {data && (
            <div className="flex h-full flex-col justify-center">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-4xl font-bold tabular-nums tracking-tight text-text">
                    {Math.round(data.task_completion.rate_percent)}
                    <span className="text-lg text-muted">%</span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {data.task_completion.completed} completed of {data.task_completion.total}
                  </p>
                </div>
                <DeltaBadge metric={data.metrics.task_completion_rate} />
              </div>
              <div className="mt-5">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-border/60">
                  <div className="h-full bg-success" style={{ width: `${data.task_completion.rate_percent}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-success" /> Completed {data.task_completion.completed}
                  </span>
                  <span>Outstanding {data.task_completion.pending}</span>
                  {data.task_completion.overdue > 0 && (
                    <span className="text-danger">Overdue {data.task_completion.overdue}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </ReportCard>
      </div>

      {/* ── Response speed ──────────────────────────────────────── */}
      <ReportCard
        title="Response speed"
        subtitle={`Conversations by first-reply time · avg ${data ? formatMinutes(data.response_speed.avg_response_minutes) : "n/a"}`}
        icon={Timer}
        {...enquiry}
        onRetry={refresh}
        isEmpty={(data?.response_speed.buckets ?? []).every((b) => b.count === 0)}
        emptyLabel="response data"
        action={data ? <DeltaBadge metric={data.metrics.avg_response_minutes} /> : undefined}
      >
        <div className="space-y-4">
          {(data?.response_speed.buckets ?? []).map((bucket) => (
            <div key={bucket.key} className="grid grid-cols-[110px_1fr_88px] items-center gap-3">
              <span className="truncate text-xs text-muted">{bucket.label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-border/60">
                <div
                  className={cn(
                    "h-full rounded-full",
                    bucket.key === "no_reply" ? "bg-muted" : "bg-primary"
                  )}
                  style={{ width: `${(bucket.count / speedMax) * 100}%` }}
                />
              </div>
              <span className="text-right text-xs font-semibold tabular-nums text-text">
                {bucket.count} · {bucket.percentage}%
              </span>
            </div>
          ))}
        </div>
      </ReportCard>

      {/* ── Agent leaderboard ───────────────────────────────────── */}
      <ReportCard
        title="Agent leaderboard"
        subtitle={showAgentFilter ? "Click a row to focus that agent" : "Agents with activity in the period"}
        icon={Users}
        {...enquiry}
        onRetry={refresh}
        isEmpty={(data?.leaderboard ?? []).length === 0}
        emptyLabel="agent activity"
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="border-b border-border px-3 py-2.5">Rank</th>
                <th className="border-b border-border px-3 py-2.5">Agent</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Chats</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Tasks</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Won</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Won value</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Avg response</th>
              </tr>
            </thead>
            <tbody>
              {(data?.leaderboard ?? []).map((agent, index) => {
                const focused = showAgentFilter && agentId === agent.agent_id;
                return (
                  <tr
                    key={agent.agent_id}
                    onClick={() => showAgentFilter && applyAgent(agent.agent_id)}
                    className={cn(
                      showAgentFilter && "cursor-pointer hover:bg-bg",
                      focused && "bg-primary/5"
                    )}
                  >
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
                    <td className="border-b border-border/60 px-3 py-3 text-right tabular-nums text-muted">{agent.conversations}</td>
                    <td className="border-b border-border/60 px-3 py-3 text-right tabular-nums text-muted">{agent.tasks}</td>
                    <td className="border-b border-border/60 px-3 py-3 text-right tabular-nums text-muted">{agent.deals_won}</td>
                    <td className="border-b border-border/60 px-3 py-3 text-right tabular-nums text-muted">
                      {formatMoney(agent.won_value, reportCurrency)}
                    </td>
                    <td className="border-b border-border/60 px-3 py-3 text-right tabular-nums text-muted">
                      {formatMinutes(agent.avg_response_minutes)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ReportCard>

      {/* ── Daily breakdown ─────────────────────────────────────── */}
      <ReportCard
        title="Daily breakdown"
        subtitle={`${data?.daily_breakdown.total ?? 0} days in period`}
        icon={Database}
        {...enquiry}
        onRetry={refresh}
        isEmpty={(data?.daily_breakdown.data ?? []).length === 0}
        emptyLabel="daily data"
        action={
          data && data.daily_breakdown.total_pages > 1 ? (
            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => goToPage(data.daily_breakdown.page - 1)}
                disabled={data.daily_breakdown.page <= 1}
                className="rounded-md border border-border px-2.5 py-1 font-medium text-text transition hover:bg-bg disabled:opacity-40"
              >
                Prev
              </button>
              <span className="tabular-nums text-muted">
                {data.daily_breakdown.page}/{data.daily_breakdown.total_pages}
              </span>
              <button
                type="button"
                onClick={() => goToPage(data.daily_breakdown.page + 1)}
                disabled={data.daily_breakdown.page >= data.daily_breakdown.total_pages}
                className="rounded-md border border-border px-2.5 py-1 font-medium text-text transition hover:bg-bg disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : undefined
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
              {(data?.daily_breakdown.data ?? []).map((row) => (
                <tr key={row.date}>
                  <td className="border-b border-border/60 px-3 py-2.5">
                    <span className="font-medium text-text">{shortDate(row.date)}</span>
                    <span className="ml-1.5 text-[11px] text-muted">{weekdayShort(row.date)}</span>
                  </td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-muted">{row.conversations}</td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-muted">
                    {formatMinutes(row.avg_response_minutes)}
                  </td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-success">{row.won_count || "–"}</td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-muted">
                    {formatMoney(row.won_value, reportCurrency)}
                  </td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-danger">{row.lost_count || "–"}</td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-muted">
                    {formatMoney(row.lost_value, reportCurrency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportCard>

      {/* ── Exports ─────────────────────────────────────────────── */}
      <ExportsSection />

      <ReportSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}