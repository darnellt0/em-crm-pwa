import { NextRequest } from "next/server";
import { isConfiguredToken, tokensMatch } from "@/lib/auth/tokens";

export function requireAgentWriteToken(req: NextRequest): Response | null {
  const token = req.headers.get("x-agent-write-token")?.trim();
  const expected = process.env.OPENCLAW_WRITE_TOKEN;
  const readToken = process.env.INTERNAL_SERVICE_TOKEN?.trim();

  if (!isConfiguredToken(expected)) {
    return Response.json(
      { ok: false, error: "OPENCLAW_WRITE_TOKEN not configured" },
      { status: 503 }
    );
  }

  if (readToken && tokensMatch(expected.trim(), readToken)) {
    return Response.json(
      { ok: false, error: "Write token must differ from the read token" },
      { status: 503 }
    );
  }

  if (!token || !tokensMatch(token, expected.trim())) {
    return Response.json(
      { ok: false, error: "Invalid or missing agent write token" },
      { status: 401 }
    );
  }

  return null;
}
