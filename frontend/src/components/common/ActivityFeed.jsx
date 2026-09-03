import { formatRelativeTime } from "../../utils/formatDate.js";

const ACTION_LABELS = {
  "auth.login": "logged in",
  "auth.logout": "logged out",
  "auth.password_reset": "reset password",
  "user.created": "created a user",
  "user.updated": "updated a user",
  "user.deleted": "deleted a user",
  "user.status_changed": "changed user status",
  "user.password_reset": "reset user password",
  "role.created": "created a role",
  "role.updated": "updated a role",
  "role.deleted": "deleted a role",
  "role.permissions_synced": "updated role permissions",
  "lead.created": "created a lead",
  "lead.updated": "updated a lead",
  "lead.deleted": "deleted a lead",
  "conversation.assigned": "assigned a conversation",
  "conversation.closed": "closed a conversation",
  "message.sent": "sent a message",
};

export function ActivityFeed({ activities }) {
  if (!activities || activities.length === 0) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">No recent activity.</p>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((log) => (
        <div key={log.id} className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-primary shrink-0">
            {log.user?.name?.charAt(0) ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-text-primary">
              <span className="font-medium">{log.user?.name ?? "System"}</span>{" "}
              <span className="text-text-muted">
                {ACTION_LABELS[log.action] ?? log.action}
              </span>
              {log.entity_type && (
                <span className="text-text-muted"> ({log.entity_type})</span>
              )}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {formatRelativeTime(log.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
