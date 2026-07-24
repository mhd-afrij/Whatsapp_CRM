"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Plus, Square } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { authFetch } from "@/stores/auth-store";
import type { TaskItem } from "@/types/admin";

const PRIORITY_TONE = { low: "neutral", normal: "info", high: "warning", urgent: "danger" } as const;

export default function TasksPage() {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({
    queryKey: ["crm", "tasks"],
    queryFn: () => authFetch<TaskItem[]>("/crm/tasks"),
  });

  const updateTask = useMutation({
    mutationFn: (payload: { id: number; status: TaskItem["status"] }) =>
      authFetch<TaskItem>(`/crm/tasks/${payload.id}`, { method: "PATCH", body: { status: payload.status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "tasks"] }),
  });

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Live follow-ups and reminders from the CRM API."
        actions={<button className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"><Plus size={15} /> New task</button>}
      />

      <div className="space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-3 rounded-[10px] border border-border bg-surface px-4 py-3">
            <button
              className="text-text-muted hover:text-primary"
              onClick={() => updateTask.mutate({ id: task.id, status: task.status === "completed" ? "open" : "completed" })}
              aria-label="Toggle complete"
            >
              {task.status === "completed" ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${task.status === "completed" ? "line-through text-text-muted" : "text-text-primary"}`}>{task.title}</p>
              <p className="text-xs text-text-muted">{task.due_at ? new Date(task.due_at).toLocaleString() : "No due date"}</p>
            </div>
            <StatusBadge label={task.priority} tone={PRIORITY_TONE[task.priority]} />
          </div>
        ))}
      </div>
    </div>
  );
}
