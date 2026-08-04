"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachLabelTo,
  createLabel,
  deleteLabel,
  detachLabelFrom,
  fetchLabels,
  updateLabel,
  type LabelEntityType,
  type LabelFormValues,
} from "@/lib/labels-api";

export const labelsKey = ["labels"] as const;

export function useLabelList() {
  return useQuery({ queryKey: labelsKey, queryFn: fetchLabels });
}

export function useCreateLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: LabelFormValues) => createLabel(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: labelsKey }),
  });
}

export function useUpdateLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<LabelFormValues> }) =>
      updateLabel(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: labelsKey }),
  });
}

export function useDeleteLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteLabel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelsKey });
      // A deleted label cascades off every record it was attached to server-side;
      // the simplest correct client-side response is to invalidate every list/detail
      // query that might render label badges.
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

/**
 * Attach/detach controls for a single entity (contact/lead/deal/conversation) instance.
 * Invalidates that entity's list + detail caches so label badges refresh immediately.
 */
export function useEntityLabels(entity: LabelEntityType, entityId: number) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [entity] });
  };

  const attach = useMutation({
    mutationFn: (labelId: number) => attachLabelTo(entity, entityId, labelId),
    onSuccess: invalidate,
  });

  const detach = useMutation({
    mutationFn: (labelId: number) => detachLabelFrom(entity, entityId, labelId),
    onSuccess: invalidate,
  });

  return { attach, detach };
}
