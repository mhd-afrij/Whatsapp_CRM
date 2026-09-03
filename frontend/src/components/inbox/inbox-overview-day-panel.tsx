"use client";

import { useState, type FormEvent } from "react";
import { endOfDay, format, isToday, startOfDay } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  Circle,
  Loader2,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { usePermission } from "@/hooks/use-permission";
import { useTaskList, useCreateTask } from "@/hooks/use-tasks";
import {
  useCalendarEvents,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
} from "@/hooks/use-calendar-events";
import type { CalendarEventKind } from "@/lib/calendar-events-api";
import { useNoteList, useCreateNote, useDeleteNote } from "@/hooks/use-notes";
import { completeTask, deleteTask, reopenTask, type TaskPriority } from "@/lib/tasks-api";

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: "bg-slate-400",
  medium: "bg-primary",
  high: "bg-amber-500",
  urgent: "bg-danger",
};

const EVENT_KIND_LABELS: Record<CalendarEventKind, string> = {
  follow_up: "Follow-up",
  call: "Call",
  meeting: "Meeting",
  reminder: "Reminder",
  other: "Other",
};

const EVENT_KINDS = Object.keys(EVENT_KIND_LABELS) as CalendarEventKind[];

interface InboxOverviewDayPanelProps {
  date: Date;
  onSelectDate: (date: Date) => void;
}

export function InboxOverviewDayPanel({ date, onSelectDate }: InboxOverviewDayPanelProps) {
  const queryClient = useQueryClient();
  const dateKey = format(date, "yyyy-MM-dd");
  const { user } = useAuth();
  const canManageTasks = usePermission("tasks.manage");
  const canCreateNotes = usePermission("notes.create");
  const canManageAnyNotes = usePermission("notes.manage_any");
  const canViewTeam = usePermission("tasks.view_team");
  const team = canViewTeam || undefined;

  const tasksQuery = useTaskList({ team, due_date: dateKey, per_page: 50 });
  // Fetch by the local day's instant range so grouping matches the busy-day
  // dots (which group client-side by local date), rather than the server's
  // DB-timezone whereDate semantics.
  const eventsQuery = useCalendarEvents(
    {
      start: startOfDay(date).toISOString(),
      end: endOfDay(date).toISOString(),
    },
    canManageTasks || canViewTeam
  );
  const notesQuery = useNoteList({ calendar_date: dateKey });

  const createTaskMutation = useCreateTask();
  const completeMutation = useMutation({
    mutationFn: (id: number) => completeTask(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
  const reopenMutation = useMutation({
    mutationFn: (id: number) => reopenTask(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
  const deleteTaskMutation = useMutation({
    mutationFn: (id: number) => deleteTask(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const createEventMutation = useCreateCalendarEvent({ date: dateKey });
  const deleteEventMutation = useDeleteCalendarEvent({ date: dateKey });
  const createNoteMutation = useCreateNote({ calendar_date: dateKey });
  const deleteNoteMutation = useDeleteNote({ calendar_date: dateKey });

  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");

  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventTime, setEventTime] = useState("09:00");
  const [eventKind, setEventKind] = useState<CalendarEventKind>("follow_up");

  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");

  const tasks = tasksQuery.data?.data ?? [];
  const events = eventsQuery.data ?? [];
  const notes = notesQuery.data ?? [];

  const submitTask = (e: FormEvent) => {
    e.preventDefault();
    const title = taskTitle.trim();
    if (!title) return;
    createTaskMutation.mutate(
      { title, due_at: `${dateKey}T12:00:00`, priority: taskPriority },
      {
        onSuccess: () => {
          setTaskTitle("");
          setTaskFormOpen(false);
        },
      }
    );
  };

  const submitEvent = (e: FormEvent) => {
    e.preventDefault();
    const title = eventTitle.trim();
    if (!title) return;
    const time = eventTime || "09:00";
    createEventMutation.mutate(
      { title, starts_at: `${dateKey}T${time}:00`, kind: eventKind },
      {
        onSuccess: () => {
          setEventTitle("");
          setEventFormOpen(false);
        },
      }
    );
  };

  const submitNote = (e: FormEvent) => {
    e.preventDefault();
    const body = noteBody.trim();
    if (!body) return;
    createNoteMutation.mutate(
      { calendar_date: dateKey, body },
      {
        onSuccess: () => {
          setNoteBody("");
          setNoteFormOpen(false);
        },
      }
    );
  };

  const inputClass =
    "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {/* Day header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Day Overview
          </p>
          <h2 className="truncate text-lg font-semibold text-text">
            {format(date, "EEEE, MMMM d")}
          </h2>
          <p className="text-xs text-muted">
            {format(date, "yyyy")}
            {isToday(date) ? " · Today" : ""}
          </p>
        </div>
        {!isToday(date) && (
          <button
            type="button"
            onClick={() => onSelectDate(new Date())}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-primary-soft/50 hover:text-text"
          >
            Jump to today
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
        {/* Tasks */}
        <section>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <CheckSquare className="h-4 w-4 text-primary" />
              Tasks
              <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-dark">
                {tasks.length}
              </span>
            </h3>
            {canManageTasks && (
              <button
                type="button"
                onClick={() => setTaskFormOpen((open) => !open)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary-soft/50"
              >
                <Plus className="h-3.5 w-3.5" />
                {taskFormOpen ? "Close" : "Add task"}
              </button>
            )}
          </div>

          {taskFormOpen && (
            <form onSubmit={submitTask} className="mt-2 space-y-2 rounded-xl border border-border bg-bg/60 p-3">
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Task title…"
                aria-label="Task title"
                className={inputClass}
              />
              <div className="flex gap-2">
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                  aria-label="Task priority"
                  className={cn(inputClass, "w-auto")}
                >
                  {(Object.keys(PRIORITY_DOT) as TaskPriority[]).map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!taskTitle.trim() || createTaskMutation.isPending}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {createTaskMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </button>
              </div>
            </form>
          )}

          <ul className="mt-2 space-y-0.5">
            {tasksQuery.isLoading && (
              <li className="flex items-center gap-2 px-2 py-2 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tasks…
              </li>
            )}
            {tasksQuery.isError && (
              <li className="px-2 py-2 text-center text-xs text-danger">Couldn&apos;t load tasks.</li>
            )}
            {!tasksQuery.isLoading && !tasksQuery.isError && tasks.length === 0 && (
              <li className="px-2 py-2 text-center text-xs text-muted">No tasks due this day.</li>
            )}
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg"
              >
                <button
                  type="button"
                  onClick={() =>
                    task.status === "done" ? reopenMutation.mutate(task.id) : completeMutation.mutate(task.id)
                  }
                  aria-label={task.status === "done" ? "Reopen task" : "Mark task complete"}
                  className="shrink-0 text-muted transition-colors hover:text-primary"
                >
                  {task.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </button>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    task.status === "done" ? "text-muted line-through" : "text-text"
                  )}
                  title={task.title}
                >
                  {task.title}
                </span>
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[task.priority])}
                  title={`Priority: ${task.priority}`}
                />
                {canManageTasks && (
                  <button
                    type="button"
                    onClick={() => deleteTaskMutation.mutate(task.id)}
                    aria-label="Delete task"
                    className="shrink-0 text-muted transition-colors hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Events */}
        <section>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <CalendarClock className="h-4 w-4 text-primary" />
              Events
              <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-dark">
                {events.length}
              </span>
            </h3>
            {canManageTasks && (
              <button
                type="button"
                onClick={() => setEventFormOpen((open) => !open)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary-soft/50"
              >
                <Plus className="h-3.5 w-3.5" />
                {eventFormOpen ? "Close" : "Add event"}
              </button>
            )}
          </div>

          {eventFormOpen && (
            <form onSubmit={submitEvent} className="mt-2 space-y-2 rounded-xl border border-border bg-bg/60 p-3">
              <input
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="Event title…"
                aria-label="Event title"
                className={inputClass}
              />
              <div className="flex flex-wrap gap-2">
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  aria-label="Event time"
                  className={cn(inputClass, "w-auto")}
                />
                <select
                  value={eventKind}
                  onChange={(e) => setEventKind(e.target.value as CalendarEventKind)}
                  aria-label="Event kind"
                  className={cn(inputClass, "w-auto")}
                >
                  {EVENT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {EVENT_KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!eventTitle.trim() || createEventMutation.isPending}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {createEventMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </button>
              </div>
            </form>
          )}

          <ul className="mt-2 space-y-0.5">
            {eventsQuery.isLoading && (
              <li className="flex items-center gap-2 px-2 py-2 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading events…
              </li>
            )}
            {eventsQuery.isError && (
              <li className="px-2 py-2 text-center text-xs text-danger">Couldn&apos;t load events.</li>
            )}
            {!eventsQuery.isLoading && !eventsQuery.isError && events.length === 0 && (
              <li className="px-2 py-2 text-center text-xs text-muted">No events this day.</li>
            )}
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg"
              >
                <span className="shrink-0 text-xs font-semibold text-primary">
                  {format(new Date(event.starts_at), "h:mm a")}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-text" title={event.title}>
                  {event.title}
                </span>
                <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-muted">
                  {EVENT_KIND_LABELS[event.kind] ?? event.kind}
                </span>
                {canManageTasks && (
                  <button
                    type="button"
                    onClick={() => deleteEventMutation.mutate(event.id)}
                    aria-label="Delete event"
                    className="shrink-0 text-muted transition-colors hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Notes */}
        <section>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <StickyNote className="h-4 w-4 text-primary" />
              Notes
              <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-dark">
                {notes.length}
              </span>
            </h3>
            {canCreateNotes && (
              <button
                type="button"
                onClick={() => setNoteFormOpen((open) => !open)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary-soft/50"
              >
                <Plus className="h-3.5 w-3.5" />
                {noteFormOpen ? "Close" : "Add note"}
              </button>
            )}
          </div>

          {noteFormOpen && (
            <form onSubmit={submitNote} className="mt-2 space-y-2 rounded-xl border border-border bg-bg/60 p-3">
              <textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Write a note for this day…"
                aria-label="Note body"
                rows={3}
                className={cn(inputClass, "resize-y")}
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!noteBody.trim() || createNoteMutation.isPending}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {createNoteMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </button>
              </div>
            </form>
          )}

          <ul className="mt-2 space-y-0.5">
            {notesQuery.isLoading && (
              <li className="flex items-center gap-2 px-2 py-2 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading notes…
              </li>
            )}
            {notesQuery.isError && (
              <li className="px-2 py-2 text-center text-xs text-danger">Couldn&apos;t load notes.</li>
            )}
            {!notesQuery.isLoading && !notesQuery.isError && notes.length === 0 && (
              <li className="px-2 py-2 text-center text-xs text-muted">No notes for this day.</li>
            )}
            {notes.map((note) => (
              <li
                key={note.id}
                className="group rounded-lg px-2 py-2 transition-colors hover:bg-bg"
              >
                <p className="whitespace-pre-wrap text-sm text-text">{note.body}</p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                  <span>{note.author?.name ?? "You"}</span>
                  <span aria-hidden="true">·</span>
                  <span>{format(new Date(note.created_at), "h:mm a")}</span>
                  {(canCreateNotes || canManageAnyNotes) &&
                    (note.author_id === Number(user?.id) || canManageAnyNotes) && (
                    <button
                      type="button"
                      onClick={() => deleteNoteMutation.mutate(note.id)}
                      aria-label="Delete note"
                      className="ml-auto text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
