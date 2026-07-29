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

export function requireCampaignSyncToken(req: NextRequest): Response | null {
  const expected = process.env.CAMPAIGN_STUDIO_SYNC_TOKEN?.trim();
  if (!expected) {
    return Response.json(
      { ok: false, error: "CAMPAIGN_STUDIO_SYNC_TOKEN not configured" },
      { status: 500 }
    );
  }

  const actual = req.headers.get("x-campaign-sync-token")?.trim() ?? "";
  if (!actual || !tokensMatch(actual, expected)) {
    return Response.json(
      { ok: false, error: "Invalid or missing campaign sync token" },
      { status: 401 }
    );
  }

  return null;
}
