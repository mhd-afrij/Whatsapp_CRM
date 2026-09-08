"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  completeCalendarEvent,
  createCalendarEvent,
  deleteCalendarEvent,
  reopenCalendarEvent,
  fetchCalendarEvents,
  updateCalendarEvent,
  type CalendarEventFilters,
  type CalendarEventFormValues,
} from "@/lib/calendar-events-api";

export const calendarEventsKey = (filters: CalendarEventFilters) =>
  ["calendar-events", filters] as const;

export function useCalendarEvents(filters: CalendarEventFilters, enabled = true) {
  return useQuery({
    queryKey: calendarEventsKey(filters),
    queryFn: () => fetchCalendarEvents(filters),
    enabled: enabled && Boolean(filters.date || filters.start || filters.end),
  });
}

export function useCreateCalendarEvent(filters: CalendarEventFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: CalendarEventFormValues) => createCalendarEvent(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
  });
}

export function useUpdateCalendarEvent(filters: CalendarEventFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<CalendarEventFormValues> }) =>
      updateCalendarEvent(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
  });
}


export function useCompleteCalendarEvent(filters: CalendarEventFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: completeCalendarEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
  });
}

export function useReopenCalendarEvent(filters: CalendarEventFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reopenCalendarEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
  });
}
export function useDeleteCalendarEvent(filters: CalendarEventFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCalendarEvent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
  });
}
