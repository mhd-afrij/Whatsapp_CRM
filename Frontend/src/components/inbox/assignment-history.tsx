"use client";

import { useQuery } from "@tanstack/react-query";
import { UserPlus, UserMinus } from "lucide-react";
import { fetchAssignmentHistory, type AssignmentHistoryEntry } from "@/lib/conversations-api";
import { cn } from "@/lib/utils";

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface AssignmentHistoryProps {
  conversationId: number;
}

export function AssignmentHistory({ conversationId }: AssignmentHistoryProps) {
  const { data: history, isLoading } = useQuery({
    queryKey: ["conversations", conversationId, "assignment-history"],
    queryFn: () => fetchAssignmentHistory(conversationId),
    enabled: !!conversationId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-bg" />
        ))}
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <p className="text-xs text-muted text-center py-4">
        No assignment history yet.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {history.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-bg"
        >
          <div
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
              entry.unassigned_at ? "bg-warning/10" : "bg-success/10"
            )}
          >
            {entry.unassigned_at ? (
              <UserMinus className="h-3.5 w-3.5 text-warning" />
            ) : (
              <UserPlus className="h-3.5 w-3.5 text-success" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text">
              {entry.assigned_by && (
                <span className="font-medium">{entry.assigned_by}</span>
              )}
              {entry.unassigned_at ? (
                <>
                  {" "}
                  <span className="text-muted">unassigned</span>
                  {entry.assigned_to_user && (
                    <span className="font-medium"> {entry.assigned_to_user}</span>
                  )}
                  {entry.assigned_to_team && (
                    <span className="font-medium"> {entry.assigned_to_team}</span>
                  )}
                </>
              ) : (
                <>
                  {" "}
                  <span className="text-muted">assigned to</span>
                  {entry.assigned_to_user && (
                    <span className="font-medium"> {entry.assigned_to_user}</span>
                  )}
                  {entry.assigned_to_team && (
                    <span className="font-medium"> {entry.assigned_to_team}</span>
                  )}
                </>
              )}
            </p>
            <p className="text-[10px] text-muted mt-0.5">
              {formatRelativeTime(entry.assigned_at)}
              {entry.unassigned_at && ` (${formatRelativeTime(entry.unassigned_at)})`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
