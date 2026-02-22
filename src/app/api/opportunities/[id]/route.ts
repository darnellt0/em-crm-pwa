import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { z } from "zod";

const UpdateOpportunitySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  value: z.number().positive().optional().nullable(),
  stage: z.string().min(1).max(50).optional(),
  closeDate: z.string().datetime().optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateOpportunitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const updateData: any = { ...data };
    if (data.closeDate !== undefined) {
      updateData.closeDate = data.closeDate ? new Date(data.closeDate) : null;
    }

    const opportunity = await prisma.opportunity.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({ ok: true, opportunity });
  } catch (error) {
    return handleAuthError(error);
  }
}
