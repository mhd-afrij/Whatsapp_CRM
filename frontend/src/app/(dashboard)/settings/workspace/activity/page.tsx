import { redirect } from "next/navigation";

export default function WorkspaceActivityRedirectPage() {
  // This page rendered a fixed, non-filterable first page of the same
  // audit-log rows the full audit-log viewer already serves (same
  // GET /audit-logs endpoint, same useAuditLogs hook). The canonical,
  // filterable + paginated implementation is /settings/audit-log.
  redirect("/settings/audit-log");
}
