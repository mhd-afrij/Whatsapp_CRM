import { apiClient, unwrap } from "@/lib/api-client";

export interface DayConfig {
  enabled: boolean;
  open: string;
  close: string;
}

export interface BusinessHoursConfig {
  timezone: string;
  days: {
    monday: DayConfig;
    tuesday: DayConfig;
    wednesday: DayConfig;
    thursday: DayConfig;
    friday: DayConfig;
    saturday: DayConfig;
    sunday: DayConfig;
  };
}

export interface BusinessHoursStatus {
  is_within_business_hours: boolean;
  next_opening_at: string | null;
}

export async function fetchBusinessHours(): Promise<BusinessHoursConfig> {
  return unwrap(apiClient.get("/workspace/business-hours"));
}

export async function updateBusinessHours(
  config: BusinessHoursConfig
): Promise<BusinessHoursConfig> {
  return unwrap(apiClient.patch("/workspace/business-hours", config));
}

export async function fetchBusinessHoursStatus(): Promise<BusinessHoursStatus> {
  return unwrap(apiClient.get("/workspace/business-hours/status"));
}
