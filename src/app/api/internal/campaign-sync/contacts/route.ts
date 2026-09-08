import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizePhone } from "@/lib/phone/normalize";
import { requireCampaignSyncToken } from "@/lib/auth/requireCampaignSyncToken";
import {
  applySmsConsentTags,
  decodeCampaignSyncCursor,
  deriveCampaignMarketingState,
  deriveSmsState,
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
      AND: [
        // Reachable by at least one channel: email campaigns or SMS.
        { OR: [{ email: { not: null } }, { phoneNormalized: { not: null } }] },
        ...(cursor
          ? [
              {
                OR: [
                  { updatedAt: { gt: new Date(cursor.updatedAt) } },
                  {
                    updatedAt: new Date(cursor.updatedAt),
                    id: { gt: cursor.id },
                  },
                ],
              },
            ]
          : []),
      ],
    };

    const rows = await prisma.contact.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        phoneNormalized: true,
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
        phoneNormalized: contact.phoneNormalized,
        source: contact.source,
        lifecycleStage: contact.lifecycleStage,
        tags: contact.tags,
        updatedAt: contact.updatedAt.toISOString(),
        ...deriveCampaignMarketingState(contact),
        ...deriveSmsState(contact),
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
        const email = incoming.email?.trim().toLowerCase() || null;
        const phone = incoming.phone?.trim() || null;
        const phoneNormalized = normalizePhone(phone ?? incoming.phoneNormalized);

        // Matching order: lowercased email, then a unique phoneNormalized
        // match, else create. The phone fallback is skipped when it would
        // pair an incoming email with a contact that already owns a
        // different email (two people sharing a number must stay separate).
        let existing = email ? await tx.contact.findUnique({ where: { email } }) : null;
        if (!existing && phoneNormalized) {
          const byPhone = await tx.contact.findMany({ where: { phoneNormalized }, take: 2 });
          const candidate = byPhone.length === 1 ? byPhone[0] : null;
          if (candidate && (!email || !candidate.email)) existing = candidate;
        }

        const tags = new Set(existing?.tags ?? []);
        tags.add("Campaign Studio");
        if (incoming.consentGiven) tags.add("Marketing Consent");
        for (const tag of incoming.tags ?? []) tags.add(tag);
        applySmsConsentTags(tags, incoming);

        const isSuppressed = tags.has("Do Not Market");
        const lifecycleStage =
          existing && existing.lifecycleStage !== "lead"
            ? existing.lifecycleStage
            : incoming.subscribed && incoming.consentGiven && !isSuppressed
              ? "subscriber"
              : existing?.lifecycleStage ?? "lead";

        const data = {
          firstName: incoming.firstName?.trim() || existing?.firstName || null,
          lastName: incoming.lastName?.trim() || existing?.lastName || null,
          // Fall back to the E.164 value so a phoneNormalized-only contact still shows a number.
          phone: phone ?? existing?.phone ?? phoneNormalized ?? null,
          phoneNormalized: phoneNormalized ?? existing?.phoneNormalized ?? null,
          source: incoming.source?.trim() || existing?.source || "Campaign Studio",
          lifecycleStage,
          tags: Array.from(tags),
        };

        const contact = existing
          ? await tx.contact.update({
              where: { id: existing.id },
              // A phone-matched contact learns its email; an existing email is never cleared.
              data: { ...data, ...(email && !existing.email ? { email } : {}) },
            })
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
