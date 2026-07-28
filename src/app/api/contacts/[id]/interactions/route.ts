import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole, handleAuthError } from "@/lib/auth/requireRole";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("read_only");

    const interactions = await prisma.interaction.findMany({
      where: { contactId: (await params).id },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: { occurredAt: "desc" },
    });

    return NextResponse.json({ ok: true, interactions });
  } catch (error) {
    return handleAuthError(error);
  }
}
