import { describe, expect, it } from "vitest";
import {
  decodeCampaignSyncCursor,
  deriveCampaignMarketingState,
  encodeCampaignSyncCursor,
} from "./campaignSync";

describe("campaign sync helpers", () => {
  it("gives suppression states precedence over subscription history", () => {
    expect(
      deriveCampaignMarketingState({
        lifecycleStage: "subscriber",
        source: "Mailchimp Subscribed; Email Bounces",
        tags: ["Mailchimp Subscribed", "Email Bounce", "Do Not Market"],
      })
    ).toMatchObject({ status: "BOUNCED", subscribed: false, consentGiven: true });
  });

  it("recognizes active legacy subscribers", () => {
    expect(
      deriveCampaignMarketingState({
        lifecycleStage: "customer",
        source: "Mailchimp Subscribed",
        tags: [],
      })
    ).toEqual({
      status: "ACTIVE",
      subscribed: true,
      consentGiven: true,
      consentSource: "legacy:mailchimp",
    });
  });

  it("round trips incremental cursors", () => {
    const cursor = { updatedAt: "2026-07-28T20:00:00.000Z", id: "contact-id" };
    expect(decodeCampaignSyncCursor(encodeCampaignSyncCursor(cursor))).toEqual(cursor);
  });
});
