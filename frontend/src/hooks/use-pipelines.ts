"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPipelines, type Pipeline } from "@/lib/pipelines-api";

const pipelinesKey = ["pipelines"] as const;

export function usePipelines() {
  return useQuery({
    queryKey: pipelinesKey,
    queryFn: fetchPipelines,
    staleTime: 5 * 60 * 1000,
  });
}

export type { Pipeline };
