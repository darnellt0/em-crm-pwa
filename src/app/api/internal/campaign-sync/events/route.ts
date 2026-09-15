import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizePhone } from "@/lib/phone/normalize";
import { requireCampaignSyncToken } from "@/lib/auth/requireCampaignSyncToken";
import { applySmsConsentTags } from "@/lib/campaignSync";
import {
  type CampaignEvent,
  CampaignEventSchema,
  type CampaignEventType,
} from "@/lib/validations/campaignSync";

export const dynamic = "force-dynamic";

const eventLabels: Record<string, string> = {
  SENT: "sent",
  DELIVERED: "delivered",
  OPENED: "opened",
  CLICKED: "clicked",
  BOUNCED: "bounced",
  COMPLAINT: "reported as spam",
  UNSUBSCRIBED: "unsubscribed",
  DROPPED: "dropped by provider",
};

function isSmsEvent(eventType: CampaignEventType) {
  return eventType.startsWith("SMS_");
}

function statusTags(eventType: string) {
  if (eventType === "BOUNCED") return ["Email Bounce", "Do Not Market"];
  if (eventType === "COMPLAINT") return ["Complained", "Do Not Market"];
  if (eventType === "UNSUBSCRIBED") return ["Unsubscribed", "Do Not Market"];
  return [];
}

/**
 * Applies the event's tag effects in place and reports whether tags may have
 * changed. Email suppression events add "Do Not Market" tags; SMS consent
 * events flow through applySmsConsentTags so "Do Not Text" always wins.
 */
function applyEventTags(eventType: CampaignEventType, tags: Set<string>) {
  if (eventType === "SMS_OPT_OUT") {
    applySmsConsentTags(tags, { smsOptedOut: true });
    return true;
  }
  if (eventType === "SMS_OPT_IN") {
    applySmsConsentTags(tags, { smsConsentGiven: true });
    return true;
  }
  const suppression = statusTags(eventType);
  suppression.forEach((tag) => tags.add(tag));
  return suppression.length > 0;
}

function metadataString(metadata: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function buildInteraction(event: CampaignEvent) {
  if (!isSmsEvent(event.eventType)) {
    const campaign = event.campaignName || event.subject || "Campaign email";
    return {
      type: "email",
      summary: `${campaign} ${eventLabels[event.eventType]}.`,
    };
  }

  const campaign = event.campaignName || event.subject || "Campaign text";
  switch (event.eventType) {
    case "SMS_SENT":
      return { type: "sms", summary: `${campaign} text sent.` };
    case "SMS_FAILED": {
      const reason = metadataString(event.metadata, ["error", "reason", "errorMessage"]);
      return {
        type: "sms",
        summary: `${campaign} text failed to send${reason ? ` (${reason})` : ""}.`,
      };
    }
    case "SMS_OPT_OUT":
      return { type: "sms", summary: "Opted out of SMS (STOP)." };
    case "SMS_OPT_IN":
      return { type: "sms", summary: "Opted in to SMS." };
    default:
      return { type: "sms", summary: `${campaign} ${event.eventType.toLowerCase()}.` };
  }
}

export async function POST(req: NextRequest) {
  const authError = requireCampaignSyncToken(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const parsed = CampaignEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Resolution order: CRM id, then email, then a unique normalized phone.
      let contact = parsed.data.crmContactId
        ? await tx.contact.findUnique({ where: { id: parsed.data.crmContactId } })
        : null;
      if (!contact && parsed.data.email) {
        contact = await tx.contact.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
      }
      const phoneNormalized = normalizePhone(parsed.data.phone);
      if (!contact && phoneNormalized) {
        const byPhone = await tx.contact.findMany({ where: { phoneNormalized }, take: 2 });
        contact = byPhone.length === 1 ? byPhone[0] : null;
      }

      await tx.campaignSyncReceipt.create({
        data: {
          externalEventId: parsed.data.eventId,
          eventType: parsed.data.eventType,
          contactId: contact?.id,
          payload: parsed.data as Prisma.InputJsonValue,
        },
      });

      if (!contact) return { matched: false, contactId: null };

      const tags = new Set(contact.tags);
      const occurredAt = new Date(parsed.data.occurredAt);
      const tagsChanged = applyEventTags(parsed.data.eventType, tags);
      if (tagsChanged) {
        // Suppression and consent are marketing signals only: add or remove
        // the relevant tags but never overwrite human-managed fields
        // (lifecycle stage, scheduled follow-ups). A bounced email or an SMS
        // STOP must not demote a customer to "lead".
        await tx.contact.update({
          where: { id: contact.id },
          data: {
            tags: Array.from(tags),
          },
        });
      }

      const interaction = buildInteraction(parsed.data);
      await tx.interaction.create({
        data: {
          contactId: contact.id,
          // Provider telemetry is not a person-to-person conversation.
          type: "campaign",
          summary: interaction.summary,
          outcome: parsed.data.eventType.toLowerCase(),
          occurredAt,
        },
      });

      return { matched: true, contactId: contact.id };
    });

    return NextResponse.json({ ok: true, duplicate: false, ...result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Campaign event ingestion failed" },
      { status: 500 }
    );
  }
}
