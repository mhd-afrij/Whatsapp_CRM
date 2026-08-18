import { apiClient, unwrap } from "@/lib/api-client";
import type { Paginated, UserSummary } from "@/lib/conversations-api";

export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface TaskLinkSummary {
  id: number;
  title?: string;
  full_name?: string | null;
  name?: string | null;
}

export interface Task {
  id: number;
  workspace_id: number;
  title: string;
  description: string | null;
  assignee_id: number | null;
  created_by: number | null;
  contact_id: number | null;
  lead_id: number | null;
  deal_id: number | null;
  conversation_id: number | null;
  due_at: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completed_at: string | null;
  assignee: UserSummary | null;
  creator: UserSummary | null;
  contact: TaskLinkSummary | null;
  lead: TaskLinkSummary | null;
  deal: TaskLinkSummary | null;
  conversation: TaskLinkSummary | null;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: number;
  task_id: number;
  author_id: number;
  body: string;
  author: UserSummary | null;
  created_at: string;
  updated_at: string;
}

export interface TaskFilters {
  team?: boolean;
  mine?: boolean;
  overdue?: boolean;
  upcoming?: boolean;
  completed?: boolean;
  status?: TaskStatus;
  priority?: TaskPriority;
  /** Due on a specific day (YYYY-MM-DD). */
  due_date?: string;
  contact_id?: number;
  lead_id?: number;
  deal_id?: number;
  conversation_id?: number;
  page?: number;
  per_page?: number;
}

export interface TaskFormValues {
  title: string;
  description?: string | null;
  assignee_id?: number | null;
  contact_id?: number | null;
  lead_id?: number | null;
  deal_id?: number | null;
  conversation_id?: number | null;
  due_at?: string | null;
  priority?: TaskPriority;
  reminder_at?: string | null;
}

export interface TaskUpdateValues {
  title?: string;
  description?: string | null;
  assignee_id?: number | null;
  contact_id?: number | null;
  lead_id?: number | null;
  deal_id?: number | null;
  conversation_id?: number | null;
  due_at?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
}

interface PaginatedApiResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  meta?: Paginated<T>["meta"] | null;
}

async function unwrapPaginated<T>(
  promise: Promise<{ data: PaginatedApiResponse<T> }>
): Promise<Paginated<T>> {
  const { data: body } = await promise;
  if (!body.success) {
    throw new Error(body.message ?? "Request failed");
  }
  return { data: body.data, meta: body.meta ?? { per_page: 0, has_more: false } };
}

export async function fetchTasks(filters: TaskFilters): Promise<Paginated<Task>> {
  return unwrapPaginated<Task>(apiClient.get("/tasks", { params: filters }));
}

export async function fetchTask(id: number): Promise<Task> {
  return unwrap(apiClient.get(`/tasks/${id}`));
}

export async function createTask(values: TaskFormValues): Promise<Task> {
  return unwrap(apiClient.post("/tasks", values));
}

export async function updateTask(id: number, values: TaskUpdateValues): Promise<Task> {
  return unwrap(apiClient.patch(`/tasks/${id}`, values));
}

export async function deleteTask(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/tasks/${id}`));
}

export async function completeTask(id: number): Promise<Task> {
  return unwrap(apiClient.post(`/tasks/${id}/complete`));
}

export async function reopenTask(id: number): Promise<Task> {
  return unwrap(apiClient.post(`/tasks/${id}/reopen`));
}

export async function fetchTaskComments(taskId: number): Promise<TaskComment[]> {
  return unwrap(apiClient.get(`/tasks/${taskId}/comments`));
}

export async function createTaskComment(taskId: number, body: string): Promise<TaskComment> {
  return unwrap(apiClient.post(`/tasks/${taskId}/comments`, { body }));
}
