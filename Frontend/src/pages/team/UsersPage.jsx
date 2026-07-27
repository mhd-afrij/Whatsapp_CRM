import { useQuery } from "@tanstack/react-query";
import { UserPlus, Users } from "lucide-react";
import { authFetch } from "../../store/index.js";
import { Badge } from "../../components/common/Badge.jsx";
import { EmptyState } from "../../components/common/EmptyState.jsx";

const STATUS_TONE = { active: "success", invited: "info", suspended: "danger", archived: "neutral" };

export default function UsersPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["team-members"],
    queryFn: () => authFetch("/users"),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Team</h1>
          <p className="text-sm text-text-muted mt-1">Members of this workspace and their assigned roles.</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium">
          <UserPlus size={15} /> Invite member
        </button>
      </div>

      {isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-[10px] bg-surface border border-border-muted animate-pulse" />)}</div>}
      {isError && <EmptyState icon={Users} title="Couldn't load team members" description="You may not have the users.view permission." />}
      {data && data.length === 0 && <EmptyState icon={Users} title="No team members yet" description="Invite your first teammate to get started." />}

      {data && data.length > 0 && (
        <div className="rounded-[10px] border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Member</th>
                <th className="text-left font-medium px-4 py-3">Role</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {data.map((member) => (
                <tr key={member.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-primary">{member.name.charAt(0)}</div>
                      <div>
                        <p className="font-medium text-text-primary">{member.name}</p>
                        <p className="text-xs text-text-muted">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{member.roles.map((r) => r.name).join(", ") || "\u2014"}</td>
                  <td className="px-4 py-3"><Badge label={member.status} tone={STATUS_TONE[member.status] ?? "neutral"} /></td>
                  <td className="px-4 py-3 text-text-muted">{member.last_login_at ? new Date(member.last_login_at).toLocaleString() : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
