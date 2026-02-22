import { NextRequest } from "next/server";

export function requireInternalToken(req: NextRequest): Response | null {
  const token = req.headers.get("x-internal-token");
  const expected = process.env.INTERNAL_SERVICE_TOKEN;

  if (!expected) {
    return new Response(
      JSON.stringify({ ok: false, error: "INTERNAL_SERVICE_TOKEN not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!token || token !== expected) {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid or missing internal token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return null; // Token is valid
}
