"use client";

import { useAuth } from "@/context/auth-context";

/**
 * UX-layer permission check only — mirrors the backend permission matrix
 * (docs/07-permission-matrix.md) so nav/UI can hide/disable affordances the
 * user doesn't have. The backend's `permission:{name}` middleware remains the
 * actual security boundary; this hook must never be relied on alone.
 */
export function usePermission(permission: string): boolean {
  const { can } = useAuth();
  return can(permission);
}

export function usePermissions(): { can: (permission: string) => boolean } {
  const { can } = useAuth();
  return { can };
}
