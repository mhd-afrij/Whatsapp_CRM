import type { LucideIcon } from "lucide-react";

interface DashboardKpiCardProps {
  label: string;
  value: string;
  supportingText: string;
  icon: LucideIcon;
  tone: "blue" | "green" | "orange" | "red" | "violet" | "slate";
  trend?: number[];
}

const tones = {
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  green: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  orange: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function Sparkline({ values, tone }: { values: number[]; tone: DashboardKpiCardProps["tone"] }) {
  if (values.length < 2 || values.every((value) => value === 0)) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${28 - ((value - min) / range) * 24}`).join(" ");
  const color = { blue: "#2563eb", green: "#16a34a", orange: "#ea580c", red: "#dc2626", violet: "#7c3aed", slate: "#64748b" }[tone];
  return <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-24" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function DashboardKpiCard({ label, value, supportingText, icon: Icon, tone, trend }: DashboardKpiCardProps) {
  return (
    <article className="group rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex size-10 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="size-5" /></div>
        {trend && <Sparkline values={trend} tone={tone} />}
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-text">{value}</p>
      <p className="mt-1 text-xs text-muted">{supportingText}</p>
    </article>
  );
}
