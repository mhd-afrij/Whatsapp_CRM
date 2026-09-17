"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { endOfDay } from "date-fns";
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCalendarEvents, useCompleteCalendarEvent, useCreateCalendarEvent, useDeleteCalendarEvent, useReopenCalendarEvent, useUpdateCalendarEvent } from "@/hooks/use-calendar-events";
import { useLeadList } from "@/hooks/use-leads";
import type { CalendarEvent, CalendarEventFormValues, CalendarEventKind } from "@/lib/calendar-events-api";
import type { Lead } from "@/lib/leads-api";
import { ApiError } from "@/lib/api-client";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EVENT_KIND_LABELS: Record<CalendarEvent["kind"], string> = { follow_up: "Follow-up", call: "Call", meeting: "Appointment", reminder: "Reminder", other: "Event" };

function buildMonthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    return date;
  });
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toInputDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function dateAtNine(date: Date): string {
  const value = new Date(date);
  value.setHours(9, 0, 0, 0);
  return toInputDateTime(value.toISOString());
}

function leadName(lead: Lead): string {
  return lead.contact?.full_name || `Lead #${lead.id}`;
}

function EventModal({
  event,
  initialDate,
  leads,
  onClose,
  onSaved,
}: {
  event: CalendarEvent | null;
  initialDate: Date;
  leads: Lead[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const filters = useMemo(() => ({ start: initialDate.toISOString(), end: endOfDay(initialDate).toISOString() }), [initialDate]);
  const createMutation = useCreateCalendarEvent(filters);
  const updateMutation = useUpdateCalendarEvent(filters);
  const [title, setTitle] = useState(event?.title ?? "");
  const [startsAt, setStartsAt] = useState(event ? toInputDateTime(event.starts_at) : dateAtNine(initialDate));
  const [endsAt, setEndsAt] = useState(event ? toInputDateTime(event.ends_at) : "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [kind, setKind] = useState<CalendarEventKind>(event?.kind ?? "follow_up");
  const [leadId, setLeadId] = useState(event?.lead_id ? String(event.lead_id) : "");
  const [reminderAt, setReminderAt] = useState(toInputDateTime(event?.reminder_at));
  const [error, setError] = useState<string | null>(null);
  const pending = createMutation.isPending || updateMutation.isPending;

  const submit = async () => {
    if (!title.trim() || !startsAt) return;
    setError(null);
    const values: CalendarEventFormValues = {
      title: title.trim(),
      starts_at: toIso(startsAt) as string,
      ends_at: toIso(endsAt),
      location: location.trim() || null,
      kind,
      lead_id: leadId ? Number(leadId) : null,
      reminder_at: toIso(reminderAt),
    };
    try {
      if (event) await updateMutation.mutateAsync({ id: event.id, values });
      else await createMutation.mutateAsync(values);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save calendar event.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">{event ? "Edit event" : "New calendar event"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-bg"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <label className="block text-sm font-medium text-text">Title<input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text" placeholder="Follow up with client" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-text">Starts<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text" /></label>
            <label className="block text-sm font-medium text-text">Ends<input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text" /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-text">Type<select value={kind} onChange={(e) => setKind(e.target.value as CalendarEventKind)} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text">{EVENT_KINDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="block text-sm font-medium text-text">Lead<select value={leadId} onChange={(e) => setLeadId(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text"><option value="">No linked lead</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{leadName(lead)}</option>)}</select></label>
          </div>
          <label className="block text-sm font-medium text-text">Location<input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text" placeholder="Optional location or call link" /></label>
          <label className="block text-sm font-medium text-text">Reminder<input type="datetime-local" value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text" /><span className="mt-1 block text-xs text-muted">All active users in this workspace will be notified when it is due.</span></label>
          <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text">Cancel</button><button type="button" onClick={submit} disabled={pending || !title.trim() || !startsAt} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : event ? "Save changes" : "Create event"}</button></div>
        </div>
      </div>
    </div>
  );
}

function CalendarView() {
  const searchParams = useSearchParams();
  const today = new Date();
  const dateParam = searchParams?.get("date") ?? null;
  const [cursor, setCursor] = useState(() => {
    const parsed = dateParam ? new Date(`${dateParam}T00:00:00`) : today;
    return Number.isNaN(parsed.getTime()) ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  });
  const [prevDateParam, setPrevDateParam] = useState(dateParam);
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (prevDateParam !== dateParam) {
    setPrevDateParam(dateParam);
    if (dateParam) {
      const parsed = new Date(`${dateParam}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) setCursor(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
  }

  const filters = useMemo(() => ({ start: new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString(), end: endOfDay(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)).toISOString() }), [cursor]);
  const eventsQuery = useCalendarEvents(filters);
  const leadsQuery = useLeadList({ per_page: 100 });
  const completeMutation = useCompleteCalendarEvent(filters);
  const reopenMutation = useReopenCalendarEvent(filters);
  const deleteMutation = useDeleteCalendarEvent(filters);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of eventsQuery.data ?? []) {
      const key = dateKey(new Date(event.starts_at));
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [eventsQuery.data]);
  const days = buildMonthGrid(cursor.getFullYear(), cursor.getMonth());
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const leads = leadsQuery.data?.data ?? [];

  const onDelete = async (event: CalendarEvent) => {
    if (!window.confirm(`Delete "${event.title}"?`)) return;
    try { await deleteMutation.mutateAsync(event.id); setNotice("Event deleted."); } catch { setNotice("Unable to delete event."); }
  };
  const onToggle = async (event: CalendarEvent) => {
    try { if (event.completed_at) await reopenMutation.mutateAsync(event.id); else await completeMutation.mutateAsync(event.id); } catch { setNotice("Unable to update event."); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold text-text">Calendar &amp; Appointments</h1><p className="mt-1 text-sm text-muted">Schedule meetings, calls, follow-ups, reminders, and other workspace events.</p></div>
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
            const dayKey = dateKey(day);
            const dayEvents = eventsByDay.get(dayKey) ?? [];

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
                  {dayEvents.slice(0, 2).map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center gap-1 truncate rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300"
                      title={`${event.title} · ${new Date(event.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <span className="truncate">{EVENT_KIND_LABELS[event.kind]}: {event.title}</span>
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <p className="px-1.5 text-[10px] text-muted">+{dayEvents.length - 2} more</p>
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
      <Suspense fallback={null}>
        <CalendarView />
      </Suspense>
    </RequirePermission>
  );
}