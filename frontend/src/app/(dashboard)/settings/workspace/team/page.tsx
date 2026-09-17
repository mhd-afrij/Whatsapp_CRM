"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SettingsEmptyState, SettingsSkeleton } from "@/components/settings/settings-states";
import { Toggle } from "@/components/settings/toggle";
import { danger, input, primary, secondary } from "@/components/settings/styles";
import { ErrorState } from "@/components/ui/error-state";
import {
  useAddTeamMember,
  useAdminUsers,
  useCreateTeam,
  useDeleteTeam,
  useInvitations,
  useInviteUser,
  useRemoveTeamMember,
  useRemoveWorkspaceUser,
  useResendInvitation,
  useReactivateUser,
  useRevokeInvitation,
  useRoles,
  useSuspendUser,
  useTeams,
  useUpdateAdminUser,
} from "@/hooks/use-admin";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type TabKey = "members" | "invitations" | "teams";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "members", label: "Members" },
  { key: "invitations", label: "Invitations" },
  { key: "teams", label: "Teams" },
];

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/* ------------------------------------------------------------------ */
/* Members tab                                                         */
/* ------------------------------------------------------------------ */

function MembersTab() {
  const users = useAdminUsers({ page: 1, per_page: 100 });
  const roles = useRoles();
  const invite = useInviteUser();
  const updateUser = useUpdateAdminUser();
  const suspend = useSuspendUser();
  const reactivate = useReactivateUser();
  const removeUser = useRemoveWorkspaceUser();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"ok" | "err">("ok");

  const activeUsers = useMemo(() => users.data?.data ?? [], [users.data?.data]);

  const onInvite = async () => {
    if (!email || !roleId) return;
    setMessage(null);
    try {
      await invite.mutateAsync({ email, role_id: Number(roleId), send_email: true });
      setEmail("");
      setRoleId("");
      setMessageKind("ok");
      setMessage("Invitation sent.");
    } catch (err) {
      setMessageKind("err");
      setMessage(errorMessage(err, "Unable to send invitation."));
    }
  };

  const onRoleChange = async (userId: number, nextRoleId: number) => {
    setMessage(null);
    try {
      await updateUser.mutateAsync({ id: userId, values: { role_id: nextRoleId } });
      setMessageKind("ok");
      setMessage("User role updated.");
    } catch (err) {
      setMessageKind("err");
      setMessage(errorMessage(err, "Unable to update role."));
    }
  };

  const onToggleActive = async (userId: number, name: string, nextActive: boolean) => {
    setMessage(null);
    try {
      if (nextActive) {
        await reactivate.mutateAsync(userId);
        setMessageKind("ok");
        setMessage(`${name} reactivated.`);
      } else {
        await suspend.mutateAsync(userId);
        setMessageKind("ok");
        setMessage(`${name} suspended.`);
      }
    } catch (err) {
      setMessageKind("err");
      setMessage(errorMessage(err, "Unable to update user status."));
    }
  };

  const onRemove = async (userId: number, name: string) => {
    if (!window.confirm(`Remove ${name} from this workspace? They will lose access here but historical activity remains.`)) return;
    setMessage(null);
    try {
      await removeUser.mutateAsync(userId);
      setMessageKind("ok");
      setMessage("User removed from workspace.");
    } catch (err) {
      setMessageKind("err");
      setMessage(errorMessage(err, "Unable to remove user."));
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard title="Invite a member" description="Send a secure invitation link that expires in 7 days.">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input
            className={input}
            placeholder="member@example.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            className={input}
            value={roleId}
            onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select role</option>
            {roles.data?.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <button
            className={primary}
            type="button"
            disabled={!email || !roleId || invite.isPending}
            onClick={() => void onInvite()}
          >
            {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Invite Member
          </button>
        </div>
        {message && (
          <p className={cn("mt-3 flex items-center gap-1.5 text-sm", messageKind === "err" ? "text-danger" : "text-success")}>
            {messageKind === "err" ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {message}
          </p>
        )}
      </SettingsCard>

      {users.isLoading && (
        <SettingsCard>
          <SettingsSkeleton rows={4} />
        </SettingsCard>
      )}
      {users.isError && <ErrorState message="Unable to load team members." onRetry={() => void users.refetch()} />}

      {!users.isLoading && !users.isError && (
        <SettingsCard
          title={`Members (${activeUsers.length})`}
          description="Change roles, suspend access, or remove members from the workspace."
          action={
            <button
              className={secondary}
              type="button"
              onClick={() => {
                void users.refetch();
                void roles.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          }
        >
          {activeUsers.length === 0 ? (
            <SettingsEmptyState
              title="No members yet"
              description="Invite your first teammate using the form above."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted">
                  <tr>
                    <th className="py-3 pr-3">Member</th>
                    <th className="px-3">Role</th>
                    <th className="px-3">Status</th>
                    <th className="px-3">Last Active</th>
                    <th className="px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeUsers.map((user) => (
                    <tr key={user.id} className="border-b border-border/70">
                      <td className="py-3 pr-3">
                        <p className="font-medium text-text">{user.name}</p>
                        <p className="text-xs text-muted">{user.email}</p>
                      </td>
                      <td className="px-3">
                        <select
                          className={cn(input, "sm:max-w-40")}
                          value={user.roles[0]?.id ?? ""}
                          onChange={(e) => void onRoleChange(user.id, Number(e.target.value))}
                          aria-label={`Role for ${user.name}`}
                        >
                          {roles.data?.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3">
                        <Toggle
                          label={`${user.name} active`}
                          checked={user.is_active}
                          disabled={suspend.isPending || reactivate.isPending}
                          onChange={(next) => void onToggleActive(user.id, user.name, next)}
                        />
                      </td>
                      <td className="px-3 text-muted">
                        {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          className={danger}
                          onClick={() => void onRemove(user.id, user.name)}
                          aria-label={`Remove ${user.name}`}
                        >
                          <UserMinus className="h-4 w-4" /> Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SettingsCard>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Invitations tab                                                     */
/* ------------------------------------------------------------------ */

function InvitationsTab() {
  const invites = useInvitations();
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();

  const pending = useMemo(() => (invites.data ?? []).filter((row) => row.status === "pending"), [invites.data]);
  const history = useMemo(() => (invites.data ?? []).filter((row) => row.status !== "pending"), [invites.data]);

  const statusPill = (status: string) =>
    cn(
      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
      status === "pending" && "bg-warning/10 text-warning",
      status === "accepted" && "bg-success/10 text-success",
      status === "expired" && "bg-muted text-muted",
      status === "revoked" && "bg-danger/10 text-danger"
    );

  return (
    <div className="space-y-6">
      <SettingsCard
        title={`Pending invitations (${pending.length})`}
        description="Members who have been invited but haven't accepted yet."
        action={
          <button className={secondary} onClick={() => void invites.refetch()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        }
      >
        {invites.isLoading && <SettingsSkeleton rows={3} />}
        {invites.isError && <ErrorState message="Unable to load invitations." onRetry={() => void invites.refetch()} />}
        {!invites.isLoading && !invites.isError && pending.length === 0 && (
          <SettingsEmptyState
            title="No pending invitations"
            description="Everyone invited to this workspace has already accepted."
          />
        )}
        {!invites.isLoading && !invites.isError && pending.length > 0 && (
          <ul className="divide-y divide-border">
            {pending.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-text">{row.email}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                    <Clock className="h-3 w-3" />
                    Expires {new Date(row.expires_at).toLocaleDateString()} · Role: {row.role?.name ?? "—"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button className={secondary} disabled={resend.isPending} onClick={() => resend.mutate(row.id)}>
                    <Send className="h-4 w-4" /> Resend
                  </button>
                  <button className={danger} disabled={revoke.isPending} onClick={() => revoke.mutate(row.id)}>
                    <XCircle className="h-4 w-4" /> Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      {!invites.isLoading && !invites.isError && history.length > 0 && (
        <SettingsCard title="History" description="Accepted, expired and revoked invitations.">
          <ul className="divide-y divide-border">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">{row.email}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Sent {new Date(row.created_at).toLocaleDateString()} · Role: {row.role?.name ?? "—"}
                  </p>
                </div>
                <span className={statusPill(row.status)}>{row.status}</span>
              </li>
            ))}
          </ul>
        </SettingsCard>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Teams tab                                                           */
/* ------------------------------------------------------------------ */

function TeamsTab() {
  const teams = useTeams();
  const users = useAdminUsers({ page: 1, per_page: 100 });
  const createTeamMutation = useCreateTeam();
  const deleteTeamMutation = useDeleteTeam();
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [memberPick, setMemberPick] = useState<Record<number, number | "">>({});

  const userOptions = users.data?.data ?? [];

  const onCreate = async () => {
    if (!teamName.trim()) return;
    try {
      await createTeamMutation.mutateAsync({
        name: teamName.trim(),
        description: teamDescription.trim() || undefined,
      });
      setTeamName("");
      setTeamDescription("");
    } catch {
      // Error surfaces via mutation state below.
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard title="Create team" description="Group agents together for routing and team assignment.">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            className={input}
            placeholder="Team name *"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
          />
          <input
            className={input}
            placeholder="Description (optional)"
            value={teamDescription}
            onChange={(e) => setTeamDescription(e.target.value)}
          />
          <button
            className={primary}
            type="button"
            disabled={!teamName.trim() || createTeamMutation.isPending}
            onClick={() => void onCreate()}
          >
            {createTeamMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Create Team
          </button>
        </div>
        {createTeamMutation.isError && (
          <p className="mt-3 text-sm text-danger">{errorMessage(createTeamMutation.error, "Unable to create team.")}</p>
        )}
      </SettingsCard>

      {teams.isLoading && (
        <SettingsCard>
          <SettingsSkeleton rows={3} />
        </SettingsCard>
      )}
      {teams.isError && <ErrorState message="Unable to load teams." onRetry={() => void teams.refetch()} />}

      {!teams.isLoading && !teams.isError && (teams.data ?? []).length === 0 && (
        <SettingsEmptyState
          title="No teams yet"
          description="Create your first team to route conversations to groups of agents."
        />
      )}

      {!teams.isLoading && !teams.isError && (teams.data ?? []).length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {(teams.data ?? []).map((team) => (
            <SettingsCard
              key={team.id}
              title={team.name}
              description={team.description ?? "No description."}
              action={
                <button
                  className={danger}
                  disabled={deleteTeamMutation.isPending}
                  onClick={() => {
                    if (!window.confirm(`Delete team "${team.name}"? Members stay in the workspace.`)) return;
                    deleteTeamMutation.mutate(team.id);
                  }}
                >
                  <XCircle className="h-4 w-4" /> Delete
                </button>
              }
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Members ({team.members.length})
              </p>
              {team.members.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No members in this team.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border">
                  {team.members.map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text">
                          {member.name}
                          {member.is_lead && (
                            <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                              Lead
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted">{member.email}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${member.name} from ${team.name}`}
                        disabled={removeMember.isPending}
                        onClick={() => removeMember.mutate({ teamId: team.id, userId: member.id })}
                        className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex gap-2 border-t border-border pt-4">
                <select
                  className={input}
                  value={memberPick[team.id] ?? ""}
                  onChange={(e) =>
                    setMemberPick((prev) => ({
                      ...prev,
                      [team.id]: e.target.value ? Number(e.target.value) : "",
                    }))
                  }
                  aria-label={`Add member to ${team.name}`}
                >
                  <option value="">Select member to add…</option>
                  {userOptions
                    .filter((user) => !team.members.some((member) => member.id === user.id))
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className={secondary}
                  disabled={!memberPick[team.id] || addMember.isPending}
                  onClick={() => {
                    const userId = memberPick[team.id];
                    if (!userId) return;
                    addMember.mutate(
                      { teamId: team.id, values: { user_id: Number(userId) } },
                      {
                        onSuccess: () =>
                          setMemberPick((prev) => ({ ...prev, [team.id]: "" })),
                      }
                    );
                  }}
                >
                  <UserPlus className="h-4 w-4" /> Add
                </button>
              </div>
            </SettingsCard>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function WorkspaceTeamPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("members");

  return (
    <RequirePermission permission="users.view">
      <div className="space-y-6">
        <div className="space-y-4">
          <SettingsBreadcrumb
            items={[
              { label: "Settings", href: "/settings" },
              { label: "System", href: "/settings" },
              { label: "Team Management" },
            ]}
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text">Team Management</h1>
            <p className="mt-1 text-sm text-muted">
              Members, invitations, teams, roles and account status.
            </p>
          </div>
        </div>

        <SettingsTabs tabs={TABS} active={activeTab} onChange={(key) => setActiveTab(key as TabKey)} />

        {activeTab === "members" && <MembersTab />}
        {activeTab === "invitations" && <InvitationsTab />}
        {activeTab === "teams" && <TeamsTab />}

        <p className="flex items-center gap-1.5 px-1 text-xs text-muted">
          <ShieldCheck className="h-3.5 w-3.5" />
          Role and permission definitions are managed under Settings → Roles.
        </p>
      </div>
    </RequirePermission>
  );
}
