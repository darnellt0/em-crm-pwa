import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole, handleAuthError } from "@/lib/auth/requireRole";
import { CreateOpportunitySchema } from "@/lib/validations/opportunity";

export async function GET(req: NextRequest) {
  try {
    await requireRole("read_only");
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
    await requireRole("staff");
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
