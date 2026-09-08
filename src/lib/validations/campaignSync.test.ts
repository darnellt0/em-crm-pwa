import { describe, expect, it } from "vitest";
import {
  CampaignContactBatchSchema,
  CampaignContactUpsertSchema,
  CampaignEventSchema,
} from "./campaignSync";

const baseContact = {
  externalContactId: "ext_1",
  subscribed: false,
  consentGiven: false,
};

describe("CampaignContactUpsertSchema", () => {
  it("accepts an email-only contact", () => {
    expect(
      CampaignContactUpsertSchema.safeParse({ ...baseContact, email: "person@example.com" }).success
    ).toBe(true);
  });

  it("accepts a phone-only contact with a null email", () => {
    const result = CampaignContactUpsertSchema.safeParse({
      ...baseContact,
      email: null,
      phone: "(555) 123-4567",
      smsConsentGiven: true,
      smsConsentAt: "2026-09-01T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a contact identified only by phoneNormalized", () => {
    expect(
      CampaignContactUpsertSchema.safeParse({ ...baseContact, phoneNormalized: "+15551234567" })
        .success
    ).toBe(true);
  });

  it("rejects a contact with neither email nor phone", () => {
    const result = CampaignContactUpsertSchema.safeParse({ ...baseContact, email: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("email or phone is required");
    }
  });

  it("still requires a valid email when one is present", () => {
    expect(
      CampaignContactUpsertSchema.safeParse({
        ...baseContact,
        email: "not-an-email",
        phone: "5551234567",
      }).success
    ).toBe(false);
  });

  it("accepts SMS consent fields and verbatim tags", () => {
    const result = CampaignContactUpsertSchema.safeParse({
      ...baseContact,
      phone: "5551234567",
      smsConsentGiven: true,
      smsOptedOut: false,
      smsConsentAt: "2026-09-01T12:00:00.000Z",
      tags: ["Sunday Seeds", " Cohort 4 "],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual(["Sunday Seeds", "Cohort 4"]);
    }
  });

  it("rejects malformed SMS fields", () => {
    expect(
      CampaignContactUpsertSchema.safeParse({
        ...baseContact,
        phone: "5551234567",
        smsConsentGiven: "yes",
      }).success
    ).toBe(false);
    expect(
      CampaignContactUpsertSchema.safeParse({
        ...baseContact,
        phone: "5551234567",
        smsConsentAt: "yesterday",
      }).success
    ).toBe(false);
  });

  it("limits tags to 20 entries of 1-80 characters", () => {
    expect(
      CampaignContactUpsertSchema.safeParse({
        ...baseContact,
        phone: "5551234567",
        tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`),
      }).success
    ).toBe(false);
    expect(
      CampaignContactUpsertSchema.safeParse({
        ...baseContact,
        phone: "5551234567",
        tags: ["x".repeat(81)],
      }).success
    ).toBe(false);
    expect(
      CampaignContactUpsertSchema.safeParse({
        ...baseContact,
        phone: "5551234567",
        tags: ["   "],
      }).success
    ).toBe(false);
  });

  it("validates each contact inside a batch", () => {
    expect(
      CampaignContactBatchSchema.safeParse({
        contacts: [
          { ...baseContact, email: "a@example.com" },
          { ...baseContact, externalContactId: "ext_2", phone: "5551234567" },
        ],
      }).success
    ).toBe(true);
    expect(
      CampaignContactBatchSchema.safeParse({
        contacts: [{ ...baseContact, email: null, phone: null }],
      }).success
    ).toBe(false);
  });
});

describe("CampaignEventSchema", () => {
  const baseEvent = {
    eventId: "evt_1",
    occurredAt: "2026-09-01T12:00:00.000Z",
  };

  it.each(["SMS_SENT", "SMS_FAILED", "SMS_OPT_OUT", "SMS_OPT_IN"])(
    "accepts the %s event type",
    (eventType) => {
      expect(
        CampaignEventSchema.safeParse({ ...baseEvent, eventType, phone: "+15551234567" }).success
      ).toBe(true);
    }
  );

  it("still accepts the email event types", () => {
    expect(
      CampaignEventSchema.safeParse({ ...baseEvent, eventType: "OPENED", email: "a@example.com" })
        .success
    ).toBe(true);
  });

  it("rejects unknown event types", () => {
    expect(
      CampaignEventSchema.safeParse({ ...baseEvent, eventType: "SMS_DELIVERED", phone: "555" })
        .success
    ).toBe(false);
  });

  it("accepts phone as the only identifier", () => {
    expect(
      CampaignEventSchema.safeParse({ ...baseEvent, eventType: "SMS_OPT_OUT", phone: "5551234567" })
        .success
    ).toBe(true);
  });

  it("requires crmContactId, email, or phone", () => {
    const result = CampaignEventSchema.safeParse({ ...baseEvent, eventType: "SMS_SENT" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("crmContactId, email, or phone is required");
    }
  });
});
