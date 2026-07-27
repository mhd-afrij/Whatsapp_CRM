import { useAuthStore } from "../store/index.js";
import { Navigate } from "react-router-dom";

export function RoleRoute({ allowedRoles, children }) {
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const hasRole = user.roles.some((role) => allowedRoles.includes(role));

  if (!hasRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
