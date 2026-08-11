import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireCampaignSyncToken } from "@/lib/auth/requireCampaignSyncToken";
import { CampaignEventSchema } from "@/lib/validations/campaignSync";

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

function statusTags(eventType: string) {
  if (eventType === "BOUNCED") return ["Email Bounce", "Do Not Market"];
  if (eventType === "COMPLAINT") return ["Complained", "Do Not Market"];
  if (eventType === "UNSUBSCRIBED") return ["Unsubscribed", "Do Not Market"];
  return [];
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
      let contact = parsed.data.crmContactId
        ? await tx.contact.findUnique({ where: { id: parsed.data.crmContactId } })
        : null;
      if (!contact && parsed.data.email) {
        contact = await tx.contact.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
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
      const lastTouchAt =
        !contact.lastTouchAt || occurredAt > contact.lastTouchAt
          ? occurredAt
          : contact.lastTouchAt;
      statusTags(parsed.data.eventType).forEach((tag) => tags.add(tag));
      const suppress = statusTags(parsed.data.eventType).length > 0;
      if (suppress) {
        // Suppression is a marketing signal only: add the Do Not Market tags
        // but never overwrite human-managed fields (lifecycle stage, scheduled
        // follow-ups). A bounced email must not demote a customer to "lead".
        await tx.contact.update({
          where: { id: contact.id },
          data: {
            tags: Array.from(tags),
            lastTouchAt,
          },
        });
      } else {
        await tx.contact.update({
          where: { id: contact.id },
          data: { lastTouchAt },
        });
      }

      const campaign = parsed.data.campaignName || parsed.data.subject || "Campaign email";
      await tx.interaction.create({
        data: {
          contactId: contact.id,
          type: "email",
          summary: `${campaign} ${eventLabels[parsed.data.eventType]}.`,
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
