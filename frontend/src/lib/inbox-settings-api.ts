import { apiClient, unwrap } from "@/lib/api-client";

export type InboxPriority = "low" | "normal" | "high" | "urgent";
export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface DayPeriod {
  start: string;
  end: string;
}

export interface DaySchedule {
  enabled: boolean;
  periods: DayPeriod[];
}

export interface InboxHoliday {
  date: string;
  label: string;
}

export interface InboxSettings {
  general: {
    default_priority: InboxPriority;
    show_customer_profile: boolean;
    enable_internal_notes: boolean;
    allow_file_attachments: boolean;
    allow_reassignment: boolean;
    allow_closing: boolean;
    auto_reopen_on_reply: boolean;
    show_typing_status: boolean;
    read_receipts: boolean;
  };
  routing: {
    enabled: boolean;
    strategy: "round_robin" | "least_loaded" | "ticket_rotation";
    team_id: number | null;
    max_active_per_agent: number;
    when_limit_reached: "next_available" | "queue";
    fallback: "round_robin" | "least_loaded" | "team_leader";
    fallback_team_id: number | null;
    fallback_user_id: number | null;
  };
  sla: {
    enabled: boolean;
    first_response_minutes: number;
    resolution_hours: number;
    priorities: Record<InboxPriority, number>;
    pause_outside_hours: boolean;
    pause_waiting_customer: boolean;
    notify_before_minutes: number;
    alert_assigned_agent: boolean;
    alert_team_manager: boolean;
    alert_admin: boolean;
  };
  working_hours: {
    timezone: string;
    days: Record<WeekdayKey, DaySchedule>;
    holidays: InboxHoliday[];
    after_hours: "queue" | "assign" | "auto_reply";
    auto_reply_message: string;
  };
}

export async function fetchInboxSettings(): Promise<{ settings: InboxSettings }> {
  return unwrap(apiClient.get("/settings/inbox"));
}

export async function updateInboxSettings(
  values: Partial<InboxSettings>
): Promise<{ settings: InboxSettings }> {
  return unwrap(apiClient.patch("/settings/inbox", values));
}