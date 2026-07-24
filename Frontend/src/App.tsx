import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import LoginPage from "./app/(auth)/login/page";
import DashboardPage from "./app/(workspace)/dashboard/page";
import InboxPage from "./app/(workspace)/inbox/page";
import TeamPage from "./app/(workspace)/team/page";
import AuditLogPage from "./app/(workspace)/audit-log/page";
import RolesPage from "./app/(workspace)/settings/roles/page";
import WhatsAppConnectionPage from "./app/(workspace)/settings/whatsapp/page";
import SettingsPage from "./app/(workspace)/settings/page";
import AnalyticsPage from "./app/(workspace)/analytics/page";
import NotificationsPage from "./app/(workspace)/notifications/page";

function WorkspaceRoute({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-6">
      <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
      <p className="mt-2 text-sm text-text-muted">This section is still a placeholder in the SPA shell.</p>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<WorkspaceRoute><DashboardPage /></WorkspaceRoute>} />
      <Route path="/inbox" element={<WorkspaceRoute><InboxPage /></WorkspaceRoute>} />
      <Route path="/team" element={<WorkspaceRoute><TeamPage /></WorkspaceRoute>} />
      <Route path="/audit-log" element={<WorkspaceRoute><AuditLogPage /></WorkspaceRoute>} />
      <Route path="/settings/roles" element={<WorkspaceRoute><RolesPage /></WorkspaceRoute>} />
      <Route path="/settings/whatsapp" element={<WorkspaceRoute><WhatsAppConnectionPage /></WorkspaceRoute>} />
      <Route path="/settings" element={<WorkspaceRoute><SettingsPage /></WorkspaceRoute>} />
      <Route path="/analytics" element={<WorkspaceRoute><AnalyticsPage /></WorkspaceRoute>} />
      <Route path="/notifications" element={<WorkspaceRoute><NotificationsPage /></WorkspaceRoute>} />
      <Route path="/customers" element={<WorkspaceRoute><PlaceholderPage title="Customers" /></WorkspaceRoute>} />
      <Route path="/leads" element={<WorkspaceRoute><PlaceholderPage title="Leads" /></WorkspaceRoute>} />
      <Route path="/pipeline" element={<WorkspaceRoute><PlaceholderPage title="Pipeline" /></WorkspaceRoute>} />
      <Route path="/tasks" element={<WorkspaceRoute><PlaceholderPage title="Tasks" /></WorkspaceRoute>} />
      <Route path="/calendar" element={<WorkspaceRoute><PlaceholderPage title="Calendar" /></WorkspaceRoute>} />
      <Route path="/search" element={<WorkspaceRoute><PlaceholderPage title="Search" /></WorkspaceRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
