import { apiClient, unwrap } from "@/lib/api-client";
import type { UserSummary } from "@/lib/conversations-api";

export interface NoteMention {
  id: number;
  mentioned_user_id: number;
  mentionedUser?: UserSummary | null;
}

export interface InternalNote {
  id: number;
  workspace_id: number;
  conversation_id: number | null;
  contact_id: number | null;
  deal_id: number | null;
  /** Calendar day the note is pinned to (YYYY-MM-DD), when not tied to an entity. */
  calendar_date: string | null;
  author_id: number;
  body: string;
  is_private: boolean;
  author: UserSummary | null;
  mentions: NoteMention[];
  created_at: string;
  updated_at: string;
}

export interface NoteFilters {
  conversation_id?: number;
  contact_id?: number;
  deal_id?: number;
  calendar_date?: string;
}

export interface NoteFormValues {
  conversation_id?: number | null;
  contact_id?: number | null;
  deal_id?: number | null;
  calendar_date?: string | null;
  body: string;
  is_private?: boolean;
}

export async function fetchNotes(filters: NoteFilters): Promise<InternalNote[]> {
  return unwrap(apiClient.get("/notes", { params: filters }));
}

export async function createNote(values: NoteFormValues): Promise<InternalNote> {
  return unwrap(apiClient.post("/notes", values));
}

export async function updateNote(id: number, body: string): Promise<InternalNote> {
  return unwrap(apiClient.patch(`/notes/${id}`, { body }));
}

export async function deleteNote(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/notes/${id}`));
}
