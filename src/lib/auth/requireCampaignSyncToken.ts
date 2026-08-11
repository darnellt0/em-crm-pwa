import { NextRequest } from "next/server";
import { isConfiguredToken, tokensMatch } from "@/lib/auth/tokens";

export function requireCampaignSyncToken(req: NextRequest): Response | null {
  const expected = process.env.CAMPAIGN_STUDIO_SYNC_TOKEN;
  if (!isConfiguredToken(expected)) {
    return Response.json(
      { ok: false, error: "CAMPAIGN_STUDIO_SYNC_TOKEN not configured" },
      { status: 500 }
    );
  }

  const actual = req.headers.get("x-campaign-sync-token")?.trim() ?? "";
  if (!actual || !tokensMatch(actual, expected.trim())) {
    return Response.json(
      { ok: false, error: "Invalid or missing campaign sync token" },
      { status: 401 }
    );
  }

  return null;
}
