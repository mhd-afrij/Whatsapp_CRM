import { useAuthStore } from "../store/index.js";

/**
 * Check if the current user has a specific permission.
 * @param {string} permission
 * @returns {boolean}
 */
export function usePermission(permission) {
  return useAuthStore((state) => state.hasPermission(permission));
}

/**
 * Check if the current user has any of the given permissions.
 * @param {string[]} permissions
 * @returns {boolean}
 */
export function useAnyPermission(permissions) {
  return useAuthStore((state) =>
    permissions.some((p) => state.hasPermission(p))
  );
}
