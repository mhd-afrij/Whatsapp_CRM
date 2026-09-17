"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function SettingsPageHeader({
  title,
  description,
  backHref,
  actions,
}: {
  title: string;
  description: string;
  backHref?: string;
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {backHref && (
          <button
            type="button"
            onClick={() => router.push(backHref)}
            aria-label="Back to settings"
            className="mt-1 rounded-lg border border-border p-1.5 text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
