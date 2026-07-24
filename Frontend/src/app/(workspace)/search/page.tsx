"use client";

import { useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function SearchPage() {
  const [query, setQuery] = useState("");

  return (
    <div>
      <PageHeader title="Search" description="Search conversations, customers, leads, tasks, and notes." />

      <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5 mb-6">
        <SearchIcon size={16} className="text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search everything…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
        />
        <kbd className="text-xs rounded border border-border px-1.5 py-0.5 text-text-muted">Ctrl K</kbd>
      </div>

      <EmptyState
        icon={SearchIcon}
        title={query ? `No results for "${query}"` : "Start typing to search"}
        description="Full-text search across messages, customers, leads, tasks, and notes lands in Phase 5."
      />
    </div>
  );
}
