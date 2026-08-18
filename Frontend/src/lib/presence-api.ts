import { apiClient, unwrap } from "@/lib/api-client";

export type PresenceStatus = "online" | "away" | "offline" | "busy";

export interface UserPresence {
  user_id: number;
  name: string;
  status: PresenceStatus;
  last_active_at: string;
}

export async function updatePresence(status: PresenceStatus): Promise<void> {
  await apiClient.post("/presence", { status });
}

export async function fetchPresence(): Promise<UserPresence[]> {
  return unwrap(apiClient.get("/presence"));
}
