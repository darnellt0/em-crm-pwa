import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { normalizePhone } from "@/lib/phone/normalize";

/**
 * POST /api/imports/[jobId]/validate
 *
 * Dry-run deduplication preview. Reads all ImportRow entries for the job,
 * applies the saved mapping, and checks each row against existing contacts
 * by email or phoneNormalized. Returns a summary of what would happen
 * (create vs update vs skip) without touching the contacts table.
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
      return NextResponse.json({ ok: false, error: "Mapping not set. Call /map first." }, { status: 400 });
    }

    const mapping = job.mapping as Record<string, string | null>;

    let willCreate = 0;
    let willUpdate = 0;
    let willSkip = 0;
    const rowPreviews: Array<{
      rowIndex: number;
      action: "create" | "update" | "skip";
      matchType: string | null;
      matchedContactName: string | null;
      normalized: Record<string, any>;
    }> = [];

    for (const row of job.rows) {
      const raw = row.raw as Record<string, string>;
      const normalized: Record<string, any> = {};

      // Apply mapping
      for (const [csvCol, crmField] of Object.entries(mapping)) {
        if (crmField && crmField !== "skip" && raw[csvCol] !== undefined) {
          normalized[crmField] = raw[csvCol];
        }
      }

      // Check if we have enough data
      const hasEmail = !!normalized.email;
      const hasPhone = !!normalized.phone;
      const hasName = !!normalized.firstName || !!normalized.lastName;

      if (!hasEmail && !hasPhone && !hasName) {
        willSkip++;
        rowPreviews.push({
          rowIndex: row.rowIndex,
          action: "skip",
          matchType: null,
          matchedContactName: null,
          normalized,
        });
        continue;
      }

      // Dedupe check
      let existingContact: any = null;
      let matchType: string | null = null;

      if (hasEmail) {
        existingContact = await prisma.contact.findUnique({
          where: { email: normalized.email },
          select: { id: true, firstName: true, lastName: true },
        });
        if (existingContact) matchType = "email";
      }

      if (!existingContact && hasPhone) {
        const phoneNorm = normalizePhone(normalized.phone);
        if (phoneNorm) {
          existingContact = await prisma.contact.findUnique({
            where: { phoneNormalized: phoneNorm },
            select: { id: true, firstName: true, lastName: true },
          });
          if (existingContact) matchType = "phone";
        }
      }

      if (existingContact) {
        willUpdate++;
        const name = [existingContact.firstName, existingContact.lastName]
          .filter(Boolean)
          .join(" ");
        rowPreviews.push({
          rowIndex: row.rowIndex,
          action: "update",
          matchType,
          matchedContactName: name || null,
          normalized,
        });
      } else {
        willCreate++;
        rowPreviews.push({
          rowIndex: row.rowIndex,
          action: "create",
          matchType: null,
          matchedContactName: null,
          normalized,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      summary: {
        total: job.rows.length,
        willCreate,
        willUpdate,
        willSkip,
      },
      rows: rowPreviews,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
