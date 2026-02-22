"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Brain, Pin, User } from "lucide-react";

export default function SemanticSearchPage() {
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, loading } = useApi<any>(
    searchQuery ? `/api/memory/search?q=${encodeURIComponent(searchQuery)}&limit=20` : null,
    [searchQuery]
  );

  const results = data?.results || [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchQuery(query.trim());
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Search className="h-6 w-6" />
          Semantic Search
        </h1>
        <p className="text-muted-foreground">
          Search across approved memories using natural language. Results are ranked by meaning similarity.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3 max-w-2xl">
        <div className="relative flex-1">
          <Brain className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ask anything about your contacts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? "Searching..." : "Search"}
        </Button>
      </form>

      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse bg-muted rounded" />
          ))}
        </div>
      )}

      {!loading && searchQuery && results.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">No matching memories found</p>
          <p className="text-sm">
            Try a different query, or ensure memories have been approved and embedded.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {results.length} results for &ldquo;{searchQuery}&rdquo;
          </p>
          {results.map((r: any, idx: number) => (
            <Card key={r.memoryItemId} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted text-sm font-medium shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {r.isPinned && (
                        <Pin className="h-3 w-3 text-primary" />
                      )}
                      <Link
                        href={`/contacts/${r.contactId}`}
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        <User className="h-3 w-3" />
                        {r.contactName}
                      </Link>
                      <Badge variant="secondary" className="text-xs">
                        {(r.similarity * 100).toFixed(1)}% match
                      </Badge>
                    </div>
                    <p className="text-sm">{r.content}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
