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
