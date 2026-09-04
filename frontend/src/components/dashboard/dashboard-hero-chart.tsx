import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WonVsLostPoint } from "@/lib/analytics-api";

const tooltipStyle = { backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 12, color: "var(--color-text)" };

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Compact axis labels without the "$0k" artifact for sub-1000 values. */
function formatAxisCurrency(value: number) {
  const amount = Number(value);
  if (Math.abs(amount) >= 1000) return `$${amount / 1000}k`;
  return formatCurrency(amount);
}

interface DashboardHeroChartProps {
  data?: WonVsLostPoint[];
  isLoading: boolean;
  isError: boolean;
}

export function DashboardHeroChart({ data, isLoading, isError }: DashboardHeroChartProps) {
  const hasData = data?.some((point) => point.won_value > 0 || point.lost_value > 0);
  const totals = (data ?? []).reduce((result, point) => ({ won: result.won + (point.won_value ?? 0), lost: result.lost + (point.lost_value ?? 0) }), { won: 0, lost: 0 });

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Revenue pulse</p>
          <h2 className="mt-0.5 text-base font-bold tracking-tight text-text">Pipeline performance</h2>
          <p className="mt-0.5 text-xs text-muted">Won and lost deal value across the selected period.</p>
        </div>
        <div className="flex items-center gap-4">
          <div><p className="text-[11px] text-muted">Won value</p><p className="font-bold text-success text-sm sm:text-base">{formatCurrency(totals.won)}</p></div>
          <div><p className="text-[11px] text-muted">Lost value</p><p className="font-bold text-danger text-sm sm:text-base">{formatCurrency(totals.lost)}</p></div>
        </div>
      </div>
      <div className="p-3 sm:p-4">
        {isLoading ? (
          <div className="h-32 animate-pulse rounded-lg bg-border/60" />
        ) : isError ? (
          <div className="flex h-24 items-center justify-center text-xs text-danger">Unable to load pipeline performance.</div>
        ) : !hasData ? (
          <div className="flex h-24 items-center justify-center text-xs text-muted">No closed deal value for this period yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data ?? []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="wonValueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-series-3)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--chart-series-3)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="lostValueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-series-5)" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="var(--chart-series-5)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={formatAxisCurrency} tick={{ fontSize: 11, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatCurrency(Number(value))} />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--color-muted)" }} />
              <Area type="monotone" dataKey="won_value" name="Won value" stroke="var(--chart-series-3)" fill="url(#wonValueGradient)" strokeWidth={2} />
              <Area type="monotone" dataKey="lost_value" name="Lost value" stroke="var(--chart-series-5)" fill="url(#lostValueGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
