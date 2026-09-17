"use client";

import { Suspense, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { endOfDay, startOfDay } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Pencil, Plus, Trash2, Users } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCalendarEvents, useCreateCalendarEvent, useDeleteCalendarEvent, useUpdateCalendarEvent } from "@/hooks/use-calendar-events";
import { useContactList } from "@/hooks/use-contacts";
import { useDealList } from "@/hooks/use-deals";
import { useLeadList } from "@/hooks/use-leads";
import { cn } from "@/lib/utils";
import type { CalendarEvent, CalendarEventFormValues, CalendarEventKind } from "@/lib/calendar-events-api";
import type { Contact } from "@/lib/contacts-api";
import type { Deal } from "@/lib/deals-api";
import type { Lead } from "@/lib/leads-api";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const KIND_LABELS: Record<CalendarEventKind, string> = { follow_up: "Follow-up", call: "Call", meeting: "Appointment", reminder: "Reminder", other: "Event" };
const KIND_CHIP: Record<CalendarEventKind, string> = {
  follow_up: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  call: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  meeting: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  reminder: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  other: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
};
const KIND_DOT: Record<CalendarEventKind, string> = {
  follow_up: "bg-amber-500",
  call: "bg-sky-500",
  meeting: "bg-violet-500",
  reminder: "bg-teal-500",
  other: "bg-slate-500",
};
const KIND_COLOR_HEX: Record<CalendarEventKind, string> = {
  follow_up: "#f59e0b",
  call: "#0ea5e9",
  meeting: "#8b5cf6",
  reminder: "#14b8a6",
  other: "#64748b",
};
const REMINDER_OPTIONS = [
  { value: "", label: "None" },
  { value: "10", label: "10 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "1440", label: "1 day before" },
  { value: "10080", label: "1 week before" },
];
const TIMELINE_START = 6;
const TIMELINE_END = 22;
const HOUR_HEIGHT = 48;
const TIMELINE_HOURS = TIMELINE_END - TIMELINE_START;

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function toTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function minutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function isoFromDateTimeLocal(value: string): string {
  return new Date(value).toISOString();
}

function addHour(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  return `${String((hour + 1) % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function reminderLabel(minutes: number | null): string {
  if (minutes == null) return "No reminder";
  if (minutes < 60) return `${minutes} minutes before`;
  if (minutes < 1440) {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hour${hours === 1 ? "" : "s"} before`;
  }
  if (minutes < 10080) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? "" : "s"} before`;
  }
  const weeks = minutes / 10080;
  return `${weeks} week${weeks === 1 ? "" : "s"} before`;
}

function contactLabel(contact?: Contact): string | null {
  return contact ? contact.full_name || contact.email || contact.company || `Contact #${contact.id}` : null;
}

function leadLabel(lead?: Lead): string | null {
  return lead ? lead.contact?.full_name || `Lead #${lead.id}` : null;
}

function dealLabel(deal?: Deal): string | null {
  return deal ? deal.title || `Deal #${deal.id}` : null;
}

function EventChip({
  event,
  onOpen,
  showTime = false,
}: {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
  showTime?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(event);
      }}
      title={`${KIND_LABELS[event.kind]}: ${event.title}${event.location ? ` · ${event.location}` : ""}`}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition hover:brightness-110",
        KIND_CHIP[event.kind]
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", KIND_DOT[event.kind])} />
      <span className="truncate">
        {!event.is_all_day && showTime ? `${formatTime(event.starts_at)} ` : ""}
        {event.is_all_day ? "All day · " : ""}
        {event.title}
      </span>
    </button>
  );
}

function MonthGrid({
  cursor,
  todayKey,
  eventsByDay,
  onDayClick,
  onEventClick,
}: {
  cursor: Date;
  todayKey: string;
  eventsByDay: Map<string, CalendarEvent[]>;
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}) {
  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = addDays(firstOfMonth, -firstOfMonth.getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border bg-primary-soft/30 text-center text-xs font-semibold uppercase text-muted">
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-2 py-2">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const isCurrentMonth = day.getMonth() === cursor.getMonth();
          const isToday = dateKey(day) === todayKey;
          const dayKey = dateKey(day);
          const dayEvents = eventsByDay.get(dayKey) ?? [];

          return (
            <div
              key={dayKey}
              onClick={() => onDayClick(day)}
              className={cn(
                "min-h-[110px] cursor-pointer border-b border-r border-border p-2 last:border-r-0 hover:bg-primary-soft/20",
                isCurrentMonth ? "bg-surface" : "bg-bg/60"
              )}
            >
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                  isToday ? "bg-primary text-white" : isCurrentMonth ? "text-text" : "text-muted"
                )}
              >
                {day.getDate()}
              </span>
              <div className="mt-1 space-y-1">
                {dayEvents.slice(0, 2).map((event) => (
                  <EventChip key={event.id} event={event} onOpen={onEventClick} />
                ))}
                {dayEvents.length > 2 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDayClick(day);
                    }}
                    className="px-1.5 text-[10px] font-medium text-muted hover:text-primary"
                  >
                    +{dayEvents.length - 2} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PlacedEvent {
  event: CalendarEvent;
  lane: number;
  laneCount: number;
  top: number;
  height: number;
}

function placeTimedEvents(timedByKey: Map<string, CalendarEvent[]>, key: string): PlacedEvent[] {
  const sortable = (timedByKey.get(key) ?? [])
    .map((event) => ({
      event,
      start: minutesFromMidnight(new Date(event.starts_at)),
      end: event.ends_at
        ? Math.max(minutesFromMidnight(new Date(event.ends_at)), minutesFromMidnight(new Date(event.starts_at)) + 30)
        : minutesFromMidnight(new Date(event.starts_at)) + 60,
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const laneEnd: number[] = [];
  const laneOf = new Map<number, number>();
  for (const item of sortable) {
    let lane = laneEnd.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(0);
    }
    laneEnd[lane] = item.end;
    laneOf.set(item.event.id, lane);
  }
  const laneCount = Math.max(1, laneEnd.length);

  const totalMinutes = TIMELINE_HOURS * 60;
  return sortable.map((item) => {
    const rawTop = (item.start - TIMELINE_START * 60) * (HOUR_HEIGHT / 60);
    const top = Math.max(0, rawTop);
    const rawHeight = (item.end - item.start) * (HOUR_HEIGHT / 60);
    const height = Math.min(Math.max(20, rawHeight - 2), totalMinutes * (HOUR_HEIGHT / 60) - top);
    return { event: item.event, lane: laneOf.get(item.event.id) ?? 0, laneCount, top, height };
  });
}

function filterBy(map: Map<string, CalendarEvent[]>, predicate: (event: CalendarEvent) => boolean): Map<string, CalendarEvent[]> {
  const result = new Map<string, CalendarEvent[]>();
  for (const [key, events] of map) {
    const filtered = events.filter(predicate);
    if (filtered.length > 0) {
      result.set(key, filtered);
    }
  }
  return result;
}

function TimelineGrid({
  days,
  allDayByKey,
  timedByKey,
  todayKey,
  onHourClick,
  onEventClick,
}: {
  days: Date[];
  allDayByKey: Map<string, CalendarEvent[]>;
  timedByKey: Map<string, CalendarEvent[]>;
  todayKey: string;
  onHourClick: (date: Date, hour: number) => void;
  onEventClick: (event: CalendarEvent) => void;
}) {
  const columns = days.length;
  const gutter = "3.5rem";
  const colWidth = `calc((100% - ${gutter}) / ${columns})`;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <div className="min-w-[700px]">
        <div className="grid border-b border-border bg-primary-soft/30" style={{ gridTemplateColumns: `${gutter} repeat(${columns}, minmax(0, 1fr))` }}>
          <div />
          {days.map((day) => {
            const isToday = dateKey(day) === todayKey;
            return (
              <div key={dateKey(day)} className="border-l border-border/60 px-2 py-2 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{WEEKDAYS[day.getDay()]}</p>
                <p
                  className={cn(
                    "mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                    isToday ? "bg-primary text-white" : "text-text"
                  )}
                >
                  {day.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        <div className="border-b border-border">
          <div className="grid" style={{ gridTemplateColumns: `${gutter} repeat(${columns}, minmax(0, 1fr))` }}>
            <div className="pr-1.5 text-right text-[10px] text-muted">All day</div>
            {days.map((day) => {
              const key = dateKey(day);
              const events = allDayByKey.get(key) ?? [];
              return (
                <div key={key} className="space-y-1 border-l border-border/60 p-1">
                  {events.map((event) => (
                    <EventChip key={event.id} event={event} onOpen={onEventClick} showTime />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative" style={{ height: TIMELINE_HOURS * HOUR_HEIGHT }}>
          <div className="absolute inset-0">
            {Array.from({ length: TIMELINE_HOURS }, (_, i) => TIMELINE_START + i).map((hour) => (
              <div
                key={hour}
                className="grid border-b border-border/60 last:border-b-0"
                style={{ gridTemplateColumns: `${gutter} repeat(${columns}, minmax(0, 1fr))`, height: HOUR_HEIGHT }}
              >
                <div className="-translate-y-1.5 pr-1.5 text-right align-top text-[10px] text-muted">{formatHour(hour)}</div>
                {days.map((day) => (
                  <div
                    key={dateKey(day)}
                    className="cursor-pointer border-l border-border/60 hover:bg-primary-soft/20"
                    onClick={() => onHourClick(day, hour)}
                  />
                ))}
              </div>
            ))}
          </div>
          {days.map((day, index) => {
            const key = dateKey(day);
            const placed = placeTimedEvents(timedByKey, key);
            return (
              <div
                key={key}
                className="absolute top-0 h-full"
                style={{ left: `calc(${gutter} + ${index} * ${colWidth})`, width: colWidth }}
              >
                {placed.map(({ event, lane, laneCount, top, height }) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onEventClick(event)}
                    style={{
                      top,
                      height,
                      left: `${(lane / laneCount) * 100}%`,
                      width: `calc(${100 / laneCount}% - 2px)`,
                      borderLeft: `3px solid ${KIND_COLOR_HEX[event.kind]}`,
                    }}
                    className={cn(
                      "absolute overflow-hidden rounded-r-md rounded-tl-sm p-1 text-left shadow-sm transition hover:brightness-110",
                      KIND_CHIP[event.kind]
                    )}
                    title={`${KIND_LABELS[event.kind]}: ${event.title}`}
                  >
                    <span className="block truncate text-[10px] font-semibold opacity-80">
                      {event.is_all_day ? "All day" : formatTime(event.starts_at)}
                    </span>
                    <span className="block truncate text-[11px] font-medium">{event.title}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const fieldClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary";

function EventFormDialog({
  open,
  onOpenChange,
  event,
  defaultDate,
  defaultTime,
  contacts,
  leads,
  deals,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CalendarEvent | null;
  defaultDate: string;
  defaultTime: string;
  contacts: Contact[];
  leads: Lead[];
  deals: Deal[];
}) {
  const createMutation = useCreateCalendarEvent({});
  const updateMutation = useUpdateCalendarEvent({});
  const queryClient = useQueryClient();
  const isEdit = event != null;

  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event ? dateKey(new Date(event.starts_at)) : defaultDate);
  const [startTime, setStartTime] = useState(event ? toTimeInput(new Date(event.starts_at)) : defaultTime);
  const [endTime, setEndTime] = useState(
    event?.ends_at ? toTimeInput(new Date(event.ends_at)) : addHour(event ? toTimeInput(new Date(event.starts_at)) : defaultTime)
  );
  const [allDay, setAllDay] = useState(event?.is_all_day ?? false);
  const [kind, setKind] = useState<CalendarEventKind>(event?.kind ?? "follow_up");
  const [contactId, setContactId] = useState(event?.contact_id != null ? String(event.contact_id) : "");
  const [leadId, setLeadId] = useState(event?.lead_id != null ? String(event.lead_id) : "");
  const [dealId, setDealId] = useState(event?.deal_id != null ? String(event.deal_id) : "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [reminder, setReminder] = useState(event?.reminder_minutes != null ? String(event.reminder_minutes) : "");
  const [error, setError] = useState<string | null>(null);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const submit = (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!allDay && endTime && endTime <= startTime) {
      setError("End time must be after the start time.");
      return;
    }
    setError(null);

    const effectiveEnd = endTime || addHour(startTime);
    const payload: CalendarEventFormValues = {
      title: title.trim(),
      kind,
      location: location.trim() || null,
      description: description.trim() || null,
      is_all_day: allDay,
      contact_id: contactId ? Number(contactId) : null,
      lead_id: leadId ? Number(leadId) : null,
      deal_id: dealId ? Number(dealId) : null,
      reminder_minutes: reminder ? Number(reminder) : null,
      starts_at: isoFromDateTimeLocal(`${date}T${allDay ? "00:00" : startTime}`),
      ends_at: isoFromDateTimeLocal(`${date}T${allDay ? "23:59" : effectiveEnd}`),
    };

    const done = () => {
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    };
    const failed = (err: unknown) =>
      setError(err instanceof Error ? err.message : isEdit ? "Unable to update event." : "Unable to create event.");

    if (isEdit && event) {
      updateMutation.mutate({ id: event.id, values: payload }, { onSuccess: done, onError: failed });
    } else {
      createMutation.mutate(payload, { onSuccess: done, onError: failed });
    }
  };

  const rowClass = "flex flex-wrap items-center gap-3";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update the event details below." : `Scheduled for ${date}.`}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="space-y-1">
            <label htmlFor="event-title" className="text-sm font-medium text-text">
              Title *
            </label>
            <input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} placeholder="Follow up with contact" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="event-date" className="text-sm font-medium text-text">
                Date
              </label>
              <input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm font-medium text-text">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 accent-primary" />
              All day
            </label>
          </div>

          {!allDay ? (
            <div className={rowClass}>
              <div className="min-w-32 flex-1 space-y-1">
                <label htmlFor="event-start" className="text-sm font-medium text-text">
                  Start time
                </label>
                <input id="event-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={fieldClass} />
              </div>
              <div className="min-w-32 flex-1 space-y-1">
                <label htmlFor="event-end" className="text-sm font-medium text-text">
                  End time
                </label>
                <input id="event-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={fieldClass} />
              </div>
            </div>
          ) : (
            <p className="rounded-md bg-primary-soft/30 px-3 py-2 text-xs text-primary">All-day event — spans the full day.</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="event-kind" className="text-sm font-medium text-text">
                Type
              </label>
              <select id="event-kind" value={kind} onChange={(e) => setKind(e.target.value as CalendarEventKind)} className={fieldClass}>
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="event-reminder" className="text-sm font-medium text-text">
                Reminder
              </label>
              <select id="event-reminder" value={reminder} onChange={(e) => setReminder(e.target.value)} className={fieldClass}>
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="event-contact" className="text-sm font-medium text-text">
                Contact
              </label>
              <select id="event-contact" value={contactId} onChange={(e) => setContactId(e.target.value)} className={fieldClass}>
                <option value="">None</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contactLabel(contact) ?? `Contact #${contact.id}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="event-lead" className="text-sm font-medium text-text">
                Lead
              </label>
              <select id="event-lead" value={leadId} onChange={(e) => setLeadId(e.target.value)} className={fieldClass}>
                <option value="">None</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {leadLabel(lead) ?? `Lead #${lead.id}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="event-deal" className="text-sm font-medium text-text">
                Deal
              </label>
              <select id="event-deal" value={dealId} onChange={(e) => setDealId(e.target.value)} className={fieldClass}>
                <option value="">None</option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {dealLabel(deal) ?? `Deal #${deal.id}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="event-location" className="text-sm font-medium text-text">
              Location
            </label>
            <input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} className={fieldClass} placeholder="Office, meeting room, video link..." />
          </div>

          <div className="space-y-1">
            <label htmlFor="event-description" className="text-sm font-medium text-text">
              Description
            </label>
            <textarea id="event-description" value={description} onChange={(e) => setDescription(e.target.value)} className={cn(fieldClass, "min-h-20 resize-y")} placeholder="Agenda, notes, prep..." />
          </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : isEdit ? "Save changes" : "Create event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EventDetailDialog({
  event,
  contacts,
  leads,
  deals,
  onClosed,
  onEdit,
}: {
  event: CalendarEvent;
  contacts: Contact[];
  leads: Lead[];
  deals: Deal[];
  onClosed: () => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const deleteMutation = useDeleteCalendarEvent({});
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const related = [
    contactLabel(contacts.find((contact) => contact.id === event.contact_id)),
    dealLabel(deals.find((deal) => deal.id === event.deal_id)),
    leadLabel(leads.find((lead) => lead.id === event.lead_id)),
  ].filter((label): label is string => label != null);

  const when = event.is_all_day
    ? new Date(event.starts_at).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : `${new Date(event.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${formatTime(event.starts_at)}${
        event.ends_at ? ` – ${formatTime(event.ends_at)}` : ""
      }`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClosed()}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-md">
        <DialogHeader>
          <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", KIND_CHIP[event.kind])}>
            <span className={cn("h-1.5 w-1.5 rounded-full", KIND_DOT[event.kind])} />
            {KIND_LABELS[event.kind]}
          </span>
          <DialogTitle className="mt-1">{event.title}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto pr-1">
          {confirming ? (
          <div className="space-y-3">
            <p className="text-sm text-text">
              Delete <span className="font-semibold">“{event.title}”</span>? This action cannot be undone.
            </p>
            {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <DetailRow icon={CalendarDays}>{when}</DetailRow>
            {event.location && <DetailRow icon={MapPin}>{event.location}</DetailRow>}
            {related.length > 0 && (
              <DetailRow icon={Users}>
                {related.map((label, index) => (
                  <span key={label}>
                    {index > 0 && ", "}
                    <span className="font-medium text-text">{label}</span>
                  </span>
                ))}
              </DetailRow>
            )}
            <DetailRow icon={Clock3}>{reminderLabel(event.reminder_minutes)}</DetailRow>
            {event.description && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{event.description}</p>}
          </div>
        )}
        </div>

        <DialogFooter className="pt-2">
          {confirming ? (
            <>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() =>
                  deleteMutation.mutate(event.id, {
                    onSuccess: () => {
                      onClosed();
                      void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
                    },
                    onError: (err) => setError(err instanceof Error ? err.message : "Unable to delete event."),
                  })
                }
              >
                <Trash2 className="size-4" />
                {deleteMutation.isPending ? "Deleting..." : "Delete event"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onClosed()}>
                Close
              </Button>
              <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
                <Trash2 className="size-4" />
                Delete
              </Button>
              <Button type="button" onClick={() => onEdit(event)}>
                <Pencil className="size-4" />
                Edit
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ icon: Icon, children }: { icon: typeof CalendarDays; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-muted">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CalendarView() {
  const searchParams = useSearchParams();
  const today = new Date();
  const dateParam = searchParams?.get("date") ?? null;

  const [cursor, setCursor] = useState<Date>(() => {
    if (dateParam) {
      const parsed = new Date(`${dateParam}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  });
  const [prevDateParam, setPrevDateParam] = useState(dateParam);
  if (prevDateParam !== dateParam) {
    setPrevDateParam(dateParam);
    if (dateParam) {
      const parsed = new Date(`${dateParam}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        setCursor(parsed);
      }
    }
  }

  const [view, setView] = useState<"month" | "week" | "day">("month");

  const filters = useMemo(() => {
    if (view === "month") {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      return { start: startOfDay(first).toISOString(), end: endOfDay(last).toISOString() };
    }
    if (view === "week") {
      const start = addDays(cursor, -cursor.getDay());
      return { start: startOfDay(start).toISOString(), end: endOfDay(addDays(start, 6)).toISOString() };
    }
    return { start: startOfDay(cursor).toISOString(), end: endOfDay(cursor).toISOString() };
  }, [cursor, view]);

  const eventsQuery = useCalendarEvents(filters);
  const contactsQuery = useContactList({ per_page: 100, sort: "full_name", direction: "asc" });
  const leadsQuery = useLeadList({ per_page: 100 });
  const dealsQuery = useDealList({ per_page: 100 });

  const contacts = useMemo(() => contactsQuery.data?.data ?? [], [contactsQuery.data]);
  const leads = useMemo(() => leadsQuery.data?.data ?? [], [leadsQuery.data]);
  const deals = useMemo(() => dealsQuery.data?.data ?? [], [dealsQuery.data]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of eventsQuery.data ?? []) {
      const key = dateKey(new Date(event.starts_at));
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [eventsQuery.data]);

  const allDayByDay = useMemo(() => filterBy(eventsByDay, (event) => event.is_all_day), [eventsByDay]);
  const timedByDay = useMemo(() => filterBy(eventsByDay, (event) => !event.is_all_day), [eventsByDay]);

  const [detailEventId, setDetailEventId] = useState<number | null>(null);
  const [formState, setFormState] = useState<{ event: CalendarEvent | null; date: string; time: string } | null>(null);

  const detailEvent = detailEventId != null ? (eventsQuery.data ?? []).find((event) => event.id === detailEventId) ?? null : null;

  const goToday = () => setCursor(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const goPrev = () => {
    if (view === "month") setCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
    else if (view === "week") setCursor((current) => addDays(current, -7));
    else setCursor((current) => addDays(current, -1));
  };
  const goNext = () => {
    if (view === "month") setCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
    else if (view === "week") setCursor((current) => addDays(current, 7));
    else setCursor((current) => addDays(current, 1));
  };

  const openCreate = (date: Date, hour = 9) => setFormState({ event: null, date: dateKey(date), time: `${String(hour).padStart(2, "0")}:00` });
  const openCreateNow = () => {
    const next = new Date(today);
    next.setMinutes(0, 0, 0);
    next.setHours(today.getHours() + 1);
    setFormState({ event: null, date: dateKey(next), time: toTimeInput(next) });
  };
  const openEdit = (event: CalendarEvent) => {
    setDetailEventId(null);
    setFormState({ event, date: dateKey(new Date(event.starts_at)), time: toTimeInput(new Date(event.starts_at)) });
  };

  const weekStart = addDays(cursor, -cursor.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayKey = dateKey(today);

  const label =
    view === "month"
      ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "week"
        ? `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}`
        : cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text">Calendar</h1>
        <p className="mt-1 text-sm text-muted">Schedule meetings, calls, follow-ups, reminders, and other workspace events.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={goToday}>
          Today
        </Button>
        <div className="flex items-center rounded-lg border border-border">
          <button type="button" onClick={goPrev} aria-label="Previous" className="rounded-l-lg p-1.5 text-muted hover:bg-primary-soft/40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[10rem] text-center text-sm font-medium text-text">{label}</span>
          <button type="button" onClick={goNext} aria-label="Next" className="rounded-r-lg p-1.5 text-muted hover:bg-primary-soft/40">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border">
            {(["month", "week", "day"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold capitalize transition",
                  view === mode ? "bg-primary text-white" : "text-muted hover:bg-primary-soft/40 hover:text-text"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          <Button type="button" onClick={openCreateNow}>
            <Plus className="size-4" />
            New event
          </Button>
        </div>
      </div>

      {eventsQuery.isLoading && !eventsQuery.data ? (
        <div className="h-80 animate-pulse rounded-lg border border-border bg-surface" />
      ) : eventsQuery.isError ? (
        <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger-light/30 p-4 text-sm text-danger">
          <span>Unable to load calendar events.</span>
          <Button type="button" variant="outline" onClick={() => eventsQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : view === "month" ? (
        <MonthGrid cursor={cursor} todayKey={todayKey} eventsByDay={eventsByDay} onDayClick={openCreate} onEventClick={(event) => setDetailEventId(event.id)} />
      ) : (
        <TimelineGrid
          days={view === "week" ? weekDays : [cursor]}
          allDayByKey={allDayByDay}
          timedByKey={timedByDay}
          todayKey={todayKey}
          onHourClick={openCreate}
          onEventClick={(event) => setDetailEventId(event.id)}
        />
      )}

      {formState && (
        <EventFormDialog
          open
          onOpenChange={(open) => !open && setFormState(null)}
          event={formState.event}
          defaultDate={formState.date}
          defaultTime={formState.time}
          contacts={contacts}
          leads={leads}
          deals={deals}
        />
      )}

      {detailEvent && (
        <EventDetailDialog
          event={detailEvent}
          contacts={contacts}
          leads={leads}
          deals={deals}
          onClosed={() => setDetailEventId(null)}
          onEdit={openEdit}
        />
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <RequirePermission permission="tasks.manage">
      <Suspense fallback={null}>
        <CalendarView />
      </Suspense>
    </RequirePermission>
  );
}