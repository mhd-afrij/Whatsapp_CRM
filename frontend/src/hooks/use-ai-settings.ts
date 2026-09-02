"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

interface AiSettings {
  provider: "openai" | "anthropic" | null;
  model: string | null;
  business_context: string | null;
  enabled: boolean;
  has_api_key: boolean;
}

export function useAiSettings() {
  return useQuery({
    queryKey: ["ai-settings"],
    queryFn: async () => {
      const response = await apiClient.get<{ data: AiSettings }>("/ai-assistant/settings");
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
