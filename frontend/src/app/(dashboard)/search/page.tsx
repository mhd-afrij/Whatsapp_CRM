"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useGlobalSearch, useSearchCategoryResults } from "@/hooks/use-search";
import { highlightMatch } from "@/components/search/highlight-match";
import { SEARCH_CATEGORY_LABELS, type SearchCategory } from "@/lib/search-api";

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

function CategoryResultsList({ query, category }: { query: string; category: SearchCategory }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useSearchCategoryResults(query, category, page, 15);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-border/60" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-danger">Unable to load {SEARCH_CATEGORY_LABELS[category].toLowerCase()} results.</p>;
  }

  if (!data || data.items.length === 0) {
    return <p className="text-sm text-muted">No {SEARCH_CATEGORY_LABELS[category].toLowerCase()} match &ldquo;{query}&rdquo;.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {data.items.map((item) => (
          <li key={item.id}>
            <Link
              href={resultHref(category, item.id)}
              className="block px-4 py-3 text-sm text-text hover:bg-primary-soft/40"
            >
              {highlightMatch(resultLabel(category, item), query)}
            </Link>
          </li>
        ))}
      </ul>
      {data.meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Page {data.meta.page} of {data.meta.last_page} ({data.meta.total} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= data.meta.last_page}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchResultsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const query = params?.get("q") ?? "";
  const categoryParam = params?.get("category") as SearchCategory | null;

  const breakdown = useGlobalSearch(categoryParam ? "" : query); // skip breakdown fetch while in single-category mode
  const categories = breakdown.data?.categories ?? {};

  const goToCategory = (cat: SearchCategory | null) => {
    const url = cat ? `/search?q=${encodeURIComponent(query)}&category=${cat}` : `/search?q=${encodeURIComponent(query)}`;
    router.push(url);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Search results</h1>
        <p className="mt-1 text-sm text-muted">
          {query ? (
            <>
              Showing results for <span className="font-medium text-text">&ldquo;{query}&rdquo;</span>
            </>
          ) : (
            "Enter a search term using the search bar above."
          )}
        </p>
      </div>

      {query && (
        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          <button
            type="button"
            onClick={() => goToCategory(null)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${!categoryParam ? "bg-primary text-white" : "border border-border text-muted hover:text-text"}`}
          >
            All
          </button>
          {CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => goToCategory(cat)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${categoryParam === cat ? "bg-primary text-white" : "border border-border text-muted hover:text-text"}`}
            >
              {SEARCH_CATEGORY_LABELS[cat]}
              {categories[cat] ? ` (${categories[cat]!.total})` : ""}
            </button>
          ))}
        </div>
      )}

      {query && categoryParam && <CategoryResultsList query={query} category={categoryParam} />}

      {query && !categoryParam && (
        <div className="space-y-6">
          {breakdown.isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-border/60" />
              ))}
            </div>
          )}
          {!breakdown.isLoading && CATEGORY_ORDER.every((cat) => !categories[cat] || categories[cat]!.total === 0) && (
            <p className="text-sm text-muted">No results found for &ldquo;{query}&rdquo; across any category.</p>
          )}
          {!breakdown.isLoading &&
            CATEGORY_ORDER.filter((cat) => categories[cat] && categories[cat]!.total > 0).map((cat) => (
              <section key={cat}>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                    {SEARCH_CATEGORY_LABELS[cat]} ({categories[cat]!.total})
                  </h2>
                  <button
                    type="button"
                    onClick={() => goToCategory(cat)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    See all
                  </button>
                </div>
                <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                  {categories[cat]!.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={resultHref(cat, item.id)}
                        className="block px-4 py-3 text-sm text-text hover:bg-primary-soft/40"
                      >
                        {highlightMatch(resultLabel(cat, item), query)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading...</p>}>
      <SearchResultsPage />
    </Suspense>
  );
}

