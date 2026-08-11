/**
 * POST /api/imports/cleaned-master
 *
 * Import contacts from the EM Cleaned Master export format directly into the CRM.
 * Accepts CSV text and runs a CRM-safe preview or apply import.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { handleAuthError, requireRole } from "@/lib/auth/requireRole";
import { runCrmContactImport, type CrmContactRow } from "@/lib/import/crm-import-service";
import { parseCsvRecords } from "@/lib/import/csv";

function mapCsvRowToCrmContactRow(raw: Record<string, string>): CrmContactRow {
  return {
    firstName: raw["First Name"] ?? raw["firstName"] ?? "",
    lastName: raw["Last Name"] ?? raw["lastName"] ?? "",
    preferredName: raw["Preferred Name"] ?? raw["preferredName"] ?? "",
    email: raw["Email"] ?? raw["email"] ?? raw["primaryEmail"] ?? "",
    secondaryEmail: raw["Secondary Email"] ?? raw["secondaryEmail"] ?? "",
    phone: raw["Phone"] ?? raw["phone"] ?? raw["primaryPhone"] ?? "",
    city: raw["City"] ?? raw["city"] ?? "",
    state: raw["State"] ?? raw["state"] ?? "",
    organization: raw["Organization"] ?? raw["organization"] ?? "",
    title: raw["Title"] ?? raw["title"] ?? "",
    source: raw["Source"] ?? raw["source"] ?? "",
    status: raw["Status"] ?? raw["status"] ?? "",
    sourceMemberships: raw["Source Memberships"] ?? raw["sourceMemberships"] ?? "",
    tags: raw["Tags"] ?? raw["tags"] ?? "",
    relationshipType: raw["Relationship Type"] ?? raw["relationshipType"] ?? "",
    contactType: raw["Contact Type"] ?? raw["contactType"] ?? "",
    owner: raw["Owner"] ?? raw["owner"] ?? "",
    priority: raw["Priority"] ?? raw["priority"] ?? "",
    lifecycleStage: raw["Lifecycle Stage"] ?? raw["lifecycleStage"] ?? "",
    preferredChannel: raw["Preferred Channel"] ?? raw["preferredChannel"] ?? "",
    notes: raw["Notes"] ?? raw["notes"] ?? "",
    nextFollowUpAt: raw["Next Follow-Up"] ?? raw["nextFollowUpAt"] ?? "",
    lastContactedAt: raw["Last Contacted"] ?? raw["lastContactedAt"] ?? "",
    metadataJson: raw["Metadata"] ?? raw["metadataJson"] ?? "",
    canonicalId: raw["Canonical ID"] ?? raw["canonicalId"] ?? "",
    reviewStatus: raw["Review Status"] ?? raw["reviewStatus"] ?? ""
  };
}

export async function POST(request: NextRequest) {
  try {
    const phase5UserId = await getPhase5TokenUserId(request);
    const authResult = phase5UserId
      ? { userId: phase5UserId, role: "admin" as const }
      : await requireRole("partner_admin");
    if (!phase5UserId && !["admin", "partner_admin"].includes(authResult.role)) {
      return NextResponse.json(
        { ok: false, error: "Requires admin or partner_admin role" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const dryRun = body.dryRun === true || body.dryRun === "true";
    const csvText = String(body.csvText ?? "");

    if (!csvText.trim()) {
      return NextResponse.json({ ok: false, error: "csvText is required" }, { status: 400 });
    }

    let rawRecords: Record<string, string>[];
    try {
      ({ rows: rawRecords } = parseCsvRecords(csvText));
    } catch (parseError) {
      const message =
        parseError instanceof Error ? parseError.message : "Could not parse the CSV file";
      return NextResponse.json({ ok: false, error: `CSV error: ${message}` }, { status: 400 });
    }
    if (rawRecords.length === 0) {
      return NextResponse.json({ ok: false, error: "CSV has no data rows" }, { status: 400 });
    }

    const rows: CrmContactRow[] = rawRecords.map(mapCsvRowToCrmContactRow);

    let importJobId: string | undefined;
    if (!dryRun) {
      const job = await prisma.importJob.create({
        data: {
          createdByUserId: authResult.userId,
          entity: "contacts",
          filename: "cleaned-master-import.csv",
          status: "processing",
          mapping: { source: "cleaned-master" },
          stats: { totalRows: rows.length }
        }
      });
      importJobId = job.id;
    }

    const summary = await runCrmContactImport(prisma, rows, { dryRun, importJobId });
    return NextResponse.json({ ok: true, importJobId, summary });
  } catch (error) {
    return handleAuthError(error);
  }
}

async function getPhase5TokenUserId(request: NextRequest) {
  const configuredToken = process.env.PHASE5_IMPORT_TOKEN?.trim();
  if (
    !configuredToken ||
    process.env.NODE_ENV === "production" ||
    request.headers.get("x-phase5-import-token") !== configuredToken
  ) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: {
      role: {
        in: ["admin", "partner_admin", "staff"]
      }
    },
    select: { id: true },
    orderBy: { email: "asc" }
  });

  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }

  return user.id;
}
