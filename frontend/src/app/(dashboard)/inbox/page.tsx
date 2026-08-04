import { MessageSquare } from "lucide-react";

export default function InboxIndexPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <MessageSquare className="h-10 w-10 text-muted" />
      <p className="text-base font-medium text-text">Select a conversation</p>
      <p className="max-w-sm text-sm text-muted">
        Choose a conversation from the list on the left to view and reply to messages.
      </p>
    </div>
  );
}
