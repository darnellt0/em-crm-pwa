"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { Input } from "@/components/ui/input";

// Searchable contact selector for dialog forms. Renders a native <select>
// (so form required/FormData semantics keep working) fed by the server-side
// contact search, since the contacts API caps any single page at 100 rows.
export function ContactPicker({
  name = "contactId",
  id = "contact-picker",
  required = false,
}: {
  name?: string;
  id?: string;
  required?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, loading } = useApi<any>(
    `/api/contacts?q=${encodeURIComponent(query)}&limit=100`
  );
  const contacts = data?.items || [];
  const total = data?.total ?? contacts.length;

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search contacts by name, email, or phone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search contacts"
      />
      <select
        id={id}
        name={name}
        required={required}
        defaultValue=""
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="" disabled>
          {loading
            ? "Loading contacts…"
            : contacts.length === 0
              ? "No matching contacts"
              : "Select a contact…"}
        </option>
        {contacts.map((c: any) => (
          <option key={c.id} value={c.id}>
            {[c.firstName, c.lastName].filter(Boolean).join(" ") ||
              c.email ||
              c.phone ||
              "Unnamed contact"}
            {c.email ? ` — ${c.email}` : ""}
          </option>
        ))}
      </select>
      {total > contacts.length && (
        <p className="text-xs text-muted-foreground">
          Showing {contacts.length} of {total} contacts — type to narrow the list.
        </p>
      )}
    </div>
  );
}
