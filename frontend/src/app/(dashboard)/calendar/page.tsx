"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { useTaskList } from "@/hooks/use-tasks";
import type { Task, TaskPriority } from "@/lib/tasks-api";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function priorityDotClass(priority: TaskPriority) {
  switch (priority) {
    case "urgent":
      return "bg-danger";
    case "high":
      return "bg-amber-500";
    case "medium":
      return "bg-primary";
    default:
      return "bg-muted";
  }
}

function buildMonthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    return date;
  });
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function CalendarView() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const canViewTeam = usePermission("tasks.view_team");
  const { data } = useTaskList({ team: canViewTeam || undefined, per_page: 100 });

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of data?.data ?? []) {
      if (!task.due_at) continue;
      const key = dateKey(new Date(task.due_at));
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return map;
  }, [data]);

  const days = buildMonthGrid(cursor.getFullYear(), cursor.getMonth());
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="rounded-md border border-border p-1.5 text-muted hover:bg-primary-soft/40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[10rem] text-center text-sm font-medium text-text">{monthLabel}</span>
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="rounded-md border border-border p-1.5 text-muted hover:bg-primary-soft/40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-7 border-b border-border bg-primary-soft/30 text-center text-xs font-semibold uppercase text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const isCurrentMonth = day.getMonth() === cursor.getMonth();
            const isToday = dateKey(day) === dateKey(today);
            const dayTasks = tasksByDay.get(dateKey(day)) ?? [];

            return (
              <div
                key={day.toISOString()}
                className={`min-h-[110px] border-b border-r border-border p-2 last:border-r-0 ${
                  isCurrentMonth ? "bg-surface" : "bg-bg/60"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isToday ? "bg-primary text-white" : isCurrentMonth ? "text-text" : "text-muted"
                  }`}
                >
                  {day.getDate()}
                </span>
                <div className="mt-1 space-y-1">
                  {dayTasks.slice(0, 3).map((task) => (
                    <Link
                      key={task.id}
                      href={`/tasks/${task.id}`}
                      className="flex items-center gap-1 truncate rounded bg-primary-soft/40 px-1.5 py-0.5 text-[11px] text-text hover:bg-primary-soft"
                      title={task.title}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityDotClass(task.priority)}`} />
                      <span className="truncate">{task.title}</span>
                    </Link>
                  ))}
                  {dayTasks.length > 3 && (
                    <p className="px-1.5 text-[10px] text-muted">+{dayTasks.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <RequirePermission permission="tasks.manage">
      <CalendarView />
    </RequirePermission>
  );
}
