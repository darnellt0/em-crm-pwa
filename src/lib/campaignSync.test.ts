import { describe, expect, it } from "vitest";
import {
  applySmsConsentTags,
  decodeCampaignSyncCursor,
  deriveCampaignMarketingState,
  deriveSmsState,
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

describe("deriveSmsState", () => {
  it("reports no consent for contacts without SMS tags", () => {
    expect(deriveSmsState({ tags: ["Campaign Studio"] })).toEqual({
      smsConsentGiven: false,
      smsOptedOut: false,
      smsConsentSource: null,
    });
  });

  it("derives consent from the SMS Opt-In tag", () => {
    expect(deriveSmsState({ tags: ["SMS Opt-In"] })).toEqual({
      smsConsentGiven: true,
      smsOptedOut: false,
      smsConsentSource: "crm:tag",
    });
  });

  it("lets Do Not Text win over opt-in", () => {
    expect(deriveSmsState({ tags: ["SMS Opt-In", "Do Not Text"] })).toEqual({
      smsConsentGiven: false,
      smsOptedOut: true,
      smsConsentSource: null,
    });
  });

  it("treats Do Not Text alone as an opt-out", () => {
    expect(deriveSmsState({ tags: ["Do Not Text"] })).toMatchObject({
      smsConsentGiven: false,
      smsOptedOut: true,
    });
  });
});

describe("applySmsConsentTags", () => {
  it("adds SMS Opt-In when consent is given and no opt-out exists", () => {
    const tags = applySmsConsentTags(new Set(["Campaign Studio"]), { smsConsentGiven: true });
    expect([...tags].sort()).toEqual(["Campaign Studio", "SMS Opt-In"]);
  });

  it("ignores opt-in when the contact already has Do Not Text", () => {
    const tags = applySmsConsentTags(new Set(["Do Not Text"]), { smsConsentGiven: true });
    expect([...tags]).toEqual(["Do Not Text"]);
  });

  it("adds Do Not Text and removes SMS Opt-In on opt-out", () => {
    const tags = applySmsConsentTags(new Set(["SMS Opt-In", "VIP"]), { smsOptedOut: true });
    expect([...tags].sort()).toEqual(["Do Not Text", "VIP"]);
  });

  it("prefers opt-out when both signals arrive together", () => {
    const tags = applySmsConsentTags(new Set(), { smsOptedOut: true, smsConsentGiven: true });
    expect([...tags]).toEqual(["Do Not Text"]);
  });

  it("never removes Do Not Text, even when the signal says consent is not given", () => {
    const tags = applySmsConsentTags(new Set(["Do Not Text"]), {
      smsOptedOut: false,
      smsConsentGiven: false,
    });
    expect([...tags]).toEqual(["Do Not Text"]);
  });

  it("strips a stray SMS Opt-In that coexists with Do Not Text", () => {
    const tags = applySmsConsentTags(new Set(["Do Not Text", "SMS Opt-In"]), {});
    expect([...tags]).toEqual(["Do Not Text"]);
  });

  it("leaves tags untouched when no SMS signal is present", () => {
    const tags = applySmsConsentTags(new Set(["VIP"]), {});
    expect([...tags]).toEqual(["VIP"]);
  });
});
