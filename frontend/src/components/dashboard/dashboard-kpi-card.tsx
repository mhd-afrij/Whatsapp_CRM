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
  blue: "bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 ring-1 ring-inset ring-blue-600/10 dark:from-blue-950/60 dark:to-blue-900/30 dark:text-blue-300 dark:ring-blue-400/20",
  green: "bg-gradient-to-br from-green-50 to-green-100 text-green-700 ring-1 ring-inset ring-green-600/10 dark:from-green-950/60 dark:to-green-900/30 dark:text-green-300 dark:ring-green-400/20",
  orange: "bg-gradient-to-br from-orange-50 to-orange-100 text-orange-700 ring-1 ring-inset ring-orange-600/10 dark:from-orange-950/60 dark:to-orange-900/30 dark:text-orange-300 dark:ring-orange-400/20",
  red: "bg-gradient-to-br from-red-50 to-red-100 text-red-700 ring-1 ring-inset ring-red-600/10 dark:from-red-950/60 dark:to-red-900/30 dark:text-red-300 dark:ring-red-400/20",
  violet: "bg-gradient-to-br from-violet-50 to-violet-100 text-violet-700 ring-1 ring-inset ring-violet-600/10 dark:from-violet-950/60 dark:to-violet-900/30 dark:text-violet-300 dark:ring-violet-400/20",
  slate: "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 ring-1 ring-inset ring-slate-600/10 dark:from-slate-800 dark:to-slate-900 dark:text-slate-300 dark:ring-slate-400/20",
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
    <article className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-card animate-rise transition-all duration-200 ease-out-soft hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card-hover motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-primary/[0.06] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none" />
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
