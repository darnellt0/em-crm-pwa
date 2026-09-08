import { z } from "zod";

export const CampaignContactUpsertSchema = z
  .object({
    externalContactId: z.string().min(1).max(128),
    // Phone-only contacts (Sunday Seeds is SMS-first) may have no email.
    email: z.string().email().max(320).nullish(),
    firstName: z.string().max(100).nullish(),
    lastName: z.string().max(100).nullish(),
    phone: z.string().max(50).nullish(),
    phoneNormalized: z.string().max(50).nullish(),
    source: z.string().max(200).nullish(),
    subscribed: z.boolean(),
    consentGiven: z.boolean(),
    consentAt: z.string().datetime().nullish(),
    consentSource: z.string().max(200).nullish(),
    smsConsentGiven: z.boolean().optional(),
    smsOptedOut: z.boolean().optional(),
    smsConsentAt: z.string().datetime().nullish(),
    tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  })
  .refine((value) => Boolean(value.email || value.phone || value.phoneNormalized), {
    message: "email or phone is required",
  });

export type CampaignContactUpsert = z.infer<typeof CampaignContactUpsertSchema>;

export const CampaignContactBatchSchema = z.object({
  contacts: z.array(CampaignContactUpsertSchema).min(1).max(200),
});

export const CAMPAIGN_EMAIL_EVENT_TYPES = [
  "SENT",
  "DELIVERED",
  "OPENED",
  "CLICKED",
  "BOUNCED",
  "COMPLAINT",
  "UNSUBSCRIBED",
  "DROPPED",
] as const;

export const CAMPAIGN_SMS_EVENT_TYPES = [
  "SMS_SENT",
  "SMS_FAILED",
  "SMS_OPT_OUT",
  "SMS_OPT_IN",
] as const;

export const CampaignEventTypeSchema = z.enum([
  ...CAMPAIGN_EMAIL_EVENT_TYPES,
  ...CAMPAIGN_SMS_EVENT_TYPES,
]);

export type CampaignEventType = z.infer<typeof CampaignEventTypeSchema>;

export const CampaignEventSchema = z
  .object({
    eventId: z.string().min(1).max(128),
    eventType: CampaignEventTypeSchema,
    crmContactId: z.string().uuid().nullish(),
    email: z.string().email().max(320).nullish(),
    phone: z.string().max(50).nullish(),
    occurredAt: z.string().datetime(),
    campaignId: z.string().max(128).nullish(),
    campaignName: z.string().max(200).nullish(),
    subject: z.string().max(500).nullish(),
    linkUrl: z.string().url().max(2048).nullish(),
    providerMessageId: z.string().max(256).nullish(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => value.crmContactId || value.email || value.phone, {
    message: "crmContactId, email, or phone is required",
  });

export type CampaignEvent = z.infer<typeof CampaignEventSchema>;
