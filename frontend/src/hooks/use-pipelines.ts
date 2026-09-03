"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPipeline,
  createStage,
  deletePipeline,
  deleteStage,
  fetchPipeline,
  fetchPipelines,
  updatePipeline,
  updateStage,
  type PipelineFormValues,
  type PipelineStageFormValues,
} from "@/lib/pipelines-api";

export const pipelinesKey = ["pipelines"] as const;
export const pipelineKey = (id: number) => ["pipelines", "detail", id] as const;

export function usePipelineList() {
  return useQuery({ queryKey: pipelinesKey, queryFn: fetchPipelines });
}

export function usePipeline(id: number) {
  return useQuery({
    queryKey: pipelineKey(id),
    queryFn: () => fetchPipeline(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreatePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: PipelineFormValues) => createPipeline(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pipelinesKey }),
  });
}

export function useUpdatePipeline(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<PipelineFormValues>) => updatePipeline(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelinesKey });
      queryClient.invalidateQueries({ queryKey: pipelineKey(id) });
    },
  });
}

export function useDeletePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deletePipeline(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pipelinesKey }),
  });
}

export function useCreateStage(pipelineId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: PipelineStageFormValues) => createStage(pipelineId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelinesKey });
      queryClient.invalidateQueries({ queryKey: pipelineKey(pipelineId) });
    },
  });
}

export function useUpdateStage(pipelineId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, values }: { stageId: number; values: Partial<PipelineStageFormValues> }) =>
      updateStage(pipelineId, stageId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelinesKey });
      queryClient.invalidateQueries({ queryKey: pipelineKey(pipelineId) });
    },
  });
}

export function useDeleteStage(pipelineId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stageId: number) => deleteStage(pipelineId, stageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelinesKey });
      queryClient.invalidateQueries({ queryKey: pipelineKey(pipelineId) });
    },
  });
}
