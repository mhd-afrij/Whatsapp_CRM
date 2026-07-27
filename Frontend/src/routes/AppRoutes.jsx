import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute.jsx";
import { DashboardLayout } from "../components/layout/DashboardLayout.jsx";
import LoginPage from "../pages/auth/LoginPage.jsx";
import DashboardPage from "../pages/dashboard/DashboardPage.jsx";
import InboxPage from "../pages/inbox/InboxPage.jsx";
import UsersPage from "../pages/team/UsersPage.jsx";
import RolesPage from "../pages/team/RolesPage.jsx";
import WhatsAppConnectionPage from "../pages/whatsapp/WhatsAppConnectionPage.jsx";
import SettingsPage from "../pages/settings/SettingsPage.jsx";
import ReportsPage from "../pages/reports/ReportsPage.jsx";

function WorkspaceRoute({ children }) {
  return (
    <ProtectedRoute>
      <DashboardLayout>{children}</DashboardLayout>
    </ProtectedRoute>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<WorkspaceRoute><DashboardPage /></WorkspaceRoute>} />
      <Route path="/inbox" element={<WorkspaceRoute><InboxPage /></WorkspaceRoute>} />
      <Route path="/team" element={<WorkspaceRoute><UsersPage /></WorkspaceRoute>} />
      <Route path="/settings/roles" element={<WorkspaceRoute><RolesPage /></WorkspaceRoute>} />
      <Route path="/settings/whatsapp" element={<WorkspaceRoute><WhatsAppConnectionPage /></WorkspaceRoute>} />
      <Route path="/settings" element={<WorkspaceRoute><SettingsPage /></WorkspaceRoute>} />
      <Route path="/reports" element={<WorkspaceRoute><ReportsPage /></WorkspaceRoute>} />
      <Route path="/customers" element={<WorkspaceRoute><InboxPage title="Customers" /></WorkspaceRoute>} />
      <Route path="/leads" element={<WorkspaceRoute><InboxPage title="Leads" /></WorkspaceRoute>} />
      <Route path="/pipeline" element={<WorkspaceRoute><InboxPage title="Pipeline" /></WorkspaceRoute>} />
      <Route path="/tasks" element={<WorkspaceRoute><InboxPage title="Tasks" /></WorkspaceRoute>} />
      <Route path="/calendar" element={<WorkspaceRoute><InboxPage title="Calendar" /></WorkspaceRoute>} />
      <Route path="/search" element={<WorkspaceRoute><InboxPage title="Search" /></WorkspaceRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
