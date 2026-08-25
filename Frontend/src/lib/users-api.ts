import { apiClient, unwrap } from "@/lib/api-client";
import type { UserSummary } from "@/lib/conversations-api";

export async function fetchUsers(): Promise<UserSummary[]> {
  return unwrap(apiClient.get("/users"));
}
