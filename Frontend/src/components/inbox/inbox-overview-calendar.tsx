"use client";

import { useState } from "react";
import Link from "next/link";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface InboxOverviewCalendarProps {
  selectedDate: Date;
  onSelect: (date: Date) => void;
  /** Count of tasks due per day (YYYY-MM-DD). */
  taskCountByDay: Map<string, number>;
  /** Count of events starting per day (YYYY-MM-DD). */
  eventCountByDay: Map<string, number>;
}

export function InboxOverviewCalendar({
  selectedDate,
  onSelect,
  taskCountByDay,
  eventCountByDay,
}: InboxOverviewCalendarProps) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => startOfMonth(selectedDate));

  // Keep the visible month in sync with the selected date (e.g. a "Jump to
  // today" from the day panel). Adjusts state during render — no effect.
  const selectedMonthKey = format(selectedDate, "yyyy-MM");
  const [prevMonthKey, setPrevMonthKey] = useState(selectedMonthKey);
  if (prevMonthKey !== selectedMonthKey) {
    setPrevMonthKey(selectedMonthKey);
    setCursor(startOfMonth(selectedDate));
  }

  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (
    let day = gridStart;
    day <= gridEnd;
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  ) {
    days.push(day);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-text">
          <CalendarDays className="h-4 w-4 text-primary" />
          Calendar
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor((prev) => addMonths(prev, -1))}
            aria-label="Previous month"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-primary-soft/50 hover:text-text"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[7.5rem] text-center text-sm font-medium text-text">
            {format(cursor, "MMMM yyyy")}
          </span>
          <button
            type="button"
            onClick={() => setCursor((prev) => addMonths(prev, 1))}
            aria-label="Next month"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-primary-soft/50 hover:text-text"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((weekday) => (
          <span
            key={weekday}
            className="py-1 text-[11px] font-semibold uppercase tracking-wide text-muted"
          >
            {weekday}
          </span>
        ))}
        {days.map((day) => {
          const inMonth = isSameMonth(day, cursor);
          const dayIsToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDate);
          const dayKey = format(day, "yyyy-MM-dd");
          const hasTasks = (taskCountByDay.get(dayKey) ?? 0) > 0;
          const hasEvents = (eventCountByDay.get(dayKey) ?? 0) > 0;

          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => onSelect(day)}
              aria-label={format(day, "EEEE, MMMM d, yyyy")}
              aria-current={dayIsToday ? "date" : undefined}
              aria-pressed={isSelected}
              title={[
                format(day, "EEEE, MMMM d"),
                hasTasks ? "Has tasks" : null,
                hasEvents ? "Has events" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              className={cn(
                "mx-auto flex h-10 w-10 flex-col items-center justify-center gap-0.5 rounded-full text-sm transition-colors",
                isSelected
                  ? "bg-primary font-semibold text-white hover:bg-primary-dark"
                  : dayIsToday
                    ? "font-semibold text-primary ring-1 ring-inset ring-primary hover:bg-primary-soft/60"
                    : inMonth
                      ? "text-text hover:bg-primary-soft/60"
                      : "text-muted opacity-40 hover:bg-primary-soft/40"
              )}
            >
              {format(day, "d")}
              <span className="flex h-1 items-center gap-0.5" aria-hidden="true">
                {hasTasks && (
                  <span
                    className={cn(
                      "h-1 w-1 rounded-full",
                      isSelected ? "bg-white" : "bg-primary"
                    )}
                  />
                )}
                {hasEvents && (
                  <span
                    className={cn(
                      "h-1 w-1 rounded-full",
                      isSelected ? "bg-white/70" : "bg-amber-500"
                    )}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted">
          {format(selectedDate, "MMMM d, yyyy")} selected
        </span>
        <Link
          href="/calendar"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-soft/50"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Open full Calendar
        </Link>
      </div>
    </div>
  );
}
