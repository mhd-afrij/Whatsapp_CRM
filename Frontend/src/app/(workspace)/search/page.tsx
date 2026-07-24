"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search as SearchIcon, User, Target, CheckSquare, MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { authFetch } from "@/stores/auth-store";

interface SearchResults {
  customers: { id: number; name: string; phone: string | null; email: string | null }[];
  leads: { id: number; title: string; customer_name: string; stage: string }[];
  tasks: { id: number; title: string; status: string; due_at: string | null }[];
  conversations: { id: number; contact_name: string | null; contact_phone: string; status: string }[];
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const navigate = useNavigate();

  const { data, isFetching } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => authFetch<SearchResults>(`/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.length >= 2,
  });

  const totalResults = data
    ? data.customers.length + data.leads.length + data.tasks.length + data.conversations.length
    : 0;

  return (
    <div>
      <PageHeader title="Search" description="Search conversations, customers, leads, and tasks." />

      <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5 mb-6">
        <SearchIcon size={16} className="text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search everything…"
          autoFocus
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
        />
      </div>

      {debouncedQuery.length < 2 && (
        <EmptyState icon={SearchIcon} title="Start typing to search" description="Enter at least 2 characters." />
      )}

      {debouncedQuery.length >= 2 && !isFetching && totalResults === 0 && (
        <EmptyState icon={SearchIcon} title={`No results for "${debouncedQuery}"`} description="Try a different search term." />
      )}

      {data && totalResults > 0 && (
        <div className="space-y-6">
          <ResultSection
            title="Customers"
            icon={User}
            items={data.customers}
            onSelect={() => navigate("/customers")}
            render={(c) => ({ primary: c.name, secondary: c.phone ?? c.email ?? "" })}
          />
          <ResultSection
            title="Leads"
            icon={Target}
            items={data.leads}
            onSelect={() => navigate("/pipeline")}
            render={(l) => ({ primary: l.title, secondary: `${l.customer_name} · ${l.stage}` })}
          />
          <ResultSection
            title="Tasks"
            icon={CheckSquare}
            items={data.tasks}
            onSelect={() => navigate("/tasks")}
            render={(t) => ({ primary: t.title, secondary: t.status })}
          />
          <ResultSection
            title="Conversations"
            icon={MessageCircle}
            items={data.conversations}
            onSelect={() => navigate("/inbox")}
            render={(c) => ({ primary: c.contact_name ?? c.contact_phone, secondary: c.status })}
          />
        </div>
      )}
    </div>
  );
}

function ResultSection<T extends { id: number }>({
  title,
  icon: Icon,
  items,
  render,
  onSelect,
}: {
  title: string;
  icon: typeof User;
  items: T[];
  render: (item: T) => { primary: string; secondary: string };
  onSelect: (item: T) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">{title}</p>
      <div className="rounded-[10px] border border-border overflow-hidden divide-y divide-border-muted">
        {items.map((item) => {
          const { primary, secondary } = render(item);
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover"
            >
              <Icon size={15} className="text-text-muted shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-text-primary truncate">{primary}</p>
                <p className="text-xs text-text-muted truncate">{secondary}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
