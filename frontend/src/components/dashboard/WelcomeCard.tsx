"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Megaphone, RefreshCw, Sparkles } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { requestReportExport, type DashboardSummary } from "@/lib/analytics-api";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function currency(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function Chip({ label, value, accent }: { label: string; value: string; accent?: "green" | "blue" | "violet" | "orange" }) {
  const accentClass = {
    green: "text-success",
    blue: "text-info",
    violet: "text-violet-400",
    orange: "text-orange-400",
  }[accent ?? "green"];
  return (
    <div className="rounded-xl border border-border bg-background/60 px-4 py-3 backdrop-blur-sm">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tracking-tight ${accentClass}`}>{value}</p>
    </div>
  );
}

interface WelcomeCardProps {
  userName: string;
  summary?: DashboardSummary;
  isRefreshing: boolean;
  onRefresh: () => void;
  from: string;
  to: string;
}

function ExportButton({ from, to, className }: { from: string; to: string; className: string }) {
  const canExport = usePermission("analytics.export");
  const [state, setState] = useState<"idle" | "generating" | "queued" | "error">("idle");
  if (!canExport) return null;
  async function trigger() {
    setState("generating");
    try {
      await requestReportExport("deals", { from, to });
      setState("queued");
      window.setTimeout(() => setState("idle"), 8000);
    } catch {
      setState("error");
      window.setTimeout(() => setState("idle"), 4000);
    }
  }
  return (
    <button
      type="button"
      onClick={trigger}
      disabled={state === "generating"}
      className={`inline-flex items-center justify-center gap-2 text-sm font-semibold transition disabled:opacity-60 ${className}`}
    >
      <Download className="size-4" />
      {state === "generating" ? "Generating..." : state === "queued" ? "Report queued" : state === "error" ? "Retry export" : "Export Report"}
    </button>
  );
}

export function WelcomeCard({ userName, summary, isRefreshing, onRefresh, from, to }: WelcomeCardProps) {
  return (
    <section className="gradient-hero card-hover relative overflow-hidden rounded-3xl border border-border p-5 shadow-sm sm:p-7">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-violet-500/10 blur-3xl" />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-500 text-white">
              <Sparkles className="size-4" />
            </span>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Workspace Intelligence</p>
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-text sm:text-3xl">
            {greeting()}, {userName} <span className="inline-block">👋</span>
          </h1>
          <p className="mt-1.5 text-sm text-muted">Here is what is happening with your customer conversations today.</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:w-auto">
          <Chip label="Open conversations" value={String(summary?.conversations.open ?? "—")} accent="green" />
          <Chip label="Pipeline value" value={summary ? currency(summary.deals.pipeline_value) : "—"} accent="blue" />
          <Chip label="New contacts" value={String(summary?.contacts.new ?? "—")} accent="violet" />
          <Chip label="Team members" value={String(summary?.agent_workload.length ?? "—")} accent="orange" />
        </div>
      </div>

      <div className="relative mt-6 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text shadow-sm transition hover:bg-card-2 disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
        <ExportButton
          from={from}
          to={to}
          className="h-10 rounded-xl border border-border bg-surface px-4 text-text shadow-sm hover:bg-card-2"
        />
        <Link
          href="/campaigns/new"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-emerald-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          <Megaphone className="size-4" />
          Create Campaign
        </Link>
      </div>
    </section>
  );
}