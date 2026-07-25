import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { handleAuthError, requireRole } from "@/lib/auth/requireRole";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("read_only");

    const invoice = await prisma.invoice.findUnique({
      where: { id: (await params).id },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    return handleAuthError(error);
  }
}
