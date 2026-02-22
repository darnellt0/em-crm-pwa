import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireUser();

    const interactions = await prisma.interaction.findMany({
      where: { contactId: params.id },
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
