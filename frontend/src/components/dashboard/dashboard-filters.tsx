import { CalendarDays, Users } from "lucide-react";

export interface DashboardUser {
  id: number;
  name: string;
}

interface DashboardFiltersProps {
  from: string;
  to: string;
  today: string;
  agentUserId: number | "";
  users: DashboardUser[];
  canViewUsers: boolean;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onAgentChange: (value: number | "") => void;
}

export function DashboardFilters({
  from,
  to,
  today,
  agentUserId,
  users,
  canViewUsers,
  onFromChange,
  onToChange,
  onAgentChange,
}: DashboardFiltersProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <CalendarDays className="size-3.5 text-muted shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">From</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => onFromChange(event.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 py-1 text-xs text-text outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <CalendarDays className="size-3.5 text-muted shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">To</span>
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(event) => onToChange(event.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 py-1 text-xs text-text outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </label>
        {canViewUsers && (
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Users className="size-3.5 text-muted shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Owner</span>
            <select
              value={agentUserId}
              onChange={(event) => onAgentChange(event.target.value ? Number(event.target.value) : "")}
              className="h-8 rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-text outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20"
            >
              <option value="">All agents</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="text-[11px] text-muted hidden lg:block">
        Showing performance for <span className="font-semibold text-text">{from} to {to}</span>{agentUserId !== "" ? " (selected agent)" : " (all agents)"}
      </p>
    </div>
  );
}
