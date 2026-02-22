import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { normalizePhone } from "@/lib/phone/normalize";

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
          if (crmField && raw[csvCol] !== undefined) {
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

        // Dedupe by email or phoneNormalized
        let existingContact = null;
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
          // Update existing contact
          await prisma.contact.update({
            where: { id: existingContact.id },
            data: contactData,
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
