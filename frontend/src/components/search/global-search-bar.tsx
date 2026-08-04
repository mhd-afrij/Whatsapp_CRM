"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useGlobalSearch } from "@/hooks/use-search";
import { SEARCH_CATEGORY_LABELS, type SearchCategory } from "@/lib/search-api";
import { highlightMatch } from "@/components/search/highlight-match";

const CATEGORY_ORDER: SearchCategory[] = ["contacts", "conversations", "leads", "deals", "tasks"];

function resultLabel(category: SearchCategory, item: Record<string, unknown>): string {
  switch (category) {
    case "contacts":
      return (item.full_name as string) || (item.email as string) || (item.phone_number as string) || `Contact #${item.id}`;
    case "conversations": {
      const contact = item.contact as { full_name?: string } | null;
      const wa = item.whatsapp_contact as { push_name?: string; phone_number?: string } | null;
      return contact?.full_name || wa?.push_name || wa?.phone_number || `Conversation #${item.id}`;
    }
    case "leads": {
      const contact = item.contact as { full_name?: string } | null;
      return contact?.full_name || `Lead #${item.id}`;
    }
    case "deals":
      return (item.title as string) || `Deal #${item.id}`;
    case "tasks":
      return (item.title as string) || `Task #${item.id}`;
    default:
      return `#${item.id}`;
  }
}

function resultHref(category: SearchCategory, id: number): string {
  switch (category) {
    case "contacts":
      return `/contacts/${id}`;
    case "conversations":
      return `/inbox/${id}`;
    case "leads":
      return `/leads/${id}`;
    case "deals":
      return `/deals/${id}`;
    case "tasks":
      return `/tasks/${id}`;
    default:
      return "#";
  }
}

/**
 * Debounced global search bar, reachable from the topnav on every authenticated page
 * (docs/08-implementation-roadmap.md Phase 13 / repeated "Global search" spec callouts).
 * Shows a grouped-by-category dropdown with a "see all N results" link per category that
 * routes to /search?q=...&category=... for the fully paginated view.
 */
export function GlobalSearchBar() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { data, isLoading, isFetching } = useGlobalSearch(query);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const categories = data?.categories ?? {};
  const hasAnyResults = Object.values(categories).some((c) => c && c.total > 0);
  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative min-w-0 max-w-sm flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) {
            router.push(`/search?q=${encodeURIComponent(query.trim())}`);
            setOpen(false);
          }
          if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search contacts, conversations, leads, deals, tasks…"
        aria-label="Global search"
        className="w-full min-w-0 rounded-md border border-border bg-bg py-2 pl-9 pr-8 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setQuery("");
            setOpen(false);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {showDropdown && (
        <div className="absolute z-20 mt-1 max-h-[70vh] w-full min-w-[22rem] overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-xl">
          {(isLoading || isFetching) && (
            <div className="space-y-2 p-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-border/60" />
              ))}
            </div>
          )}

          {!isLoading && !hasAnyResults && (
            <p className="p-3 text-sm text-muted">No results for &ldquo;{query}&rdquo;.</p>
          )}

          {!isLoading &&
            CATEGORY_ORDER.filter((cat) => categories[cat] && categories[cat]!.total > 0).map((cat) => {
              const result = categories[cat]!;
              return (
                <div key={cat} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {SEARCH_CATEGORY_LABELS[cat]}
                    </span>
                    <span className="text-xs text-muted">{result.total}</span>
                  </div>
                  <ul>
                    {result.items.map((item) => (
                      <li key={item.id}>
                        <a
                          href={resultHref(cat, item.id)}
                          onClick={() => setOpen(false)}
                          className="block truncate rounded-md px-2 py-1.5 text-sm text-text hover:bg-primary-soft/50"
                        >
                          {highlightMatch(resultLabel(cat, item), query)}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {result.total > result.items.length && (
                    <a
                      href={`/search?q=${encodeURIComponent(query)}&category=${cat}`}
                      onClick={() => setOpen(false)}
                      className="mt-1 block px-2 py-1 text-xs font-medium text-primary hover:underline"
                    >
                      See all {result.total} {SEARCH_CATEGORY_LABELS[cat].toLowerCase()} results
                    </a>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
