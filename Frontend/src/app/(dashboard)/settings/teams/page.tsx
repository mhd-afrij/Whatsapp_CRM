"use client";

import { useState } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import {
  useAddTeamMember,
  useCreateTeam,
  useDeleteTeam,
  useRemoveTeamMember,
  useTeams,
  useUpdateTeam,
} from "@/hooks/use-admin";
import { useUsers } from "@/hooks/use-users";
import { ApiError } from "@/lib/api-client";
import type { Team } from "@/lib/admin-api";
import { ErrorState } from "@/components/ui/error-state";

function TeamCard({ team, canManage }: { team: Team; canManage: boolean }) {
  const { data: users } = useUsers();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(team.name);
  const [addUserId, setAddUserId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useUpdateTeam();
  const deleteMutation = useDeleteTeam();
  const addMemberMutation = useAddTeamMember();
  const removeMemberMutation = useRemoveTeamMember();

  const memberIds = new Set(team.members.map((m) => m.id));
  const availableUsers = users?.filter((u) => !memberIds.has(u.id)) ?? [];

  const onSaveName = async () => {
    setError(null);
    try {
      await updateMutation.mutateAsync({ id: team.id, values: { name: name.trim() } });
      setEditingName(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to rename team.");
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete "${team.name}"? Members will simply lose this team assignment.`)) {
      return;
    }
    setError(null);
    try {
      await deleteMutation.mutateAsync(team.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete team.");
    }
  };

  const onAddMember = async () => {
    if (!addUserId) return;
    setError(null);
    try {
      await addMemberMutation.mutateAsync({ teamId: team.id, values: { user_id: Number(addUserId) } });
      setAddUserId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to add member.");
    }
  };

  const onSetManager = async (userId: number, isLead: boolean) => {
    setError(null);
    try {
      await addMemberMutation.mutateAsync({ teamId: team.id, values: { user_id: userId, is_lead: isLead } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update team manager.");
    }
  };

  const onRemoveMember = async (userId: number) => {
    setError(null);
    try {
      await removeMemberMutation.mutateAsync({ teamId: team.id, userId });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to remove member.");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        {editingName ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
            />
            <button
              type="button"
              onClick={onSaveName}
              className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-dark"
            >
              Save
            </button>
            <button type="button" onClick={() => setEditingName(false)} className="text-xs text-muted hover:text-text">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => canManage && setEditingName(true)}
            className="text-left text-base font-semibold text-text"
            disabled={!canManage}
          >
            {team.name}
          </button>
        )}
        {canManage && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${team.name}`}
            className="shrink-0 rounded-md p-1.5 text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-1.5">
        {team.members.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
          >
            <div>
              <span className="font-medium text-text">{member.name}</span>{" "}
              <span className="text-muted">{member.email}</span>
              {member.is_lead && (
                <span className="ml-2 rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary-dark">
                  Manager
                </span>
              )}
            </div>
            {canManage && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onSetManager(member.id, !member.is_lead)}
                  className="text-xs text-primary hover:underline"
                >
                  {member.is_lead ? "Unset manager" : "Set as manager"}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveMember(member.id)}
                  aria-label={`Remove ${member.name}`}
                  className="rounded-md p-1 text-danger hover:bg-danger/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
        {team.members.length === 0 && <p className="text-sm text-muted">No members yet.</p>}
      </ul>

      {canManage && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value ? Number(e.target.value) : "")}
            className="flex-1 rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text"
          >
            <option value="">Add member…</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onAddMember}
            disabled={!addUserId || addMemberMutation.isPending}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <UserPlus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

function TeamsManager() {
  const { data: teams, isLoading, isError, refetch } = useTeams();
  const createMutation = useCreateTeam();
  const canManage = usePermission("teams.manage");
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const onCreate = async () => {
    if (!newName.trim()) return;
    setCreateError(null);
    try {
      await createMutation.mutateAsync({ name: newName.trim() });
      setNewName("");
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Unable to create team.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Teams</h1>
        <p className="mt-1 text-sm text-muted">
          Group users into teams, assign a team manager, and add/remove members. Gated behind{" "}
          <code className="rounded bg-primary-soft px-1 py-0.5 text-xs">teams.manage</code>.
        </p>
      </div>

      {canManage && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">New team</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Team name"
              className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
            />
            <button
              type="button"
              onClick={onCreate}
              disabled={createMutation.isPending || !newName.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Create
            </button>
          </div>
          {createError && <p className="mt-2 text-sm text-danger">{createError}</p>}
        </div>
      )}

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <ErrorState message="Unable to load teams." onRetry={() => refetch()} />
      )}
      {!isLoading && !isError && (teams?.length ?? 0) === 0 && (
        <p className="text-sm text-muted">No teams yet.</p>
      )}

      <div className="space-y-4">
        {teams?.map((team) => (
          <TeamCard key={team.id} team={team} canManage={canManage} />
        ))}
      </div>
    </div>
  );
}

export default function TeamsSettingsPage() {
  return (
    <RequirePermission permission="teams.view">
      <TeamsManager />
    </RequirePermission>
  );
}
