"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLeadList } from "@/hooks/use-leads";
import { cn } from "@/lib/utils";

const LEAD_STAGES = [
  { key: "new", label: "New Leads" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "converted", label: "Converted" },
] as const;

const BAR_COLORS = [
  "bg-[var(--chart-series-1)]",
  "bg-[var(--chart-series-2)]",
  "bg-[var(--chart-series-4)]",
  "bg-[var(--chart-series-3)]",
];

export function PipelineChart() {
  const newLeads = useLeadList({ stage: "new", per_page: 1 });
  const contactedLeads = useLeadList({ stage: "contacted", per_page: 1 });
  const qualifiedLeads = useLeadList({ stage: "qualified", per_page: 1 });
  const convertedLeads = useLeadList({ stage: "converted", per_page: 1 });
  const stageQueries = [newLeads, contactedLeads, qualifiedLeads, convertedLeads];

  const isLoading = stageQueries.some((query) => query.isLoading);
  const isError = stageQueries.some((query) => query.isError);
  const counts = stageQueries.map((query) => query.data?.meta.total ?? 0);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((sum, value) => sum + value, 0);
  const conversion = counts[0] > 0 ? Math.round((counts[3] / counts[0]) * 100) : 0;

  return (
    <section className="card-hover relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="relative mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Lead Pipeline</p>
          <h2 className="mt-1 text-sm font-bold text-text">Funnel overview</h2>
        </div>
        <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-dark">
          {conversion}% conversion
        </span>
      </div>

      <div className="relative space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {LEAD_STAGES.map((stage) => <div key={stage.key} className="h-9 animate-shimmer rounded-xl" />)}
          </div>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-danger">Unable to load lead pipeline.</p>
        ) : total === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No leads yet for this period.</p>
        ) : (
          LEAD_STAGES.map((stage, index) => {
            const count = counts[index];
            const width = Math.max(8, Math.round((count / max) * 100));
            return (
              <div key={stage.key}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-text">{stage.label}</span>
                  <span className="rounded-full bg-bg px-2 py-0.5 font-bold text-text">{count}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-bg">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700", BAR_COLORS[index])}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="relative mt-5 border-t border-border pt-4">
        <Link href="/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition hover:underline">
          Open pipeline <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}