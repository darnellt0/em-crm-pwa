import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { normalizePhone } from "@/lib/phone/normalize";

/**
 * POST /api/imports/[jobId]/run
 *
 * Executes the import: processes each ImportRow, applies mapping,
 * deduplicates by email/phone, creates or updates contacts, and
 * records per-row outcomes. This is the final step after validate.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    await requireUser();

    const job = await prisma.importJob.findUnique({
      where: { id: params.jobId },
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
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errored = 0;

    for (const row of job.rows) {
      try {
        const raw = row.raw as Record<string, string>;
        const normalized: Record<string, any> = {};

        // Apply mapping
        for (const [csvCol, crmField] of Object.entries(mapping)) {
          if (crmField && crmField !== "skip" && raw[csvCol] !== undefined) {
            normalized[crmField] = raw[csvCol];
          }
        }

        // Build contact data
        const contactData: any = {
          firstName: normalized.firstName || null,
          lastName: normalized.lastName || null,
          email: normalized.email || null,
          phone: normalized.phone || null,
          phoneNormalized: normalizePhone(normalized.phone),
          persona: normalized.persona || null,
          source: normalized.source || "import",
          lifecycleStage: normalized.lifecycleStage || "lead",
          tags: normalized.tags
            ? normalized.tags.split(/[,;]/).map((t: string) => t.trim()).filter(Boolean)
            : [],
        };

        // Skip rows with no identifying data
        if (!contactData.email && !contactData.phoneNormalized && !contactData.firstName && !contactData.lastName) {
          await prisma.importRow.update({
            where: { id: row.id },
            data: { normalized: normalized as any, status: "skipped", action: "skipped" },
          });
          skipped++;
          continue;
        }

        // Dedupe by email or phoneNormalized
        let existingContact: any = null;
        let matchType: string | null = null;

        if (contactData.email) {
          existingContact = await prisma.contact.findUnique({
            where: { email: contactData.email },
            select: { id: true },
          });
          if (existingContact) matchType = "email";
        }

        if (!existingContact && contactData.phoneNormalized) {
          existingContact = await prisma.contact.findUnique({
            where: { phoneNormalized: contactData.phoneNormalized },
            select: { id: true },
          });
          if (existingContact) matchType = "phone";
        }

        if (existingContact) {
          // Update existing contact — merge tags
          const existing = await prisma.contact.findUnique({
            where: { id: existingContact.id },
            select: { tags: true },
          });
          const existingTags = (existing?.tags as string[]) || [];
          const mergedTags = [...new Set([...existingTags, ...contactData.tags])];

          await prisma.contact.update({
            where: { id: existingContact.id },
            data: { ...contactData, tags: mergedTags },
          });

          await prisma.importRow.update({
            where: { id: row.id },
            data: {
              normalized: normalized as any,
              status: "success",
              action: "updated",
              matchType,
              matchedContactId: existingContact.id,
            },
          });
          updated++;
        } else {
          // Create new contact
          const newContact = await prisma.contact.create({ data: contactData });

          await prisma.importRow.update({
            where: { id: row.id },
            data: {
              normalized: normalized as any,
              status: "success",
              action: "created",
              matchedContactId: newContact.id,
            },
          });
          created++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        await prisma.importRow.update({
          where: { id: row.id },
          data: { status: "error", error: errorMsg },
        });
        errored++;
      }
    }

    // Update job stats
    await prisma.importJob.update({
      where: { id: params.jobId },
      data: {
        status: "completed",
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
