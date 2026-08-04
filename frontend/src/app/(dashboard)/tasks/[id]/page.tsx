"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import {
  useTask,
  useUpdateTask,
  useDeleteTask,
  useCompleteTask,
  useReopenTask,
  useTaskComments,
  useCreateTaskComment,
} from "@/hooks/use-tasks";
import { useUsers } from "@/hooks/use-users";
import { ApiError } from "@/lib/api-client";
import type { TaskPriority } from "@/lib/tasks-api";

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-6 animate-pulse rounded bg-border/60" />
      ))}
    </div>
  );
}

function TaskDetail({ id }: { id: number }) {
  const router = useRouter();
  const { data: task, isLoading, isError } = useTask(id);
  const { data: users } = useUsers();
  const updateMutation = useUpdateTask(id);
  const deleteMutation = useDeleteTask();
  const completeMutation = useCompleteTask(id);
  const reopenMutation = useReopenTask(id);
  const { data: comments, isLoading: commentsLoading } = useTaskComments(id);
  const createComment = useCreateTaskComment(id);

  const [commentBody, setCommentBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <DetailSkeleton />;
  if (isError || !task) {
    return <p className="text-sm text-danger">Unable to load this task. It may not exist or you may lack access.</p>;
  }

  const onAssigneeChange = async (value: string) => {
    setError(null);
    try {
      await updateMutation.mutateAsync({ assignee_id: value ? Number(value) : null });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update assignee.");
    }
  };

  const onPriorityChange = async (value: TaskPriority) => {
    try {
      await updateMutation.mutateAsync({ priority: value });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update priority.");
    }
  };

  const onDelete = async () => {
    if (!confirm("Delete this task?")) return;
    await deleteMutation.mutateAsync(task.id);
    router.push("/tasks");
  };

  const onAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    try {
      await createComment.mutateAsync(commentBody.trim());
      setCommentBody("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to add comment.");
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/tasks" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back to tasks
      </Link>

      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-text">{task.title}</h1>
            <p className="mt-1 text-sm text-muted">{task.description || "No description"}</p>
          </div>
          <div className="flex gap-2">
            {task.status !== "done" ? (
              <button
                type="button"
                onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isPending}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark"
              >
                Mark complete
              </button>
            ) : (
              <button
                type="button"
                onClick={() => reopenMutation.mutate()}
                disabled={reopenMutation.isPending}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-primary-soft/40"
              >
                Reopen
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10"
            >
              Delete
            </button>
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-muted">Status</p>
            <p className="text-sm capitalize text-text">{task.status.replace("_", " ")}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Priority</p>
            <select
              value={task.priority}
              onChange={(e) => onPriorityChange(e.target.value as TaskPriority)}
              className="mt-1 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
            >
              {(["low", "medium", "high", "urgent"] as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Due</p>
            <p className="text-sm text-text">{task.due_at ? new Date(task.due_at).toLocaleString() : "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Assignee</p>
            <select
              value={task.assignee_id ?? ""}
              onChange={(e) => onAssigneeChange(e.target.value)}
              className="mt-1 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
            >
              <option value="">Unassigned</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Created by</p>
            <p className="text-sm text-text">{task.creator?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted">Linked to</p>
            <p className="text-sm text-text">
              {task.lead && `Lead #${task.lead.id}`}
              {task.deal && `Deal #${task.deal.id}`}
              {task.contact && `Contact #${task.contact.id}`}
              {task.conversation && `Conversation #${task.conversation.id}`}
              {!task.lead && !task.deal && !task.contact && !task.conversation && "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text">Comments</h2>
        {commentsLoading && <p className="text-sm text-muted">Loading comments…</p>}
        <div className="space-y-3">
          {comments?.map((comment) => (
            <div key={comment.id} className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-text">{comment.author?.name ?? "Unknown"}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-text">{comment.body}</p>
              <p className="mt-1 text-[11px] text-muted">{new Date(comment.created_at).toLocaleString()}</p>
            </div>
          ))}
          {comments && comments.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
        </div>

        <form onSubmit={onAddComment} className="mt-4 flex gap-2">
          <input
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Add a comment… use @name to mention someone"
            className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
          />
          <button
            type="submit"
            disabled={createComment.isPending || !commentBody.trim()}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            Post
          </button>
        </form>
      </div>
    </div>
  );
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  return (
    <RequirePermission permission="tasks.manage">
      <TaskDetail id={id} />
    </RequirePermission>
  );
}
