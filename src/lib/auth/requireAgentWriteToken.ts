import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

function tokensMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function requireAgentWriteToken(req: NextRequest): Response | null {
  const token = req.headers.get("x-agent-write-token")?.trim();
  const expected = process.env.OPENCLAW_WRITE_TOKEN?.trim();
  const readToken = process.env.INTERNAL_SERVICE_TOKEN?.trim();

  if (!expected) {
    return Response.json(
      { ok: false, error: "OPENCLAW_WRITE_TOKEN not configured" },
      { status: 503 }
    );
  }

  if (readToken && tokensMatch(expected, readToken)) {
    return Response.json(
      { ok: false, error: "Write token must differ from the read token" },
      { status: 503 }
    );
  }

  if (!token || !tokensMatch(token, expected)) {
    return Response.json(
      { ok: false, error: "Invalid or missing agent write token" },
      { status: 401 }
    );
  }

  return null;
}
