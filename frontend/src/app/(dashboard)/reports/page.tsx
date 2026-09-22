"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileBarChart,
  Info,
  Loader2,
  Minus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Timer,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
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
import { ExportsSection, EXPORT_BUTTONS } from "@/components/reports/exports-section";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePermission } from "@/hooks/use-permission";
import { useReportOverview, useReportSettings, useQueueReportExport } from "@/hooks/use-reports";
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
import type { ReportExportType, ReportMetric, ReportRange } from "@/lib/reports-api";
import { useToast } from "@/providers/toast-provider";

// ── Design tokens ───────────────────────────────────────────────

const CHART = {
  won: "var(--chart-series-3)",
  lost: "var(--chart-series-5)",
  open: "var(--chart-series-4)",
  conversations: "var(--chart-series-1)",
  leads: "var(--chart-series-3)",
  converted: "var(--chart-series-2)",
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

const RANGE_OPTIONS: Array<{ key: ReportRange | "today" | "yesterday" | "thisMonth" | "lastMonth" | "custom"; label: string }> = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "custom", label: "Custom…" },
];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function resolvePresetDates(preset: "today" | "yesterday" | "thisMonth" | "lastMonth"): { from: string; to: string } {
  const now = new Date();
  if (preset === "today") {
    const from = isoDate(now);
    return { from, to: from };
  }
  if (preset === "yesterday") {
    const from = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    return { from, to: from };
  }
  const offset = preset === "thisMonth" ? 0 : -1;
  const from = isoDate(new Date(now.getFullYear(), now.getMonth() + offset, 1));
  const to = preset === "thisMonth" ? isoDate(now) : isoDate(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0));
  return { from, to };
}

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
  id,
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
  id?: string;
}) {
  return (
    <section id={id} className={cn("flex flex-col rounded-2xl border border-border bg-surface shadow-xs", className)}>
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

function InfoTip({ label }: { label: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <Info className="h-3.5 w-3.5 shrink-0 text-muted" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-max max-w-60 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal text-text shadow-lg opacity-0 transition group-hover:opacity-100">
        {label}
      </span>
    </span>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
      {label}
      <button type="button" onClick={onClear} aria-label={`Clear ${label} filter`} className="text-primary hover:text-danger">
        <X className="h-3 w-3" />
      </button>
    </span>
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
  tooltip,
  icon: Icon,
  tone,
  metric,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tooltip?: string;
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
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <span className="truncate">{label}</span>
          {tooltip && <InfoTip label={tooltip} />}
        </p>
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
  const [rangeOpen, setRangeOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const canManageSettings = usePermission("reports.manage_settings");
  const canViewAllAgents = usePermission("reports.view_all_agents");
  const canExport = usePermission("reports.export");
  const { data: users } = useUsers();
  const accountsQuery = useWhatsappAccounts();
  const { data: settings } = useReportSettings();
  const queueExport = useQueueReportExport();
  const exportsBusy = queueExport.isPending;
  const [exportOpen, setExportOpen] = useState(false);
  const { toast } = useToast();

  const handleExport = async (type: ReportExportType) => {
    try {
      await queueExport.mutateAsync(type);
      toast("Export queued — you'll be notified when it's ready.", "success");
    } catch {
      toast("Couldn't queue the export.", "error");
    }
    setExportOpen(false);
  };

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

  const selectRange = (key: ReportRange | "today" | "yesterday" | "thisMonth" | "lastMonth" | "custom") => {
    setRangeOpen(false);
    setPage(1);
    if (key === "7d" || key === "30d" || key === "90d") {
      setRange(key);
      syncUrl({ range: key, page: undefined, from: undefined, to: undefined });
      return;
    }
    if (key === "custom") {
      setRange("custom");
      syncUrl({ range: "custom", from, to, page: undefined });
      return;
    }
    const next = resolvePresetDates(key);
    setRange("custom");
    setFrom(next.from);
    setTo(next.to);
    syncUrl({ range: "custom", from: next.from, to: next.to, page: undefined });
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

  useEffect(() => {
    if (!data) return;
    const id = window.location.hash.slice(1);
    if (id) {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [data]);

  const refreshing = overview.isFetching;
  const refresh = () => void overview.refetch();

  const claim = data?.claim ?? (canViewAllAgents ? "ALL" : "OWN");
  const showAgentFilter = claim === "ALL";

  const reportCurrency = settings?.analytics.currency ?? "";

  const rangeLabel =
    effectiveRange === "custom"
      ? from === to
        ? shortDate(from)
        : `${shortDate(from)} – ${shortDate(to)}`
      : (RANGE_OPTIONS.find((o) => o.key === effectiveRange)?.label ?? "Last 30 days");

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (agentId !== "") {
      const agent = (users ?? []).find((u) => u.id === agentId);
      chips.push({ key: "agent", label: agent ? agent.name : `Agent #${agentId}`, clear: () => applyAgent("") });
    }
    if (accountId !== "") {
      const account = (accountsQuery.data ?? []).find((a) => a.id === accountId);
      chips.push({ key: "account", label: account ? account.name : `Account #${accountId}`, clear: () => applyAccount("") });
    }
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, accountId, users, accountsQuery.data]);

  // ── Derived panel data ────────────────────────────────────────
  const trendData = useMemo(
    () => (data?.trend ?? []).map((d) => ({ ...d, date: shortDate(d.date) })),
    [data]
  );

  const leadBarData = useMemo(() => (data?.leads.created_by_status ?? []).filter((s) => s.count > 0), [data]);
  const leadDonutData = useMemo(() => (data?.leads.current_by_status ?? []).filter((s) => s.count > 0), [data]);
  const leadTypeLabels = useMemo(() => {
    const byType = new Map<string, number>();
    for (const s of leadDonutData) byType.set(s.type, (byType.get(s.type) ?? 0) + s.count);
    return { open: byType.get("open") ?? 0, won: byType.get("won") ?? 0, lost: byType.get("lost") ?? 0 };
  }, [leadDonutData]);

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
            <h1 className="text-lg font-bold tracking-tight text-text">Reports</h1>
            <p className="mt-0.5 text-xs text-muted">Analyze CRM, lead, conversation and team performance.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
              <PopoverTrigger className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-border bg-bg px-3 text-xs font-medium text-text transition hover:bg-surface">
                <CalendarRange className="size-3.5 text-muted" />
                <span className="max-w-40 truncate tabular-nums">{rangeLabel}</span>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1.5">
                {RANGE_OPTIONS.filter((o) => o.key !== "custom" || allowCustom).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => selectRange(option.key)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-bg",
                      effectiveRange === option.key || (option.key === "custom" && effectiveRange === "custom")
                        ? "font-semibold text-primary"
                        : "text-text"
                    )}
                  >
                    {option.label}
                    {(effectiveRange === option.key || (option.key === "custom" && effectiveRange === "custom")) && (
                      <span className="size-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
                {effectiveRange === "custom" && (
                  <div className="mt-1 border-t border-border pt-2">
                    <div className="flex items-center gap-1.5">
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
                  </div>
                )}
                <label className="mt-2 flex cursor-pointer items-center gap-2 border-t border-border px-0.5 pt-2 text-xs text-muted">
                  <input type="checkbox" checked={compare} onChange={(e) => applyCompare(e.target.checked)} className="accent-primary" />
                  Compare with previous period
                </label>
              </PopoverContent>
            </Popover>

            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-border bg-bg px-3 text-xs font-medium text-text transition hover:bg-surface">
                <SlidersHorizontal className="size-3.5 text-muted" />
                Filters
                {activeChips.length > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                    {activeChips.length}
                  </span>
                )}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 space-y-3 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
                  <SlidersHorizontal className="size-3.5 text-muted" /> Filters
                </div>
                {showAgentFilter && (
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">Agent</label>
                    <select
                      aria-label="Agent filter"
                      value={agentId}
                      onChange={(e) => applyAgent(e.target.value ? Number(e.target.value) : "")}
                      className="h-[34px] w-full rounded-lg border border-border bg-bg px-2.5 text-xs text-text outline-none transition focus:border-primary/50"
                    >
                      <option value="">All agents</option>
                      {(users ?? []).map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {accountsQuery.data && accountsQuery.data.length > 0 && (
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                      WhatsApp account
                    </label>
                    <select
                      aria-label="Account filter"
                      value={accountId}
                      onChange={(e) => applyAccount(e.target.value ? Number(e.target.value) : "")}
                      className="h-[34px] w-full rounded-lg border border-border bg-bg px-2.5 text-xs text-text outline-none transition focus:border-primary/50"
                    >
                      <option value="">All accounts</option>
                      {accountsQuery.data.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-2">
              {canExport && (
                <Popover open={exportOpen} onOpenChange={setExportOpen}>
                  <PopoverTrigger
                    disabled={exportsBusy}
                    className="inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-white shadow-xs transition hover:bg-primary-dark disabled:opacity-60"
                  >
                    {exportsBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    Export
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-60 p-1.5">
                    {EXPORT_BUTTONS.map(({ type, label, description, icon: Icon, pdf }) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleExport(type)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-bg",
                          pdf && "text-primary"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted" />
                        <span className="min-w-0">
                          <span className="block font-medium text-text">{label}</span>
                          <span className="block text-[11px] text-muted">{description}</span>
                        </span>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}
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
                <Link
                  href="/settings/workspace/analytics"
                  className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-border bg-bg px-3 text-xs font-medium text-text transition hover:bg-surface"
                >
                  <Settings2 className="size-3.5" />
                  Settings
                </Link>
              )}
            </div>
          </div>
        </div>
        {activeChips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            {activeChips.map((chip) => (
              <FilterChip key={chip.key} label={chip.label} onClear={chip.clear} />
            ))}
          </div>
        )}
      </header>

      {/* ── KPI strip ───────────────────────────────────────────── */}
      <section id="kpis" aria-label="Key metrics" className="scroll-mt-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {overview.isLoading
            ? Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-[110px] animate-pulse rounded-2xl border border-border bg-surface" />
              ))
            : (
                <>
                  <KpiTile
                    label="Conversations"
                    value={data ? (data.metrics.conversations.value ?? 0).toLocaleString() : "0"}
                    hint="started in period"
                    tooltip="Conversations created in the selected period."
                    icon={Users}
                    tone="blue"
                    metric={data?.metrics.conversations}
                    href="/inbox"
                  />
                  <KpiTile
                    label="Total leads"
                    value={data ? (data.metrics.leads_created.value ?? 0).toLocaleString() : "0"}
                    hint="new in period"
                    tooltip="New leads created in the selected period."
                    icon={Activity}
                    tone="violet"
                    metric={data?.metrics.leads_created}
                    href="/leads"
                  />
                  <KpiTile
                    label="Converted leads"
                    value={data ? (data.metrics.leads_converted.value ?? 0).toLocaleString() : "0"}
                    hint="converted to a deal"
                    tooltip="Leads converted to a deal within the selected period."
                    icon={CheckCircle2}
                    tone="green"
                    metric={data?.metrics.leads_converted}
                    href="/leads"
                  />
                  <KpiTile
                    label="Conversion rate"
                    value={data ? formatPercent(data.metrics.lead_conversion_rate.value ?? null) : "0%"}
                    hint="converted ÷ created"
                    tooltip="Leads converted ÷ leads created in the period. Conversion usually lags creation, so this is a period measure, not a lifetime rate."
                    icon={TrendingUp}
                    tone="orange"
                    metric={data?.metrics.lead_conversion_rate}
                    href="/leads"
                  />
                  <KpiTile
                    label="Avg response"
                    value={data ? formatMinutes(data.metrics.avg_response_minutes.value ?? null) : "–"}
                    hint="first reply speed"
                    tooltip="Mean first reply time: inbound customer message → first agent outbound reply in the period."
                    icon={Clock3}
                    tone="red"
                    metric={data?.metrics.avg_response_minutes}
                    href="/inbox"
                  />
                </>
              )}
        </div>
      </section>

      {/* ── Trend (hero) ────────────────────────────────────────── */}
      <ReportCard
        id="trend"
        title="Analytics trend"
        subtitle="Conversations, leads and conversions per day"
        icon={Activity}
        {...enquiry}
        onRetry={refresh}
        isEmpty={!trendData.some((d) => d.conversations > 0 || d.leads > 0 || d.converted > 0)}
        emptyLabel="trend data"
        action={
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full" style={{ backgroundColor: CHART.conversations }} /> Conversations
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full" style={{ backgroundColor: CHART.leads }} /> Leads
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full" style={{ backgroundColor: CHART.converted }} /> Converted
            </span>
          </div>
        }
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                {([
                  [CHART.conversations, "trendConversations"],
                  [CHART.leads, "trendLeads"],
                  [CHART.converted, "trendConverted"],
                ] as const).map(([color, id]) => (
                  <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="conversations"
                name="Conversations"
                stroke={CHART.conversations}
                strokeWidth={2}
                fill={`url(#trendConversations)`}
              />
              <Area type="monotone" dataKey="leads" name="Leads" stroke={CHART.leads} strokeWidth={2} fill={`url(#trendLeads)`} />
              <Area type="monotone" dataKey="converted" name="Converted" stroke={CHART.converted} strokeWidth={2} fill={`url(#trendConverted)`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      {/* ── Lead distribution + performance ─────────────────────── */}
      <div id="leads" className="grid scroll-mt-5 gap-5 xl:grid-cols-2">
        <ReportCard
          title="Lead distribution"
          subtitle="Current pipeline by lead status"
          icon={Users}
          {...enquiry}
          onRetry={refresh}
          isEmpty={leadDonutData.length === 0}
          emptyLabel="leads"
        >
          <div className="grid grid-cols-[1fr_auto] items-center gap-6">
            <div className="relative h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leadDonutData}
                    dataKey="count"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {leadDonutData.map((entry) => (
                      <Cell key={entry.slug} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold tabular-nums text-text">{data?.leads.total_current ?? 0}</p>
                <p className="text-[11px] text-muted">Total leads</p>
              </div>
            </div>
            <div className="max-h-60 space-y-2.5 overflow-y-auto pr-1">
              {leadDonutData.map((status) => (
                <div key={status.slug} className="flex items-center gap-2 text-xs">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
                  <span className="min-w-0 flex-1 truncate text-muted">{status.name}</span>
                  <span className="font-bold tabular-nums text-text">{status.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 border-t border-border/60 pt-3 text-[11px] text-muted">
            <span>Open {leadTypeLabels.open}</span>
            <span className="text-success">Won {leadTypeLabels.won}</span>
            <span className="text-danger">Lost {leadTypeLabels.lost}</span>
          </div>
        </ReportCard>

        <ReportCard
          title="Lead performance"
          subtitle="New leads created in the period, by status"
          icon={BarChart3}
          {...enquiry}
          onRetry={refresh}
          isEmpty={leadBarData.length === 0}
          emptyLabel="new leads"
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leadBarData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="32%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} interval={0} angle={-18} textAnchor="end" height={44} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-border)", opacity: 0.25 }} />
                <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {leadBarData.map((entry) => (
                    <Cell key={entry.slug} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ReportCard>
      </div>

      {/* ── Conversation analytics + response time ──────────────── */}
      <div className="grid gap-5 xl:grid-cols-2">
        <ReportCard
          title="Conversation analytics"
          subtitle="Messages and conversation state in the period"
          icon={Search}
          {...enquiry}
          onRetry={refresh}
          isEmpty={!data || (data.conversation_analytics.total_messages === 0 && data.conversation_analytics.conversations_in_period === 0)}
          emptyLabel="conversation data"
        >
          {data && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-bg/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Received</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-text">{data.conversation_analytics.messages_received.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-border bg-bg/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Sent</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-text">{data.conversation_analytics.messages_sent.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-border bg-bg/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Conversations</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-text">{data.conversation_analytics.conversations_in_period.toLocaleString()}</p>
                </div>
              </div>
              <div className="space-y-3">
                {data.conversation_analytics.by_status.map((row) => {
                  const max = Math.max(1, ...data.conversation_analytics.by_status.map((r) => r.count));
                  return (
                    <div key={row.status} className="grid grid-cols-[90px_1fr_60px] items-center gap-3">
                      <span className="truncate text-xs text-muted">{row.label}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-border/60">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(row.count / max) * 100}%` }} />
                      </div>
                      <span className="text-right text-xs font-semibold tabular-nums text-text">{row.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ReportCard>

        <ReportCard
          title="Response time"
          subtitle={`First reply: inbound → first agent outbound · ${data ? formatMinutes(data.response_speed.avg_response_minutes) : "n/a"} avg`}
          icon={Timer}
          {...enquiry}
          onRetry={refresh}
          isEmpty={(data?.response_speed.buckets ?? []).every((b) => b.count === 0)}
          emptyLabel="response data"
          action={data ? <DeltaBadge metric={data.metrics.avg_response_minutes} /> : undefined}
        >
          {data && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-bg/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Fastest</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-success">{formatMinutes(data.response_speed.fastest_response_minutes)}</p>
                </div>
                <div className="rounded-xl border border-border bg-bg/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Median</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-text">{formatMinutes(data.response_speed.median_response_minutes)}</p>
                </div>
                <div className="rounded-xl border border-border bg-bg/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Average</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-text">{formatMinutes(data.response_speed.avg_response_minutes)}</p>
                </div>
              </div>
              <div className="space-y-4">
                {(data?.response_speed.buckets ?? []).map((bucket) => (
                  <div key={bucket.key} className="grid grid-cols-[110px_1fr_88px] items-center gap-3">
                    <span className="truncate text-xs text-muted">{bucket.label}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-border/60">
                      <div
                        className={cn("h-full rounded-full", bucket.key === "no_reply" ? "bg-muted" : "bg-primary")}
                        style={{ width: `${(bucket.count / speedMax) * 100}%` }}
                      />
                    </div>
                    <span className="text-right text-xs font-semibold tabular-nums text-text">
                      {bucket.count} · {bucket.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ReportCard>
      </div>

      {/* ── Revenue trend (hero) ────────────────────────────────── */}
      <ReportCard
        id="revenue"
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
      <div id="outcomes" className="grid scroll-mt-5 gap-5 xl:grid-cols-2">
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

      {/* ── Calculated metrics ─────────────────────────────────── */}
      <ReportCard
        id="calculate"
        title="Calculated metrics"
        subtitle="Derived from the period totals"
        icon={Activity}
        {...enquiry}
        onRetry={refresh}
        isEmpty={!data || (data.metrics.won_count.value ?? 0) === 0}
        emptyLabel="won deals"
      >
        {data && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {([
              { label: "Avg deal value", value: formatMoney(data.metrics.won_count.value ? (data.metrics.won_value.value ?? 0) / data.metrics.won_count.value : null, reportCurrency), hint: "won value ÷ won deals" },
              { label: "Close rate", value: formatPercent(data.deal_outcomes.won.count + data.deal_outcomes.lost.count ? (data.deal_outcomes.won.count / (data.deal_outcomes.won.count + data.deal_outcomes.lost.count)) * 100 : null), hint: "won ÷ won + lost" },
              { label: "Tasks per agent", value: data.leaderboard.length ? (data.task_completion.completed / data.leaderboard.length).toFixed(1) : "0", hint: "completed ÷ agents" },
              { label: "Responses per day", value: data.response_speed.sample_size ? (data.response_speed.sample_size / Math.max(1, Math.round((Date.parse(data.period.to) - Date.parse(data.period.from)) / 86400000))).toFixed(1) : "0", hint: "sampled replies ÷ days" },
            ] as const).map(({ label, value, hint }) => (
              <div key={label} className="rounded-xl border border-border bg-bg/40 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
                <p className="mt-1 text-lg font-bold tabular-nums tracking-tight text-text">{value}</p>
                <p className="mt-0.5 text-[11px] text-muted">{hint}</p>
              </div>
            ))}
          </div>
        )}
      </ReportCard>

      {/* ── Agent leaderboard ───────────────────────────────────── */}
      <ReportCard
        id="team"
        title="Team performance"
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
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="border-b border-border px-3 py-2.5">Date</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Chats</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Leads</th>
                <th className="border-b border-border px-3 py-2.5 text-right">Converted</th>
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
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-violet">{row.leads || "–"}</td>
                  <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-success">{row.converted || "–"}</td>
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
    </div>
  );
}