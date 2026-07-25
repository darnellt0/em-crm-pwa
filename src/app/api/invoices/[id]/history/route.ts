import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { handleAuthError, requireRole } from "@/lib/auth/requireRole";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("read_only");

    const revisions = await prisma.invoiceRevision.findMany({
      where: { invoiceId: (await params).id },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ ok: true, revisions });
  } catch (error) {
    return handleAuthError(error);
  }
}
