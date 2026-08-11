import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole, handleAuthError } from "@/lib/auth/requireRole";
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
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await requireRole("partner_admin");

    const job = await prisma.importJob.findUnique({
      where: { id: (await params).jobId },
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

    // Track contacts this file would create, so a second occurrence of the
    // same email/phone previews as "update" — matching what the run step
    // actually does when it processes rows sequentially.
    const previewByEmail = new Map<string, string>();
    const previewByPhone = new Map<string, string>();

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
      const emailKey = hasEmail ? String(normalized.email).trim().toLowerCase() : null;
      const phoneNorm = hasPhone ? normalizePhone(normalized.phone) : null;

      if (emailKey) {
        // Case-insensitive so mixed-case stored emails still match (same as run).
        existingContact = await prisma.contact.findFirst({
          where: { email: { equals: emailKey, mode: "insensitive" } },
          select: { id: true, firstName: true, lastName: true },
        });
        if (existingContact) matchType = "email";
        if (!existingContact && previewByEmail.has(emailKey)) {
          existingContact = { firstName: previewByEmail.get(emailKey), lastName: null };
          matchType = "email";
        }
      }

      if (!existingContact && phoneNorm) {
        existingContact = await prisma.contact.findUnique({
          where: { phoneNormalized: phoneNorm },
          select: { id: true, firstName: true, lastName: true },
        });
        if (existingContact) matchType = "phone";
        if (!existingContact && previewByPhone.has(phoneNorm)) {
          existingContact = { firstName: previewByPhone.get(phoneNorm), lastName: null };
          matchType = "phone";
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
        const previewName =
          [normalized.firstName, normalized.lastName].filter(Boolean).join(" ") ||
          emailKey ||
          "(new contact from this file)";
        if (emailKey) previewByEmail.set(emailKey, previewName);
        if (phoneNorm) previewByPhone.set(phoneNorm, previewName);
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
