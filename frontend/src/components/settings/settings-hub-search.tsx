"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Search,
  X,
  ContactRound,
  Users,
  Inbox,
  BellRing,
  FileText,
  Phone,
  BarChart3,
  ScrollText,
  Settings,
  Clock3,
  TriangleAlert,
  UsersRound,
  Sparkles,
} from "lucide-react";
import { SETTINGS_HUB_CATEGORIES } from "@/config/navigation";

type FlatSettingsCard = {
  section: string;
  icon: React.ElementType;
  name: string;
  description: string;
  href: string;
};

function getCardIcon(cardName: string, categoryIcon: React.ElementType) {
  const byName: Record<string, React.ElementType> = {
    "Contact Settings": ContactRound,
    "Lead Settings": Users,
    "Inbox Settings": Inbox,
    Notifications: BellRing,
    Templates: FileText,
    "Quick Reply Templates": FileText,
    Accounts: Phone,
    "Message Templates": FileText,
    Webhooks: Settings,
    Analytics: BarChart3,
    "Audit Logs": ScrollText,
    General: ContactRound,
    Operations: Clock3,
    "Danger Zone": TriangleAlert,
    "Team Management": UsersRound,
    "AI Assistant": Sparkles,
  };
  return byName[cardName] || categoryIcon;
}

export function SettingsHubSearch() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const flat = useMemo(
    () =>
      SETTINGS_HUB_CATEGORIES.flatMap((section) =>
        section.items.map((card): FlatSettingsCard => ({
          section: section.label,
          icon: getCardIcon(card.label, section.icon),
          name: card.label,
          description: card.description,
          href: card.href,
        }))
      ),
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter((card) =>
      [card.name, card.description, card.section].some((value) =>
        value.toLowerCase().includes(q)
      )
    );
  }, [flat, query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const showDropdown = isOpen && query.trim() !== "";

  return (
    <div ref={wrapperRef} className="relative w-full sm:w-[304px]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            (event.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Search settings…"
        aria-label="Search settings"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="settings-search-results"
        className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-9 text-sm text-text outline-none transition-colors placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setQuery("");
            setIsOpen(false);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted transition-colors hover:text-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {showDropdown && (
        <div
          id="settings-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          <ul className="max-h-[360px] overflow-y-auto p-2">
            {filtered.length > 0 ? (
              filtered.map((card) => {
                const CardIcon = card.icon;
                return (
                  <li key={card.href + card.name} role="option" aria-selected={false}>
                    <Link
                      href={card.href}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <CardIcon className="h-4.5 w-4.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-text">{card.name}</span>
                        <span className="block text-xs text-muted">{card.description}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-6 text-center text-sm text-muted">
                No results for “{query.trim()}”
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function fbGetCardIcon(cardName: string, categoryIcon: React.ElementType): React.ElementType {
  return getCardIcon(cardName, categoryIcon);
}