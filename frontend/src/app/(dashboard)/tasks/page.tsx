"use client";

import { useState } from "react";
import Link from "next/link";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { useTaskList, useCreateTask } from "@/hooks/use-tasks";
import { useUsers } from "@/hooks/use-users";
import { ApiError } from "@/lib/api-client";
import type { TaskFilters, TaskPriority, TaskStatus } from "@/lib/tasks-api";
import { ErrorState } from "@/components/ui/error-state";

const PRIORITY_OPTIONS: TaskPriority[] = ["low", "medium", "high", "urgent"];
const STATUS_OPTIONS: TaskStatus[] = ["open", "in_progress", "done", "cancelled"];

type ViewFilter = "mine" | "team" | "overdue" | "upcoming" | "completed";

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-border/60" />
      ))}
    </div>
  );
}

function priorityBadgeClass(priority: TaskPriority) {
  switch (priority) {
    case "urgent":
      return "bg-danger/10 text-danger";
    case "high":
      return "bg-amber-100 text-amber-700";
    case "medium":
      return "bg-primary-soft text-primary-dark";
    default:
      return "bg-border/60 text-muted";
  }
}

function CreateTaskForm({ onClose }: { onClose: () => void }) {
  const { data: users } = useUsers();
  const createMutation = useCreateTask();
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createMutation.mutateAsync({
        title,
        due_at: dueAt || null,
        priority,
        assignee_id: assigneeId ? Number(assigneeId) : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create task.");
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text sm:col-span-2"
        />
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text sm:col-span-2"
        >
          <option value="">Assign to me</option>
          {users?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:bg-primary-soft/40"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={createMutation.isPending || !title.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating…" : "Create task"}
        </button>
      </div>
    </form>
  );
}

function TasksView() {
  const [view, setView] = useState<ViewFilter>("mine");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const canViewTeam = usePermission("tasks.view_team");

  const filters: TaskFilters = {
    team: view === "team" ? true : undefined,
    overdue: view === "overdue" ? true : undefined,
    upcoming: view === "upcoming" ? true : undefined,
    completed: view === "completed" ? true : undefined,
    status: status || undefined,
    priority: priority || undefined,
    page,
    per_page: 20,
  };

  const { data, isLoading, isError, refetch } = useTaskList(filters);
  const tasks = data?.data ?? [];
  const meta = data?.meta;

  const views: { key: ViewFilter; label: string }[] = [
    { key: "mine", label: "My tasks" },
    ...(canViewTeam ? [{ key: "team" as ViewFilter, label: "Team" }] : []),
    { key: "overdue", label: "Overdue" },
    { key: "upcoming", label: "Upcoming" },
    { key: "completed", label: "Completed" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">Tasks</h1>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
        >
          {showCreate ? "Close" : "New task"}
        </button>
      </div>

      {showCreate && <CreateTaskForm onClose={() => setShowCreate(false)} />}

      <div className="flex flex-wrap gap-2">
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => {
              setView(v.key);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              view === v.key ? "bg-primary text-white" : "border border-border text-muted hover:bg-primary-soft/40"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as TaskStatus | "");
            setPage(1);
          }}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value as TaskPriority | "");
            setPage(1);
          }}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
        >
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        {isLoading && <TableSkeleton />}
        {isError && (
          <ErrorState message="Unable to load tasks. Try again shortly." onRetry={() => refetch()} />
        )}
        {!isLoading && !isError && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <p className="text-sm font-medium text-text">No tasks here</p>
          </div>
        )}
        {!isLoading && !isError && tasks.length > 0 && (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Assignee</th>
                <th className="px-4 py-3 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b border-border last:border-0 hover:bg-primary-soft/30">
                  <td className="px-4 py-3">
                    <Link href={`/tasks/${task.id}`} className="font-medium text-primary hover:underline">
                      {task.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(task.priority)}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted">{task.status.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-muted">{task.assignee?.name || "Unassigned"}</td>
                  <td className="px-4 py-3 text-muted">
                    {task.due_at ? new Date(task.due_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {meta && meta.last_page && meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Page {meta.page} of {meta.last_page} ({meta.total} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!!meta.last_page && page >= meta.last_page}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <RequirePermission permission="tasks.manage">
      <TasksView />
    </RequirePermission>
  );
}
