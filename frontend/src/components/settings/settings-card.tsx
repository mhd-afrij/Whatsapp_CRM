"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsCardProps {
  title?: string;
  description?: string;
  className?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function SettingsCard({ title, description, className, action, children }: SettingsCardProps) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface p-5 sm:p-6", className)}>
      {(title || description || action) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold text-text">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function SettingRow({
  label,
  description,
  control,
  htmlFor,
}: {
  label: string;
  description?: string;
  control: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-bg/70">
      <div className="min-w-0 flex-1 basis-56">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-text">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{control}</div>
    </div>
  );
}
