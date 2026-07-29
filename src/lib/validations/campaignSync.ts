import { z } from "zod";

export const CampaignContactUpsertSchema = z.object({
  externalContactId: z.string().min(1).max(128),
  email: z.string().email().max(320),
  firstName: z.string().max(100).nullish(),
  lastName: z.string().max(100).nullish(),
  phone: z.string().max(50).nullish(),
  source: z.string().max(200).nullish(),
  subscribed: z.boolean(),
  consentGiven: z.boolean(),
  consentAt: z.string().datetime().nullish(),
  consentSource: z.string().max(200).nullish(),
});

export const CampaignContactBatchSchema = z.object({
  contacts: z.array(CampaignContactUpsertSchema).min(1).max(200),
});

export const CampaignEventSchema = z.object({
  eventId: z.string().min(1).max(128),
  eventType: z.enum([
    "SENT",
    "DELIVERED",
    "OPENED",
    "CLICKED",
    "BOUNCED",
    "COMPLAINT",
    "UNSUBSCRIBED",
    "DROPPED",
  ]),
  crmContactId: z.string().uuid().nullish(),
  email: z.string().email().max(320).nullish(),
  occurredAt: z.string().datetime(),
  campaignId: z.string().max(128).nullish(),
  campaignName: z.string().max(200).nullish(),
  subject: z.string().max(500).nullish(),
  linkUrl: z.string().url().max(2048).nullish(),
  providerMessageId: z.string().max(256).nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => value.crmContactId || value.email, {
  message: "crmContactId or email is required",
});
