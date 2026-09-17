"use client";

import { useState } from "react";
import { Copy, RefreshCw, Send, XCircle } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsCard } from "@/components/settings/settings-card";
import { danger, input, primary, secondary } from "@/components/settings/styles";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api-client";
import { useInviteUser, useInvitations, useResendInvitation, useRevokeInvitation, useRoles } from "@/hooks/use-admin";

function WorkspaceInvitesContent() {
  const invites = useInvitations();
  const roles = useRoles();
  const invite = useInviteUser();
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [note, setNote] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const onInvite = async () => {
    if (!email || !roleId) return;
    setMessage(null);
    try {
      await invite.mutateAsync({ email, role_id: Number(roleId), first_name: firstName || undefined, last_name: lastName || undefined, message: note || undefined, send_email: sendEmail });
      setEmail(""); setRoleId(""); setFirstName(""); setLastName(""); setNote("");
      setMessage("Invitation sent.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Unable to send invitation.");
    }
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 p-2 sm:p-4">
      <div className="space-y-4">
        <SettingsBreadcrumb
          items={[
            { label: "Settings", href: "/settings" },
            { label: "System", href: "/settings" },
            { label: "Invitations" },
          ]}
        />
        <div>
          <h1 className="text-2xl font-bold text-text">Invitations</h1>
          <p className="mt-1 text-sm text-muted">Invite and manage pending workspace members.</p>
        </div>
      </div>

      <SettingsCard title="Invite User" description="Send a secure invitation link that expires in 7 days.">
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={input} placeholder="Email address *" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className={input} value={roleId} onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Role *</option>
            {roles.data?.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
          <input className={input} placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <input className={input} placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          <textarea className={`${input} sm:col-span-2`} rows={3} placeholder="Optional message" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="accent-primary" />Send invitation email immediately</label>
          <button className={primary} type="button" disabled={!email || !roleId || invite.isPending} onClick={onInvite}><Send className="h-4 w-4" />Invite User</button>
        </div>
        {message && <p className="mt-3 text-sm text-muted">{message}</p>}
      </SettingsCard>

      {invites.isLoading && <SettingsCard><div className="h-32 animate-pulse rounded-lg bg-bg" /></SettingsCard>}
      {invites.isError && <ErrorState message="Unable to load invitations." onRetry={() => invites.refetch()} />}
      {!invites.isLoading && !invites.isError && (
        <SettingsCard title="Pending & Historical Invitations" action={<button className={secondary} onClick={() => invites.refetch()}><RefreshCw className="h-4 w-4" />Refresh</button>}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted"><tr><th className="py-3">Email</th><th>Role</th><th>Invited By</th><th>Sent</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {(invites.data ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-border/70">
                    <td className="py-3 font-medium text-text">{row.email}</td>
                    <td className="text-muted">{row.role?.name ?? "-"}</td>
                    <td className="text-muted">{row.invited_by?.name ?? "-"}</td>
                    <td className="text-muted">{new Date(row.created_at).toLocaleDateString()}</td>
                    <td className="text-muted">{new Date(row.expires_at).toLocaleDateString()}</td>
                    <td><span className="rounded-full border border-border px-2 py-1 text-xs uppercase text-muted">{row.status}</span></td>
                    <td className="flex flex-wrap gap-2 py-3">
                      {row.status === "pending" && <button className={secondary} onClick={() => resend.mutate(row.id)}>Resend</button>}
                      {row.status === "pending" && <button className={danger} onClick={() => revoke.mutate(row.id)}><XCircle className="h-4 w-4" />Revoke</button>}
                      <button className={secondary} onClick={() => navigator.clipboard?.writeText(row.email)}><Copy className="h-4 w-4" />Copy Email</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingsCard>
      )}
    </div>
  );
}

export default function WorkspaceInvitesPage() {
  return <RequirePermission permission="invitations.manage"><WorkspaceInvitesContent /></RequirePermission>;
}
