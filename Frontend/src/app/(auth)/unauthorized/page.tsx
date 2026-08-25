"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/context/auth-context";

export default function UnauthorizedPage() {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
          <ShieldAlert className="h-6 w-6 text-danger" />
        </div>
        <h1 className="text-xl font-semibold text-text">Access denied</h1>
        <p className="mt-2 text-sm text-muted">
          You don&apos;t have permission to view this page. If you believe this is a mistake,
          contact your workspace administrator.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Back to dashboard
          </Link>
          <button
            type="button"
            onClick={() => logout()}
            className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium text-muted hover:bg-primary-soft/50 hover:text-text"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
