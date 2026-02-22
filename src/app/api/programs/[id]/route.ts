import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { z } from "zod";

const UpdateProgramSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateProgramSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const program = await prisma.program.update({
      where: { id: params.id },
      data: parsed.data,
    });

    return NextResponse.json({ ok: true, program });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireUser();
    const program = await prisma.program.findUnique({
      where: { id: params.id },
      include: {
        enrollments: {
          include: {
            contact: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!program) {
      return NextResponse.json({ ok: false, error: "Program not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, program });
  } catch (error) {
    return handleAuthError(error);
  }
}
