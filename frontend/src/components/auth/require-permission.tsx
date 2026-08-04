"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { usePermission } from "@/hooks/use-permission";

/**
 * Route-level permission gate, mirroring docs/06-frontend-route-map.md §4:
 * this is a UX optimization only. The backend's `permission:{name}` route
 * middleware (docs/07-permission-matrix.md) is the actual security boundary
 * — every request this page makes will be re-checked server-side regardless.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const allowed = usePermission(permission);
  const router = useRouter();

  useEffect(() => {
    if (!allowed) {
      router.replace("/unauthorized");
    }
  }, [allowed, router]);

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
