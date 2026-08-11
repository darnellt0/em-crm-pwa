"use client";

import { useState, useEffect, useCallback } from "react";

// API routes return either a string error or a zod flatten() object
// ({ formErrors: string[], fieldErrors: Record<string, string[]> }).
// Always surface something a human can read in a toast.
export function formatApiError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const { formErrors, fieldErrors } = error as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[]>;
    };
    const parts: string[] = [];
    if (Array.isArray(formErrors)) parts.push(...formErrors);
    if (fieldErrors && typeof fieldErrors === "object") {
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (Array.isArray(messages) && messages.length > 0) {
          parts.push(`${field}: ${messages.join(", ")}`);
        }
      }
    }
    if (parts.length > 0) return parts.join("; ");
  }
  return "Request failed";
}

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!json.ok) throw new Error(formatApiError(json.error));
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export async function apiPost<T = any>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(formatApiError(json.error));
  return json;
}

export async function apiPatch<T = any>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(formatApiError(json.error));
  return json;
}
