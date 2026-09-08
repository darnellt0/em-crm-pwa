export type CampaignMarketingStatus =
  | "ACTIVE"
  | "UNSUBSCRIBED"
  | "BOUNCED"
  | "COMPLAINED"
  | "SUPPRESSED";

export function deriveCampaignMarketingState(contact: {
  lifecycleStage: string;
  source: string | null;
  tags: string[];
}) {
  const tags = new Set(contact.tags);
  const source = contact.source ?? "";
  let status: CampaignMarketingStatus = "ACTIVE";

  if (tags.has("Email Bounce") || /Email Bounces/i.test(source)) status = "BOUNCED";
  else if (tags.has("Unsubscribed") || /Mailchimp Unsubscribed/i.test(source)) status = "UNSUBSCRIBED";
  else if (tags.has("Complained")) status = "COMPLAINED";
  else if (tags.has("Do Not Market")) status = "SUPPRESSED";

  const legacyConsent = tags.has("Mailchimp Subscribed") || /Mailchimp Subscribed/i.test(source);
  const consentGiven = legacyConsent || contact.lifecycleStage === "subscriber";
  const subscribed = status === "ACTIVE" && consentGiven;

  return {
    status,
    subscribed,
    consentGiven,
    consentSource: legacyConsent ? "legacy:mailchimp" : consentGiven ? "crm:lifecycle" : null,
  };
}

/**
 * SMS consent tags. The CRM is the system of record for relationship tags, so
 * Campaign Studio only ever sees SMS state derived from these two tags.
 *
 * Consent rule: "Do Not Text" wins over opt-in. A contact carrying "Do Not
 * Text" is never considered SMS-consented, and sync must never remove it.
 */
export const SMS_OPT_OUT_TAG = "Do Not Text";
export const SMS_OPT_IN_TAG = "SMS Opt-In";

export function deriveSmsState(contact: { tags: string[] }) {
  const tags = new Set(contact.tags);
  const smsOptedOut = tags.has(SMS_OPT_OUT_TAG);
  const smsConsentGiven = tags.has(SMS_OPT_IN_TAG) && !smsOptedOut;

  return {
    smsConsentGiven,
    smsOptedOut,
    smsConsentSource: smsConsentGiven ? "crm:tag" : null,
  };
}

/**
 * Applies an inbound SMS consent signal to a contact's tag set, in place.
 *
 * - opt-out adds "Do Not Text" and removes "SMS Opt-In"
 * - opt-in adds "SMS Opt-In" only when "Do Not Text" is absent
 * - "Do Not Text" is never removed by sync, and the two tags are never
 *   allowed to coexist (an inbound "SMS Opt-In" tag cannot override a
 *   stored opt-out).
 */
export function applySmsConsentTags(
  tags: Set<string>,
  signal: { smsOptedOut?: boolean | null; smsConsentGiven?: boolean | null }
) {
  if (signal.smsOptedOut) {
    tags.add(SMS_OPT_OUT_TAG);
  } else if (signal.smsConsentGiven && !tags.has(SMS_OPT_OUT_TAG)) {
    tags.add(SMS_OPT_IN_TAG);
  }
  if (tags.has(SMS_OPT_OUT_TAG)) tags.delete(SMS_OPT_IN_TAG);
  return tags;
}

export interface CampaignSyncCursor {
  updatedAt: string;
  id: string;
}

export function encodeCampaignSyncCursor(cursor: CampaignSyncCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCampaignSyncCursor(value: string): CampaignSyncCursor {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (
    !parsed ||
    typeof parsed.id !== "string" ||
    typeof parsed.updatedAt !== "string" ||
    Number.isNaN(new Date(parsed.updatedAt).getTime())
  ) {
    throw new Error("Invalid campaign sync cursor");
  }
  return parsed;
}
