import type { ReactNode } from "react";
import { RequirePermission } from "@/components/auth/require-permission";
import { InboxShell } from "@/components/inbox/inbox-shell";

export default function InboxLayout({ children }: { children: ReactNode }) {
  return (
    <RequirePermission permission="conversations.view">
      <div className="relative flex h-[calc(100dvh-0px)] min-h-0 w-full flex-1 -m-4 sm:-m-6">
        <InboxShell>{children}</InboxShell>
      </div>
    </RequirePermission>
  );
}
