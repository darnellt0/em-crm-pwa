import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireCampaignSyncToken } from "./requireCampaignSyncToken";

const originalSyncToken = process.env.CAMPAIGN_STUDIO_SYNC_TOKEN;

function request(token?: string) {
  return new NextRequest("http://localhost/api/internal/campaign-sync/contacts", {
    headers: token ? { "x-campaign-sync-token": token } : {},
  });
}

beforeEach(() => {
  delete process.env.CAMPAIGN_STUDIO_SYNC_TOKEN;
});

afterEach(() => {
  if (originalSyncToken === undefined) {
    delete process.env.CAMPAIGN_STUDIO_SYNC_TOKEN;
  } else {
    process.env.CAMPAIGN_STUDIO_SYNC_TOKEN = originalSyncToken;
  }
});

describe("requireCampaignSyncToken", () => {
  it("fails closed when the token is not configured", () => {
    expect(requireCampaignSyncToken(request())?.status).toBe(500);
  });

  it("rejects missing and incorrect credentials", () => {
    process.env.CAMPAIGN_STUDIO_SYNC_TOKEN = "a-long-random-sync-token";
    expect(requireCampaignSyncToken(request())?.status).toBe(401);
    expect(requireCampaignSyncToken(request("wrong-token"))?.status).toBe(401);
  });

  it("accepts the configured credential", () => {
    process.env.CAMPAIGN_STUDIO_SYNC_TOKEN = "a-long-random-sync-token";
    expect(requireCampaignSyncToken(request("a-long-random-sync-token"))).toBeNull();
  });
});
