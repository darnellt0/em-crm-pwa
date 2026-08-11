import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole, handleAuthError } from "@/lib/auth/requireRole";
import { parseCsvRecords } from "@/lib/import/csv";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await requireRole("partner_admin");
    const { jobId } = await params;

    const job = await prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ ok: false, error: "Import job not found" }, { status: 404 });
    }

    // Accept CSV as text body or form data
    let csvText: string;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) {
        return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
      }
      csvText = await file.text();
    } else {
      csvText = await req.text();
    }

    if (job.status !== "uploaded") {
      return NextResponse.json(
        { ok: false, error: "This job already has a file — create a new import to upload again" },
        { status: 400 }
      );
    }

    let headers: string[];
    let rows: Record<string, string>[];
    try {
      ({ headers, rows } = parseCsvRecords(csvText));
    } catch (parseError) {
      // Surface the parser's message (bad quoting, duplicate headers, …)
      // instead of a generic 500 so the user can fix their file.
      const message =
        parseError instanceof Error ? parseError.message : "Could not parse the CSV file";
      return NextResponse.json({ ok: false, error: `CSV error: ${message}` }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No data rows found in CSV" }, { status: 400 });
    }

    // Create ImportRow entries
    await prisma.importRow.createMany({
      data: rows.map((raw, idx) => ({
        jobId,
        rowIndex: idx,
        raw: raw as any,
        status: "pending",
      })),
    });

    // Update job status
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: "parsed" },
    });

    return NextResponse.json({
      ok: true,
      headers,
      rowCount: rows.length,
      preview: rows.slice(0, 5),
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
