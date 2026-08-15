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
 * POST /api/imports/[jobId]/validate
 *
 * Plans the complete batch before any writes. Matching priority is canonical
 * ID, email, exact name + phone, then an unambiguous phone-only match.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
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
      return NextResponse.json(
        { ok: false, error: "Mapping not set. Call /map first." },
        { status: 400 },
      );
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
    const existingById = new Map(existingContacts.map((contact) => [contact.id, contact]));

    let willCreate = 0;
    let willUpdate = 0;
    let willSkip = 0;
    let willError = 0;
    const rowPreviews = preparedRows.map(({ row, normalized, contact }, index) => {
      if (!hasGenericImportIdentity(contact)) {
        willSkip += 1;
        return {
          rowIndex: row.rowIndex,
          action: "skip" as const,
          matchType: null,
          matchedContactName: null,
          error: null,
          normalized,
        };
      }

      const plan = plans[index];
      if (plan.conflict) {
        willError += 1;
        return {
          rowIndex: row.rowIndex,
          action: "error" as const,
          matchType: null,
          matchedContactName: null,
          error: plan.conflict,
          normalized,
        };
      }

      if (plan.contactId) {
        willUpdate += 1;
        const matched = existingById.get(plan.contactId);
        return {
          rowIndex: row.rowIndex,
          action: "update" as const,
          matchType: plan.matchType,
          matchedContactName:
            [matched?.firstName, matched?.lastName].filter(Boolean).join(" ") || null,
          error: null,
          normalized,
        };
      }

      willCreate += 1;
      return {
        rowIndex: row.rowIndex,
        action: "create" as const,
        matchType: null,
        matchedContactName: null,
        error: null,
        normalized,
      };
    });

    return NextResponse.json({
      ok: true,
      summary: {
        total: job.rows.length,
        willCreate,
        willUpdate,
        willSkip,
        willError,
      },
      rows: rowPreviews,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
