import type { ReactNode } from "react";
import { RequirePermission } from "@/components/auth/require-permission";
import { InboxShell } from "@/components/inbox/inbox-shell";

export default function InboxLayout({ children }: { children: ReactNode }) {
  return (
    <RequirePermission permission="conversations.view">
      <div className="relative flex h-full min-h-0 w-full min-w-0 overflow-hidden">
        <InboxShell>{children}</InboxShell>
      </div>
    </RequirePermission>
  );
}
