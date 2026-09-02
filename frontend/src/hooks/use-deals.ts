"use client";

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  createDeal,
  deleteDeal,
  fetchDeal,
  fetchDealPipelines,
  fetchDeals,
  markDealLost,
  markDealWon,
  moveDealStage,
  updateDeal,
  type DealFilters,
  type DealFormValues,
} from "@/lib/deals-api";

export const dealsKey = (filters: DealFilters) => ["deals", filters] as const;
export const dealKey = (id: number) => ["deals", "detail", id] as const;
export const dealPipelinesKey = ["deals", "pipelines"] as const;

export function useDealPipelines() {
  return useQuery({
    queryKey: dealPipelinesKey,
    queryFn: () => fetchDealPipelines(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDealList(filters: DealFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: dealsKey(filters),
    queryFn: () => fetchDeals(filters),
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

export function useDeal(id: number) {
  return useQuery({
    queryKey: dealKey(id),
    queryFn: () => fetchDeal(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: DealFormValues) => createDeal(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useUpdateDeal(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: DealFormValues) => updateDeal(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: dealKey(id) });
    },
  });
}

export function useDeleteDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteDeal(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
  });
}

export function useMoveDealStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: number; stageId: number }) =>
      moveDealStage(dealId, stageId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useMarkDealWon(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markDealWon(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: dealKey(id) });
    },
  });
}

export function useMarkDealLost(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lostReason: string) => markDealLost(id, lostReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: dealKey(id) });
    },
  });
}
