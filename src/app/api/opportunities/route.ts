import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { z } from "zod";

const CreateOpportunitySchema = z.object({
  contactId: z.string().uuid(),
  name: z.string().min(1).max(200),
  value: z.number().positive().optional().nullable(),
  stage: z.string().min(1).max(50).default("discovery"),
  closeDate: z.string().datetime().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const stage = req.nextUrl.searchParams.get("stage");
    const contactId = req.nextUrl.searchParams.get("contactId");

    const where: any = {};
    if (stage) where.stage = stage;
    if (contactId) where.contactId = contactId;

    const opportunities = await prisma.opportunity.findMany({
      where,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ok: true, opportunities });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = CreateOpportunitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const opportunity = await prisma.opportunity.create({
      data: {
        contactId: data.contactId,
        name: data.name,
        value: data.value,
        stage: data.stage,
        closeDate: data.closeDate ? new Date(data.closeDate) : undefined,
      },
    });

    return NextResponse.json({ ok: true, opportunity }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
