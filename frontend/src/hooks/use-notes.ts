"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createNote,
  deleteNote,
  fetchNotes,
  updateNote,
  type NoteFilters,
  type NoteFormValues,
} from "@/lib/notes-api";

export const notesKey = (filters: NoteFilters) => ["notes", filters] as const;

export function useNoteList(filters: NoteFilters) {
  return useQuery({
    queryKey: notesKey(filters),
    queryFn: () => fetchNotes(filters),
    enabled: Boolean(
      filters.conversation_id || filters.contact_id || filters.deal_id || filters.calendar_date
    ),
  });
}

export function useCreateNote(filters: NoteFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: NoteFormValues) => createNote(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notesKey(filters) }),
  });
}

export function useUpdateNote(filters: NoteFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => updateNote(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notesKey(filters) }),
  });
}

export function useDeleteNote(filters: NoteFilters) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteNote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notesKey(filters) }),
  });
}
