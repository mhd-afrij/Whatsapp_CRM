"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DangerCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-danger/40 bg-danger/5 p-4", className)}>
      <h3 className="text-sm font-semibold text-danger">{title}</h3>
      {description && <p className="mt-1 text-xs text-muted">{description}</p>}
      {children}
    </div>
  );
}