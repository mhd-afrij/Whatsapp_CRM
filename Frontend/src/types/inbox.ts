export interface ConversationSummary {
  id: number;
  workspace_id: number;
  whatsapp_account_id: number | null;
  customer_id: number | null;
  assignee_id: number | null;
  contact_phone: string;
  contact_name: string | null;
  status: string;
  tags: string[] | null;
  unread_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  assignee?: { id: number; name: string; email: string } | null;
}

export interface DashboardStats {
  total_conversations: number;
  open_conversations: number;
  unread_messages: number;
  new_contacts: number;
  resolution_rate: number;
  avg_response_seconds: number | null;
  conversations_by_status: Array<{ status: string; count: number }>;
  conversations_overview: Array<{ date: string; incoming: number; outgoing: number }>;
  unassigned_conversations: Array<{
    id: number;
    contact_name: string | null;
    contact_phone: string;
    last_message_at: string | null;
  }>;
}

export interface ConversationMessage {
  id: number;
  workspace_id: number;
  conversation_id: number;
  direction: "in" | "out";
  body: string;
  wa_message_id: string | null;
  status: string;
  sent_at: string;
  created_at: string;
  updated_at: string;
}
