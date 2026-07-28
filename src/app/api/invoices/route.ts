import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { handleAuthError, requireRole } from "@/lib/auth/requireRole";
import { CreateInvoiceSchema } from "@/lib/validations/invoice";

export async function GET(req: NextRequest) {
  try {
    await requireRole("read_only");

    const status = req.nextUrl.searchParams.get("status");
    const contactId = req.nextUrl.searchParams.get("contactId");

    const invoices = await prisma.invoice.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(contactId ? { contactId } : {}),
        isLatest: true,
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ ok: true, invoices });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole("staff");

    const parsed = CreateInvoiceSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const invoice = await prisma.invoice.create({
      data: {
        contactId: data.contactId,
        amount: data.amount,
        status: data.status,
        issueDate: new Date(data.issueDate),
        dueDate: new Date(data.dueDate),
        notes: data.notes ?? null,
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return NextResponse.json({ ok: true, invoice }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
