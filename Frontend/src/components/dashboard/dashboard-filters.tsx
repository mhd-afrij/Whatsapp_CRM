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
    <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-surface/80 p-2 shadow-sm">
      <label className="flex min-w-[145px] flex-1 flex-col gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" /> From</span>
        <input
          type="date"
          value={from}
          max={to}
          onChange={(event) => onFromChange(event.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm font-normal normal-case tracking-normal text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>
      <label className="flex min-w-[145px] flex-1 flex-col gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" /> To</span>
        <input
          type="date"
          value={to}
          min={from}
          max={today}
          onChange={(event) => onToChange(event.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm font-normal normal-case tracking-normal text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>
      {canViewUsers && (
        <label className="flex min-w-[170px] flex-1 flex-col gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <span className="flex items-center gap-1.5"><Users className="size-3.5" /> Owner</span>
          <select
            value={agentUserId}
            onChange={(event) => onAgentChange(event.target.value ? Number(event.target.value) : "")}
            className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm font-normal normal-case tracking-normal text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All agents</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
