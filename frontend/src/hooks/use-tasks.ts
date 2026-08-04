"use client";

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  completeTask,
  createTask,
  createTaskComment,
  deleteTask,
  fetchTask,
  fetchTaskComments,
  fetchTasks,
  reopenTask,
  updateTask,
  type TaskFilters,
  type TaskFormValues,
  type TaskUpdateValues,
} from "@/lib/tasks-api";

export const tasksKey = (filters: TaskFilters) => ["tasks", filters] as const;
export const taskKey = (id: number) => ["tasks", "detail", id] as const;
export const taskCommentsKey = (id: number) => ["tasks", "comments", id] as const;

export function useTaskList(filters: TaskFilters) {
  return useQuery({
    queryKey: tasksKey(filters),
    queryFn: () => fetchTasks(filters),
    placeholderData: keepPreviousData,
  });
}

export function useTask(id: number) {
  return useQuery({
    queryKey: taskKey(id),
    queryFn: () => fetchTask(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: TaskFormValues) => createTask(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useUpdateTask(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: TaskUpdateValues) => updateTask(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: taskKey(id) });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTask(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useCompleteTask(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => completeTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: taskKey(id) });
    },
  });
}

export function useReopenTask(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => reopenTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: taskKey(id) });
    },
  });
}

export function useTaskComments(taskId: number) {
  return useQuery({
    queryKey: taskCommentsKey(taskId),
    queryFn: () => fetchTaskComments(taskId),
    enabled: Number.isFinite(taskId) && taskId > 0,
  });
}

export function useCreateTaskComment(taskId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => createTaskComment(taskId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskCommentsKey(taskId) }),
  });
}
