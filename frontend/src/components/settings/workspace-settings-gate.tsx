"use client";

import type { ReactNode } from "react";
import { ErrorState } from "@/components/ui/error-state";
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { ApiError } from "@/lib/api-client";
import type { WorkspaceSettings } from "@/lib/workspace-api";

export function WorkspaceSettingsGate({
  children,
}: {
  children: (workspace: WorkspaceSettings) => ReactNode;
}) {
  const workspaceQuery = useWorkspaceSettings();

  if (workspaceQuery.isLoading) {
    return <div className="p-6 text-sm text-muted">Loading workspace settings...</div>;
  }

  if (workspaceQuery.isError || !workspaceQuery.data) {
    const reason =
      workspaceQuery.error instanceof ApiError ? workspaceQuery.error.message : null;
    return (
      <div className="p-6">
        <ErrorState
          message={
            reason
              ? `Unable to load workspace settings: ${reason}`
              : "Unable to load workspace settings."
          }
          onRetry={() => void workspaceQuery.refetch()}
        />
        <p className="mt-3 text-center text-xs text-muted">
          If this keeps happening, check that the backend server is running and its database is up
          to date.
        </p>
      </div>
    );
  }

  return <>{children(workspaceQuery.data)}</>;
}