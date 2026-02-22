import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { z } from "zod";

const CreateEnrollmentSchema = z.object({
  contactId: z.string().uuid(),
  programId: z.string().uuid(),
  status: z.string().min(1).max(50).default("enrolled"),
});

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = CreateEnrollmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const enrollment = await prisma.enrollment.create({ data: parsed.data });
    return NextResponse.json({ ok: true, enrollment }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
