"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  fetchWebhookEndpoints,
  rotateWebhookSecret,
  testWebhookEndpoint,
  updateWebhookEndpoint,
  type WebhookEndpointFormValues,
} from "@/lib/webhooks-api";

export const webhookEndpointsKey = ["webhook-endpoints"] as const;

export function useWebhookEndpoints() {
  return useQuery({
    queryKey: webhookEndpointsKey,
    queryFn: fetchWebhookEndpoints,
  });
}

export function useCreateWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: WebhookEndpointFormValues) => createWebhookEndpoint(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: webhookEndpointsKey }),
  });
}

export function useUpdateWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<WebhookEndpointFormValues> }) =>
      updateWebhookEndpoint(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: webhookEndpointsKey }),
  });
}

export function useDeleteWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteWebhookEndpoint(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: webhookEndpointsKey }),
  });
}

export function useRotateWebhookSecret() {
  return useMutation({
    mutationFn: (id: number) => rotateWebhookSecret(id),
  });
}

export function useTestWebhookEndpoint() {
  return useMutation({
    mutationFn: ({ id, event }: { id: number; event: string }) => testWebhookEndpoint(id, event),
  });
}
