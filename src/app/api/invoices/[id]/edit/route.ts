import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { handleAuthError, requireRole } from "@/lib/auth/requireRole";
import { EditInvoiceSchema } from "@/lib/validations/invoice";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole("staff");
    const parsed = EditInvoiceSchema.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: (await params).id },
      });

      if (!invoice) {
        return {
          type: "not_found" as const,
        };
      }

      const { changeNote, ...data } = parsed.data;

      if (invoice.status === "paid") {
        // Escape hatch for a mistaken "paid": an admin may void the invoice
        // (recorded in the revision history); every other edit stays blocked.
        const isVoidOnly =
          data.status === "void" &&
          data.amount === undefined &&
          data.issueDate === undefined &&
          data.dueDate === undefined &&
          data.notes === undefined;
        if (!isVoidOnly || user.role !== "admin") {
          return {
            type: "paid" as const,
          };
        }
      }

      const effectiveIssueDate = data.issueDate ? new Date(data.issueDate) : invoice.issueDate;
      const effectiveDueDate = data.dueDate ? new Date(data.dueDate) : invoice.dueDate;
      if (effectiveDueDate < effectiveIssueDate) {
        return { type: "bad_dates" as const };
      }

      await tx.invoiceRevision.create({
        data: {
          invoiceId: invoice.id,
          version: invoice.version,
          snapshot: {
            id: invoice.id,
            contactId: invoice.contactId,
            amount: invoice.amount.toString(),
            status: invoice.status,
            issueDate: invoice.issueDate.toISOString(),
            dueDate: invoice.dueDate.toISOString(),
            notes: invoice.notes,
            version: invoice.version,
            isLatest: invoice.isLatest,
            createdAt: invoice.createdAt.toISOString(),
            updatedAt: invoice.updatedAt.toISOString(),
          },
          changedBy: user.email,
          changeNote: changeNote ?? null,
        },
      });

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          ...(data.amount !== undefined ? { amount: data.amount } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.issueDate !== undefined ? { issueDate: new Date(data.issueDate) } : {}),
          ...(data.dueDate !== undefined ? { dueDate: new Date(data.dueDate) } : {}),
          ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
          version: invoice.version + 1,
          isLatest: true,
        },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      return {
        type: "success" as const,
        invoice: updatedInvoice,
      };
    });

    if (result.type === "not_found") {
      return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
    }

    if (result.type === "paid") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Paid invoices cannot be edited. An admin can void a paid invoice by changing only its status to \"void\".",
        },
        { status: 400 }
      );
    }

    if (result.type === "bad_dates") {
      return NextResponse.json(
        { ok: false, error: "Due date cannot be before the issue date" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, invoice: result.invoice });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Invoice was modified by someone else — reload and retry" },
        { status: 409 }
      );
    }
    return handleAuthError(error);
  }
}
