import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole, handleAuthError } from "@/lib/auth/requireRole";

/**
 * GET /api/imports/[jobId]/rows
 *
 * Returns all ImportRow entries for a given job, with optional status filter.
 * Useful for reviewing results after execution.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await requireRole("partner_admin");

    const statusFilter = req.nextUrl.searchParams.get("status");

    const job = await prisma.importJob.findUnique({
      where: { id: (await params).jobId },
      select: { id: true, status: true, filename: true, stats: true },
    });

    if (!job) {
      return NextResponse.json({ ok: false, error: "Import job not found" }, { status: 404 });
    }

    const where: any = { jobId: (await params).jobId };
    if (statusFilter) where.status = statusFilter;

    const rows = await prisma.importRow.findMany({
      where,
      orderBy: { rowIndex: "asc" },
    });

    return NextResponse.json({
      ok: true,
      job,
      rows,
      total: rows.length,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
