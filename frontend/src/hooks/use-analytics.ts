"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchAgentPerformance,
  fetchConversationVolume,
  fetchDashboardSummary,
  fetchLeadFunnel,
  fetchPipelineStageDistribution,
  fetchResponseTimeTrend,
  fetchTaskCompletionRate,
  fetchWonVsLost,
  type AnalyticsFilters,
} from "@/lib/analytics-api";

export function useDashboardSummary(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ["dashboard", "summary", filters],
    queryFn: () => fetchDashboardSummary(filters),
    staleTime: 15_000,
  });
}

export function useConversationVolume(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ["analytics", "conversation-volume", filters],
    queryFn: () => fetchConversationVolume(filters),
    staleTime: 15_000,
  });
}

export function useResponseTimeTrend(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ["analytics", "response-time-trend", filters],
    queryFn: () => fetchResponseTimeTrend(filters),
    staleTime: 15_000,
  });
}

export function useLeadFunnel(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ["analytics", "lead-funnel", filters],
    queryFn: () => fetchLeadFunnel(filters),
    staleTime: 15_000,
  });
}

export function usePipelineStageDistribution(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ["analytics", "pipeline-stage-distribution", filters],
    queryFn: () => fetchPipelineStageDistribution(filters),
    staleTime: 15_000,
  });
}

export function useWonVsLost(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ["analytics", "won-vs-lost", filters],
    queryFn: () => fetchWonVsLost(filters),
    staleTime: 15_000,
  });
}

export function useAgentPerformance(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ["analytics", "agent-performance", filters],
    queryFn: () => fetchAgentPerformance(filters),
    staleTime: 15_000,
  });
}

export function useTaskCompletionRate(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ["analytics", "task-completion-rate", filters],
    queryFn: () => fetchTaskCompletionRate(filters),
    staleTime: 15_000,
  });
}
