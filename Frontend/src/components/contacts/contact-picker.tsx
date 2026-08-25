"use client";

import { useEffect, useState } from "react";
import { useContactList } from "@/hooks/use-contacts";

/**
 * Debounced search-select for picking a single contact by name/email/phone.
 * Used by creation forms (leads, deals) that require a contact_id.
 */
export function ContactPicker({
  value,
  onChange,
  hasError,
}: {
  value: number | null;
  onChange: (contactId: number | null) => void;
  hasError?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useContactList({
    search: debouncedQuery || undefined,
    per_page: 10,
  });
  const results = data?.data ?? [];
  const selected = results.find((c) => c.id === value);

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? query : selected?.full_name || (value ? `Contact #${value}` : query)}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search contacts by name, email, or phone…"
        className={
          "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary" +
          (hasError ? " border-danger focus:border-danger focus:ring-danger" : "")
        }
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
          {isLoading && <p className="px-3 py-2 text-xs text-muted">Searching…</p>}
          {!isLoading && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">No contacts found.</p>
          )}
          {results.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(contact.id);
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-primary-soft/50"
            >
              <span className="text-text">{contact.full_name || `Contact #${contact.id}`}</span>
              <span className="text-xs text-muted">{contact.email || contact.phone_number || "—"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
