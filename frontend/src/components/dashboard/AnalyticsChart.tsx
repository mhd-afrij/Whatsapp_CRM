"use client";

import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ResponseTimePoint, VolumePoint } from "@/lib/analytics-api";

const tooltipStyle = { backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 12, color: "var(--color-text)" };

interface AnalyticsChartProps {
  volume?: VolumePoint[];
  responseTrend?: ResponseTimePoint[];
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
}

export function AnalyticsChart({ volume, responseTrend, isLoading, isError, onRetry }: AnalyticsChartProps) {
  const merged = useMemo(() => {
    const byDate = new Map<string, { date: string; count: number; avg_response_minutes: number | null }>();
    for (const point of volume ?? []) {
      byDate.set(point.date, { date: point.date, count: point.count, avg_response_minutes: null });
    }
    for (const point of responseTrend ?? []) {
      const existing = byDate.get(point.date);
      if (existing) existing.avg_response_minutes = point.avg_response_minutes;
      else byDate.set(point.date, { date: point.date, count: 0, avg_response_minutes: point.avg_response_minutes });
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [volume, responseTrend]);

  const hasData = merged.some((point) => point.count > 0 || point.avg_response_minutes != null);

  return (
    <section className="card-hover relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="relative mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Conversation Analytics</p>
          <h2 className="mt-1 text-sm font-bold text-text">Message & response volume</h2>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <p className="flex items-center gap-1.5 text-xs text-muted"><span className="size-2 rounded-full bg-[var(--chart-series-1)]" /> Messages</p>
            <p className="mt-0.5 text-base font-bold text-text">{volume?.reduce((sum, p) => sum + p.count, 0) ?? 0}</p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs text-muted"><span className="size-2 rounded-full bg-[var(--chart-series-2)]" /> Avg response</p>
            <p className="mt-0.5 text-base font-bold text-text">
              {responseTrend && responseTrend.length ? `${responseTrend[0]?.avg_response_minutes ?? "—"} min` : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="relative">
        {isLoading ? (
          <div className="h-64 animate-shimmer rounded-xl" />
        ) : isError ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-danger">
            <span>Unable to load conversation analytics.</span>
            {onRetry && (
              <button type="button" onClick={onRetry} className="text-xs font-semibold text-primary hover:underline">Retry</button>
            )}
          </div>
        ) : !hasData ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted">No conversation activity yet for this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height={256}>
            <LineChart data={merged} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} width={34} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--color-muted)" }} />
              <Line yAxisId="left" type="monotone" dataKey="count" name="Messages" stroke="var(--chart-series-1)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              <Line yAxisId="right" type="monotone" dataKey="avg_response_minutes" name="Avg response (min)" stroke="var(--chart-series-2)" strokeWidth={2.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 4 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}