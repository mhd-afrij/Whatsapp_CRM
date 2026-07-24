"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/PageHeader";
import { authFetch } from "@/stores/auth-store";
import type { CalendarEvent } from "@/types/admin";

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const eventsQuery = useQuery({
    queryKey: ["crm", "calendar"],
    queryFn: () => authFetch<CalendarEvent[]>("/crm/calendar"),
  });

  const createEvent = useMutation({
    mutationFn: (payload: { title: string; starts_at: string; kind: string }) =>
      authFetch<CalendarEvent>("/crm/calendar", { method: "POST", body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "calendar"] }),
  });

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" description="Live follow-up schedule sourced from the CRM API." />

      <form
        className="grid gap-3 rounded-[10px] border border-border bg-surface p-4 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          createEvent.mutate({
            title: String(data.get("title") || ""),
            starts_at: String(data.get("starts_at") || ""),
            kind: String(data.get("kind") || "follow_up"),
          });
          form.reset();
        }}
      >
        <input name="title" placeholder="Event title" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="starts_at" type="datetime-local" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <select name="kind" className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          <option value="follow_up">follow_up</option>
          <option value="demo">demo</option>
          <option value="review">review</option>
        </select>
        <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Add event</button>
      </form>

      <div className="space-y-2">
        {events.map((event) => (
          <div key={event.id} className="rounded-[10px] border border-border bg-surface p-4">
            <p className="font-medium text-text-primary">{event.title}</p>
            <p className="text-xs text-text-muted">
              {new Date(event.starts_at).toLocaleString()} {event.location ? `· ${event.location}` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
