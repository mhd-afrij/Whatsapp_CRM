import { Bell, CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

const NOTIFICATIONS = [
  { id: 1, title: "New conversation assigned to you", time: "5m ago", read: false },
  { id: 2, title: "Task \"Follow up on Chen Labs demo\" is due tomorrow", time: "1h ago", read: false },
  { id: 3, title: "Marcus Chen mentioned you in a note", time: "3h ago", read: true },
  { id: 4, title: "WhatsApp session reconnected", time: "Yesterday", read: true },
];

export default function NotificationsPage() {
  return (
    <div>
      <PageHeader
        title="Notifications"
        actions={
          <button className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover">
            <CheckCheck size={15} /> Mark all read
          </button>
        }
      />

      <div className="space-y-1">
        {NOTIFICATIONS.map((n) => (
          <div
            key={n.id}
            className={`flex items-start gap-3 rounded-[10px] px-4 py-3 border ${
              n.read ? "border-border-muted bg-surface" : "border-primary/30 bg-primary-soft"
            }`}
          >
            <Bell size={16} className={n.read ? "text-text-muted" : "text-primary"} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${n.read ? "text-text-secondary" : "text-text-primary font-medium"}`}>
                {n.title}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{n.time}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-text-muted mt-3">
        Static preview — the notifications API and realtime delivery land in Phase 6.
      </p>
    </div>
  );
}
