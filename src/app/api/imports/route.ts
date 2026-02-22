import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { CreateImportJobSchema } from "@/lib/validations/import";

export async function GET() {
  try {
    await requireUser();
    const jobs = await prisma.importJob.findMany({
      include: {
        creator: { select: { id: true, name: true, email: true } },
        _count: { select: { rows: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = CreateImportJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const job = await prisma.importJob.create({
      data: {
        createdByUserId: userId,
        entity: parsed.data.entity,
        filename: parsed.data.filename,
        status: "uploaded",
      },
    });

    return NextResponse.json({ ok: true, job }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
