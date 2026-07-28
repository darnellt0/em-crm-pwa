import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole, handleAuthError } from "@/lib/auth/requireRole";
import { z } from "zod";

const CreateProgramSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
});

export async function GET() {
  try {
    await requireRole("read_only");
    const programs = await prisma.program.findMany({
      include: { _count: { select: { enrollments: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ ok: true, programs });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole("staff");
    const body = await req.json().catch(() => ({}));
    const parsed = CreateProgramSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const program = await prisma.program.create({ data: parsed.data });
    return NextResponse.json({ ok: true, program }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
