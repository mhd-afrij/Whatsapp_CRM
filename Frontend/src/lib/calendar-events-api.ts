import { apiClient, unwrap } from "@/lib/api-client";

export type CalendarEventKind = "follow_up" | "call" | "meeting" | "reminder" | "other";

export interface CalendarEvent {
  id: number;
  workspace_id: number;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  kind: CalendarEventKind;
  created_at: string;
  updated_at: string;
}

export interface CalendarEventFilters {
  /** Single day as YYYY-MM-DD. */
  date?: string;
  /** Inclusive ISO datetime range start. */
  start?: string;
  /** Inclusive ISO datetime range end. */
  end?: string;
}

export interface CalendarEventFormValues {
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  kind?: CalendarEventKind;
}

export async function fetchCalendarEvents(
  filters: CalendarEventFilters = {}
): Promise<CalendarEvent[]> {
  return unwrap(apiClient.get("/calendar-events", { params: filters }));
}

export async function createCalendarEvent(values: CalendarEventFormValues): Promise<CalendarEvent> {
  return unwrap(apiClient.post("/calendar-events", values));
}

export async function updateCalendarEvent(
  id: number,
  values: Partial<CalendarEventFormValues>
): Promise<CalendarEvent> {
  return unwrap(apiClient.patch(`/calendar-events/${id}`, values));
}

export async function deleteCalendarEvent(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/calendar-events/${id}`));
}
