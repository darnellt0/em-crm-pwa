import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    await requireUser();

    const job = await prisma.importJob.findUnique({ where: { id: params.jobId } });
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

    const { headers, rows } = parseCSV(csvText);

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No data rows found in CSV" }, { status: 400 });
    }

    // Create ImportRow entries
    await prisma.importRow.createMany({
      data: rows.map((raw, idx) => ({
        jobId: params.jobId,
        rowIndex: idx,
        raw: raw as any,
        status: "pending",
      })),
    });

    // Update job status
    await prisma.importJob.update({
      where: { id: params.jobId },
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
