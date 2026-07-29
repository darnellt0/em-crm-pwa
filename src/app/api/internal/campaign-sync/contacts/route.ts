import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizePhone } from "@/lib/phone/normalize";
import { requireCampaignSyncToken } from "@/lib/auth/requireCampaignSyncToken";
import {
  decodeCampaignSyncCursor,
  deriveCampaignMarketingState,
  encodeCampaignSyncCursor,
} from "@/lib/campaignSync";
import { CampaignContactBatchSchema } from "@/lib/validations/campaignSync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireCampaignSyncToken(req);
  if (authError) return authError;

  try {
    const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 100));
    const cursorValue = req.nextUrl.searchParams.get("cursor");
    const cursor = cursorValue ? decodeCampaignSyncCursor(cursorValue) : null;
    const where: Prisma.ContactWhereInput = {
      email: { not: null },
      ...(cursor
        ? {
            OR: [
              { updatedAt: { gt: new Date(cursor.updatedAt) } },
              {
                updatedAt: new Date(cursor.updatedAt),
                id: { gt: cursor.id },
              },
            ],
          }
        : {}),
    };

    const rows = await prisma.contact.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        source: true,
        lifecycleStage: true,
        tags: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.at(-1);

    return NextResponse.json({
      ok: true,
      contacts: page.map((contact) => ({
        crmContactId: contact.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        source: contact.source,
        lifecycleStage: contact.lifecycleStage,
        tags: contact.tags,
        updatedAt: contact.updatedAt.toISOString(),
        ...deriveCampaignMarketingState(contact),
      })),
      hasMore,
      nextCursor: last
        ? encodeCampaignSyncCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id })
        : cursorValue,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Campaign contact export failed" },
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authError = requireCampaignSyncToken(req);
  if (authError) return authError;

  const parsed = CampaignContactBatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const defaultOwnerEmail = process.env.CAMPAIGN_SYNC_DEFAULT_OWNER_EMAIL?.trim().toLowerCase();
    const defaultOwner = defaultOwnerEmail
      ? await prisma.user.findUnique({ where: { email: defaultOwnerEmail }, select: { id: true } })
      : null;

    const mappings = await prisma.$transaction(async (tx) => {
      const results: { externalContactId: string; crmContactId: string }[] = [];

      for (const incoming of parsed.data.contacts) {
        const email = incoming.email.trim().toLowerCase();
        const existing = await tx.contact.findUnique({ where: { email } });
        let phone = incoming.phone?.trim() || null;
        let phoneNormalized = normalizePhone(phone);
        if (phoneNormalized) {
          const phoneOwner = await tx.contact.findUnique({
            where: { phoneNormalized },
            select: { id: true },
          });
          if (phoneOwner && phoneOwner.id !== existing?.id) {
            phone = null;
            phoneNormalized = null;
          }
        }

        const existingTags = new Set(existing?.tags ?? []);
        existingTags.add("Campaign Studio");
        if (incoming.consentGiven) existingTags.add("Marketing Consent");
        const isSuppressed = existingTags.has("Do Not Market");
        const lifecycleStage =
          existing && existing.lifecycleStage !== "lead"
            ? existing.lifecycleStage
            : incoming.subscribed && incoming.consentGiven && !isSuppressed
              ? "subscriber"
              : existing?.lifecycleStage ?? "lead";

        const data = {
          firstName: incoming.firstName?.trim() || existing?.firstName || null,
          lastName: incoming.lastName?.trim() || existing?.lastName || null,
          phone: phone ?? existing?.phone ?? null,
          phoneNormalized: phoneNormalized ?? existing?.phoneNormalized ?? null,
          source: incoming.source?.trim() || existing?.source || "Campaign Studio",
          lifecycleStage,
          tags: Array.from(existingTags),
        };

        const contact = existing
          ? await tx.contact.update({ where: { id: existing.id }, data })
          : await tx.contact.create({
              data: {
                email,
                ...data,
                ownerUserId: defaultOwner?.id,
              },
            });

        results.push({ externalContactId: incoming.externalContactId, crmContactId: contact.id });
      }

      return results;
    });

    return NextResponse.json({ ok: true, mappings });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Campaign contact import failed" },
      { status: 500 }
    );
  }
}
