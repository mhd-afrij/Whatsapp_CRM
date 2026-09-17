"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRoutingRule,
  deleteRoutingRule,
  fetchRoutingRules,
  updateRoutingRule,
  type RoutingRuleFormValues,
} from "@/lib/routing-rules-api";

export const routingRulesKey = ["routing-rules"] as const;

export function useRoutingRules() {
  return useQuery({
    queryKey: routingRulesKey,
    queryFn: fetchRoutingRules,
  });
}

export function useCreateRoutingRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: RoutingRuleFormValues) => createRoutingRule(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: routingRulesKey }),
  });
}

export function useUpdateRoutingRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<RoutingRuleFormValues> }) =>
      updateRoutingRule(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: routingRulesKey }),
  });
}

export function useDeleteRoutingRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteRoutingRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: routingRulesKey }),
  });
}