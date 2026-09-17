"use client";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AccountStatusBadge } from "@/components/whatsapp/account-status-badge";
import type { WorkspaceWhatsappAccount } from "@/lib/workspace-api";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-xs font-medium text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-xs font-medium text-text">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <dl className="mt-2 divide-y divide-border/60">{children}</dl>
    </section>
  );
}

/**
 * Account details drawer. Every value comes from the workspace settings
 * payload (account metadata + gateway-owned session columns); unknown values
 * render as "—" rather than placeholders.
 */
export function AccountDetailsSheet({
  account,
  workspaceName,
  onOpenChange,
}: {
  account: WorkspaceWhatsappAccount | null;
  workspaceName: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={account !== null} onOpenChange={onOpenChange}>
      {account && (
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
          <div className="border-b border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Account Details</p>
            <h2 className="mt-1 truncate text-lg font-semibold text-text">{account.display_name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AccountStatusBadge status={account.whatsapp_session_id ? account.status : null} />
              {account.is_default && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  Active
                </span>
              )}
            </div>
          </div>

          <div className="space-y-5 p-5">
            <Section title="Overview">
              <DetailRow label="Account Name" value={account.display_name} />
              <DetailRow label="Phone Number" value={account.phone_number ?? "Not paired"} />
              <DetailRow label="Status" value={account.whatsapp_session_id ? (account.status ?? "—") : "Slot only"} />
              <DetailRow label="Active / Primary" value={account.is_default ? "Yes" : "No"} />
              <DetailRow label="Last Activity" value={formatDate(account.last_connected_at)} />
            </Section>

            <Section title="Connection">
              <DetailRow label="Session Status" value={account.status ?? "—"} />
              <DetailRow label="Gateway Status" value={account.whatsapp_session_id ? "Linked" : "Not linked"} />
              <DetailRow label="Device" value={account.device_id ?? "Not detected"} />
              <DetailRow label="Last Connected" value={formatDate(account.last_connected_at)} />
              <DetailRow label="Last Disconnected" value={formatDate(account.last_disconnected_at)} />
            </Section>

            <Section title="Routing & Team">
              <DetailRow label="Assigned Team" value={account.assigned_team?.name ?? "—"} />
              <DetailRow label="Routing" value={account.is_default ? "Primary account" : "Managed slot"} />
            </Section>

            <Section title="Automation">
              <DetailRow label="Auto Reply" value={account.auto_reply_settings?.enabled ? "Enabled" : "Disabled"} />
            </Section>

            <Section title="Advanced">
              <DetailRow label="Internal Account ID" value={account.id ? `#${account.id}` : "—"} />
              <DetailRow label="Session ID" value={account.whatsapp_session_id ? `#${account.whatsapp_session_id}` : "—"} />
              <DetailRow label="Workspace" value={workspaceName ?? "—"} />
            </Section>
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}
