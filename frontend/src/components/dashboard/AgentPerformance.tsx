"use client";

import type { AgentPerformancePoint } from "@/lib/analytics-api";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "bg-primary-soft text-primary-dark",
  "bg-blue-950/40 text-blue-300",
  "bg-violet-950/40 text-violet-300",
  "bg-orange-950/40 text-orange-300",
  "bg-emerald-950/40 text-emerald-300",
  "bg-slate-800 text-slate-300",
];

interface AgentPerformanceProps {
  agents?: AgentPerformancePoint[];
  isLoading: boolean;
  isError: boolean;
  teamAvgResponseMinutes?: number | null;
}

export function AgentPerformance({ agents, isLoading, isError, teamAvgResponseMinutes }: AgentPerformanceProps) {
  const maxHandled = Math.max(1, ...(agents ?? []).map((agent) => agent.conversations_handled));

  return (
    <section className="card-hover relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="relative mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Agent Performance</p>
          <h2 className="mt-1 text-sm font-bold text-text">Team performance</h2>
        </div>
        {teamAvgResponseMinutes != null && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted">Team avg reply</p>
            <p className="text-base font-bold text-text">{teamAvgResponseMinutes} min</p>
          </div>
        )}
      </div>

      <div className="relative space-y-3.5">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-11 animate-shimmer rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-danger">Unable to load agent performance.</p>
        ) : !agents || agents.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No agent activity for this period.</p>
        ) : (
          agents.slice(0, 6).map((agent, index) => (
            <div
              key={agent.user_id}
              className="flex items-center gap-3.5 rounded-xl border border-border/60 bg-bg/50 p-3 transition hover:border-primary/30 hover:bg-card-2/60"
            >
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", AVATAR_COLORS[index % AVATAR_COLORS.length])}>
                {agent.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">{agent.name}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-500"
                    style={{ width: `${Math.max(6, Math.round((agent.conversations_handled / maxHandled) * 100))}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-text">{agent.conversations_handled}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted">chats</p>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <p className="text-sm font-bold text-text">{agent.tasks_completed}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted">tasks</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}