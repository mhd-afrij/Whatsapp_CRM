import type { ReactNode } from "react";
import { RequirePermission } from "@/components/auth/require-permission";
import { InboxShell } from "@/components/inbox/inbox-shell";

export default function InboxLayout({ children }: { children: ReactNode }) {
  return (
    <RequirePermission permission="conversations.view">
      <InboxShell>{children}</InboxShell>
    </RequirePermission>
  );
}
