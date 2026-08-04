"use client";

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  createDeal,
  deleteDeal,
  fetchDeal,
  fetchDeals,
  markDealLost,
  markDealWon,
  moveDealStage,
  updateDeal,
  type DealFilters,
  type DealFormValues,
} from "@/lib/deals-api";
import { fetchPipelineBoard, type PipelineBoard } from "@/lib/pipelines-api";

export const dealsKey = (filters: DealFilters) => ["deals", filters] as const;
export const dealKey = (id: number) => ["deals", "detail", id] as const;
export const pipelineBoardKey = (pipelineId: number) => ["pipelines", "board", pipelineId] as const;

export function useDealList(filters: DealFilters) {
  return useQuery({
    queryKey: dealsKey(filters),
    queryFn: () => fetchDeals(filters),
    placeholderData: keepPreviousData,
  });
}

export function useDeal(id: number) {
  return useQuery({
    queryKey: dealKey(id),
    queryFn: () => fetchDeal(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function usePipelineBoard(pipelineId: number) {
  return useQuery({
    queryKey: pipelineBoardKey(pipelineId),
    queryFn: () => fetchPipelineBoard(pipelineId),
    enabled: Number.isFinite(pipelineId) && pipelineId > 0,
  });
}

export function useCreateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: DealFormValues) => createDeal(values),
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: pipelineBoardKey(deal.pipeline_id) });
    },
  });
}

export function useUpdateDeal(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: DealFormValues) => updateDeal(id, values),
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: dealKey(id) });
      queryClient.invalidateQueries({ queryKey: pipelineBoardKey(deal.pipeline_id) });
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

/**
 * Optimistic stage move: updates the board cache immediately (moves the deal
 * card between stage buckets and adjusts totals), rolling back to the
 * pre-mutation snapshot if the API call fails.
 */
export function useMoveDealStage(pipelineId: number) {
  const queryClient = useQueryClient();
  const boardKey = pipelineBoardKey(pipelineId);

  return useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: number; stageId: number }) =>
      moveDealStage(dealId, stageId),
    onMutate: async ({ dealId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: boardKey });
      const previous = queryClient.getQueryData<PipelineBoard>(boardKey);

      if (previous) {
        let movedDeal: PipelineBoard["stages"][number]["deals"][number] | undefined;
        const stagesWithoutDeal = previous.stages.map((stage) => {
          const found = stage.deals.find((d) => d.id === dealId);
          if (found) movedDeal = found;
          return {
            ...stage,
            deals: stage.deals.filter((d) => d.id !== dealId),
          };
        });

        const nextStages = stagesWithoutDeal.map((stage) => {
          if (stage.id !== stageId) {
            return {
              ...stage,
              deal_count: stage.deals.length,
              total_value: stage.deals.reduce((sum, d) => sum + Number(d.value_amount ?? 0), 0),
            };
          }
          const deals = movedDeal
            ? [{ ...movedDeal, pipeline_stage_id: stageId }, ...stage.deals]
            : stage.deals;
          return {
            ...stage,
            deals,
            deal_count: deals.length,
            total_value: deals.reduce((sum, d) => sum + Number(d.value_amount ?? 0), 0),
          };
        });

        queryClient.setQueryData<PipelineBoard>(boardKey, { ...previous, stages: nextStages });
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(boardKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: boardKey });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useMarkDealWon(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markDealWon(id),
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: dealKey(id) });
      queryClient.invalidateQueries({ queryKey: pipelineBoardKey(deal.pipeline_id) });
    },
  });
}

export function useMarkDealLost(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lostReason: string) => markDealLost(id, lostReason),
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: dealKey(id) });
      queryClient.invalidateQueries({ queryKey: pipelineBoardKey(deal.pipeline_id) });
    },
  });
}
