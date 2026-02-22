import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { ImportMappingSchema } from "@/lib/validations/import";

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

    const body = await req.json().catch(() => ({}));
    const parsed = ImportMappingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    await prisma.importJob.update({
      where: { id: params.jobId },
      data: {
        mapping: parsed.data.mapping as any,
        status: "mapped",
      },
    });

    return NextResponse.json({ ok: true, mapping: parsed.data.mapping });
  } catch (error) {
    return handleAuthError(error);
  }
}
