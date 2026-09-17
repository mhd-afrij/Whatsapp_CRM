"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronRight,
  ContactRound,
  FileText,
  Inbox,
  Loader2,
  Phone,
  Search,
  Settings2,
  Users,
  Webhook,
  BarChart3,
  ScrollText,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/api-client";

export interface Crumb {
  label: string;
  href?: string;
}

export function SettingsBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <span key={item.label + index} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="h-3 w-3 text-muted/60" aria-hidden />}
            {item.href && !last ? (
              <a
                href={item.href}
                className="rounded px-0.5 font-medium transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
              >
                {item.label}
              </a>
            ) : (
              <span aria-current={last ? "page" : undefined} className={last ? "font-semibold text-text" : ""}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
