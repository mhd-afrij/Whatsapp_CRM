import { PageHeader } from "@/components/ui/PageHeader";

const KPIS = [
  { label: "Open conversations", value: "24" },
  { label: "Unassigned conversations", value: "3" },
  { label: "Avg. first response time", value: "4m 12s" },
  { label: "New leads (7d)", value: "18" },
  { label: "Conversion rate", value: "32%" },
  { label: "Pipeline value", value: "$84,200" },
  { label: "Tasks due today", value: "6" },
  { label: "Overdue tasks", value: "1" },
];

export default function AnalyticsPage() {
  return (
    <div>
      <PageHeader title="Analytics" description="Workspace-wide KPIs across conversations, leads, and tasks." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {KPIS.map((kpi) => (
          <div key={kpi.label} className="rounded-[10px] border border-border bg-surface p-5">
            <p className="text-xs text-text-muted mb-2">{kpi.label}</p>
            <p className="text-2xl font-semibold text-text-primary">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-[10px] border border-border bg-surface p-5">
          <p className="text-sm font-medium text-text-primary mb-1">Conversation volume</p>
          <p className="text-xs text-text-muted mb-4">Incoming vs. outgoing, last 14 days</p>
          <div className="h-40 rounded-md bg-surface-raised border border-dashed border-border flex items-center justify-center text-xs text-text-muted">
            Chart renders once analytics data exists (Phase 8)
          </div>
        </div>
        <div className="rounded-[10px] border border-border bg-surface p-5">
          <p className="text-sm font-medium text-text-primary mb-1">Leads by stage</p>
          <p className="text-xs text-text-muted mb-4">Current pipeline distribution</p>
          <div className="h-40 rounded-md bg-surface-raised border border-dashed border-border flex items-center justify-center text-xs text-text-muted">
            Chart renders once analytics data exists (Phase 8)
          </div>
        </div>
      </div>
    </div>
  );
}
