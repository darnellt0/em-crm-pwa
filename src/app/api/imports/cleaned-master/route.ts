/**
 * POST /api/imports/cleaned-master
 *
 * Import contacts from the EM Cleaned Master export format directly into the CRM.
 * This endpoint bypasses the CSV wizard (upload → map → validate → run) and
 * accepts a pre-structured JSON body or CSV text.
 *
 * Request body (JSON):
 *   {
 *     csvText: string,      // raw CSV text from EM Export - CRM tab
 *     dryRun?: boolean,     // default false — preview without writing
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     importJobId?: string,  // only in apply mode
 *     summary: CrmImportSummary,
 *   }
 *
 * Rules enforced:
 *   - Deduplication by email first, then by normalized phone.
 *   - Phone-only contacts (no email) are allowed.
 *   - Bounced/unsubscribed contacts are imported as CRM-safe metadata only
 *     (tags + notes), never enrolled in marketing.
 *   - "Needs Review" tag is preserved.
 *   - Notes are appended, never overwritten.
 *   - Owner is mapped to existing user by email; unmatched owners are ignored.
 *   - Organization is created if it does not exist.
 *   - Requires ADMIN or PARTNER_ADMIN role.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { runCrmContactImport, type CrmContactRow } from "@/lib/import/crm-import-service";

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(csvText: string): Record<string, string>[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseRow(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

// ─── Column mapping from EM Export - CRM headers to CrmContactRow ─────────────

function mapCsvRowToCrmContactRow(raw: Record<string, string>): CrmContactRow {
  return {
    firstName:        raw["First Name"] ?? raw["firstName"] ?? "",
    lastName:         raw["Last Name"] ?? raw["lastName"] ?? "",
    preferredName:    raw["Preferred Name"] ?? raw["preferredName"] ?? "",
    email:            raw["Email"] ?? raw["email"] ?? raw["primaryEmail"] ?? "",
    secondaryEmail:   raw["Secondary Email"] ?? raw["secondaryEmail"] ?? "",
    phone:            raw["Phone"] ?? raw["phone"] ?? raw["primaryPhone"] ?? "",
    city:             raw["City"] ?? raw["city"] ?? "",
    state:            raw["State"] ?? raw["state"] ?? "",
    organization:     raw["Organization"] ?? raw["organization"] ?? "",
    title:            raw["Title"] ?? raw["title"] ?? "",
    source:           raw["Source"] ?? raw["source"] ?? "",
    sourceMemberships: raw["Source Memberships"] ?? raw["sourceMemberships"] ?? "",
    tags:             raw["Tags"] ?? raw["tags"] ?? "",
    relationshipType: raw["Relationship Type"] ?? raw["relationshipType"] ?? "",
    contactType:      raw["Contact Type"] ?? raw["contactType"] ?? "",
    owner:            raw["Owner"] ?? raw["owner"] ?? "",
    priority:         raw["Priority"] ?? raw["priority"] ?? "",
    lifecycleStage:   raw["Lifecycle Stage"] ?? raw["lifecycleStage"] ?? "",
    preferredChannel: raw["Preferred Channel"] ?? raw["preferredChannel"] ?? "",
    notes:            raw["Notes"] ?? raw["notes"] ?? "",
    nextFollowUpAt:   raw["Next Follow-Up"] ?? raw["nextFollowUpAt"] ?? "",
    lastContactedAt:  raw["Last Contacted"] ?? raw["lastContactedAt"] ?? "",
    metadataJson:     raw["Metadata"] ?? raw["metadataJson"] ?? "",
    canonicalId:      raw["Canonical ID"] ?? raw["canonicalId"] ?? "",
    reviewStatus:     raw["Review Status"] ?? raw["reviewStatus"] ?? "",
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireUser();
    if (!authResult || !["admin", "partner_admin"].includes(authResult.role)) {
      return NextResponse.json(
        { ok: false, error: "Requires admin or partner_admin role" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const csvText = String(body.csvText ?? "");
    const dryRun = body.dryRun === true || body.dryRun === "true";

    if (!csvText.trim()) {
      return NextResponse.json({ ok: false, error: "csvText is required" }, { status: 400 });
    }

    const rawRecords = parseCsv(csvText);
    if (rawRecords.length === 0) {
      return NextResponse.json({ ok: false, error: "CSV has no data rows" }, { status: 400 });
    }

    const rows: CrmContactRow[] = rawRecords.map(mapCsvRowToCrmContactRow);

    // Create ImportJob record (apply mode only)
    let importJobId: string | undefined;
    if (!dryRun) {
      const job = await prisma.importJob.create({
        data: {
          fileName: "cleaned-master-import.csv",
          status: "processing",
          totalRows: rows.length,
          source: "cleaned-master",
        },
      });
      importJobId = job.id;
    }

    const summary = await runCrmContactImport(prisma, rows, { dryRun, importJobId });

    return NextResponse.json({ ok: true, importJobId, summary });
  } catch (error) {
    return handleAuthError(error);
  }
}
