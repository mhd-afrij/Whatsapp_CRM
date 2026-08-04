"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAuditLog, fetchAuditLogs, type AuditLogListParams } from "@/lib/audit-log-api";

export function useAuditLogs(params: AuditLogListParams) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => fetchAuditLogs(params),
  });
}

export function useAuditLog(id: number | null) {
  return useQuery({
    queryKey: ["audit-log", id],
    queryFn: () => fetchAuditLog(id as number),
    enabled: id !== null,
  });
}
