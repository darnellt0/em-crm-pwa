import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole, handleAuthError } from "@/lib/auth/requireRole";
import { planContactIdentityMatches } from "@/lib/import/contact-match-planner";
import {
  applyImportMapping,
  buildGenericImportContact,
  hasGenericImportIdentity,
} from "@/lib/import/generic-contact-import";

/**
 * POST /api/imports/[jobId]/run
 *
 * Plans the entire batch before writing so one existing contact cannot be
 * claimed by multiple canonical rows. Shared phone numbers are preserved.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    await requireRole("partner_admin");
    const jobId = (await params).jobId;
    const job = await prisma.importJob.findUnique({
      where: { id: jobId },
      include: { rows: { orderBy: { rowIndex: "asc" } } },
    });

    if (!job) {
      return NextResponse.json({ ok: false, error: "Import job not found" }, { status: 404 });
    }
    if (!job.mapping) {
      return NextResponse.json({ ok: false, error: "Mapping not set" }, { status: 400 });
    }
    if (job.status === "completed") {
      return NextResponse.json({ ok: false, error: "Import already completed" }, { status: 400 });
    }

    const mapping = job.mapping as Record<string, string | null>;
    const preparedRows = job.rows.map((row) => {
      const normalized = applyImportMapping(row.raw as Record<string, string>, mapping);
      return { row, normalized, contact: buildGenericImportContact(normalized) };
    });
    const existingContacts = await prisma.contact.findMany({
      select: {
        id: true,
        canonicalId: true,
        email: true,
        phoneNormalized: true,
        firstName: true,
        lastName: true,
      },
    });
    const plans = planContactIdentityMatches(
      preparedRows.map(({ contact }) => contact),
      existingContacts,
    );
    const conflicts = plans
      .map((plan, index) => (plan.conflict ? { row: index + 1, error: plan.conflict } : null))
      .filter(Boolean);
    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Import has identity conflicts. Revalidate and correct the source file before running.",
          conflicts,
        },
        { status: 409 },
      );
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errored = 0;

    for (let index = 0; index < preparedRows.length; index += 1) {
      const { row, normalized, contact } = preparedRows[index];
      try {
        if (!hasGenericImportIdentity(contact)) {
          await prisma.importRow.update({
            where: { id: row.id },
            data: { normalized: normalized as any, status: "skipped", action: "skipped" },
          });
          skipped += 1;
          continue;
        }

        const plan = plans[index];
        if (plan.contactId) {
          const existing = await prisma.contact.findUnique({
            where: { id: plan.contactId },
            select: { tags: true },
          });
          const mergedTags = Array.from(new Set([...(existing?.tags ?? []), ...contact.tags]));
          const updateData: Record<string, unknown> = { tags: mergedTags };
          if (contact.canonicalId) updateData.canonicalId = contact.canonicalId;
          if (contact.firstName) updateData.firstName = contact.firstName;
          if (contact.lastName) updateData.lastName = contact.lastName;
          if (contact.email) updateData.email = contact.email;
          if (contact.phone) {
            updateData.phone = contact.phone;
            updateData.phoneNormalized = contact.phoneNormalized;
          }
          if (contact.persona) updateData.persona = contact.persona;
          if (normalized.source) updateData.source = contact.source;
          if (normalized.lifecycleStage) updateData.lifecycleStage = contact.lifecycleStage;

          await prisma.contact.update({ where: { id: plan.contactId }, data: updateData });
          await prisma.importRow.update({
            where: { id: row.id },
            data: {
              normalized: normalized as any,
              status: "success",
              action: "updated",
              matchType: plan.matchType,
              matchedContactId: plan.contactId,
            },
          });
          updated += 1;
        } else {
          const newContact = await prisma.contact.create({
            data: {
              canonicalId: contact.canonicalId ?? undefined,
              firstName: contact.firstName ?? undefined,
              lastName: contact.lastName ?? undefined,
              email: contact.email ?? undefined,
              phone: contact.phone ?? undefined,
              phoneNormalized: contact.phoneNormalized ?? undefined,
              persona: contact.persona ?? undefined,
              source: contact.source,
              lifecycleStage: contact.lifecycleStage,
              tags: contact.tags,
            },
          });
          await prisma.importRow.update({
            where: { id: row.id },
            data: {
              normalized: normalized as any,
              status: "success",
              action: "created",
              matchedContactId: newContact.id,
            },
          });
          created += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        await prisma.importRow.update({
          where: { id: row.id },
          data: { status: "error", error: message },
        });
        errored += 1;
      }
    }

    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: errored > 0 ? "completed_with_errors" : "completed",
        stats: { total: job.rows.length, created, updated, skipped, errored } as any,
      },
    });

    return NextResponse.json({
      ok: true,
      stats: { total: job.rows.length, created, updated, skipped, errored },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
