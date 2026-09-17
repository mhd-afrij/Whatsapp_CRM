"use client";

import { useState } from "react";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  Search,
  X,
  MessageSquareText,
  ContactRound,
  Users,
  Inbox,
  BellRing,
  FileText,
  Phone,
  BarChart3,
  ScrollText,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { SETTINGS_HUB_CATEGORIES, SettingsHubCard } from "@/config/navigation";
import { cn } from "@/lib/utils";

function getCardIcon(cardName: string, categoryIcon: React.ElementType) {
  const byName: Record<string, React.ElementType> = {
    "Contact Settings": ContactRound,
    "Lead Settings": Users,
    "Inbox Settings": Inbox,
    Notifications: BellRing,
    Templates: FileText,
    Accounts: Phone,
    "Message Templates": FileText,
    Webhooks: Settings,
    Analytics: BarChart3,
    "Audit Logs": ScrollText,
  };
  return byName[cardName] || categoryIcon;
}

export function SettingsHubSearch() {
  const pathname = usePathname();

  const flat = useMemo(
    () =>
      SETTINGS_HUB_CATEGORIES.flatMap((section) =>
        section.items.map((card): SettingsHubCard & { icon: React.ElementType } => ({
          section: section.label,
          icon: getCardIcon(card.label, section.icon),
          name: card.label,
          description: card.description,
          href: card.href,
        }))
      ),
    []
  );

  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        placeholder="Search settings…"
        aria-label="Search settings"
        readOnly
        className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text outline-none transition-colors placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary cursor-default"
      />
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => {}}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-text"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {pathname === "/settings" && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="border-b border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Search settings
          </div>
          <ul className="max-h-80 overflow-y-auto p-2">
            {flat.map((card) => {
              const CardIcon = card.icon;
              return (
                <li key={card.href + card.name} className="border-b border-border/50 last:border-0">
                  <Link
                    href={card.href}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CardIcon className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-text">{card.name}</span>
                      <span className="block text-xs text-muted">{card.description}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-primary" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function fbGetCardIcon(cardName: string, categoryIcon: React.ElementType): React.ElementType {
  return getCardIcon(cardName, categoryIcon);
}

