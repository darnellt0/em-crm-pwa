import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { handleAuthError, requireRole } from "@/lib/auth/requireRole";
import { UpdateLeadSchema } from "@/lib/leads";
import { updateLead } from "@/lib/updateLead";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireRole("staff");
    const parsed = UpdateLeadSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    const { id } = await params;
    const contact = await prisma.$transaction(tx => updateLead(tx, id, parsed.data, userId));
    return NextResponse.json({ ok: true, contact });
  } catch (error) {
    if (error instanceof Error && error.message === "LEAD_CONFLICT") return NextResponse.json({ ok: false, error: "This contact changed. Close the form, refresh, and review the latest version before saving." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return NextResponse.json({ ok: false, error: "The selected owner no longer exists. Refresh and choose an owner." }, { status: 400 });
    return handleAuthError(error);
  }
}
