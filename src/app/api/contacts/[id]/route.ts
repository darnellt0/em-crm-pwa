import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole, handleAuthError } from "@/lib/auth/requireRole";
import { requireUserOrInternalToken } from "@/lib/auth/requireUserOrInternalToken";
import { UpdateContactSchema } from "@/lib/validations/contact";
import { normalizePhone } from "@/lib/phone/normalize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUserOrInternalToken(req, "read_only");
    const contact = await prisma.contact.findUnique({
      where: { id: (await params).id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, name: true } },
        memories: {
          where: { status: "approved" },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        _count: {
          select: {
            interactions: true,
            tasks: true,
            opportunities: true,
            enrollments: true,
            memories: { where: { status: "approved" } },
          },
        },
      },
    });

    if (!contact) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, contact });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("partner_admin");
    const { id } = await params;

    // Remove everything that references the contact in one transaction —
    // several relations (interactions, opportunities, invoices, memories,
    // enrollments) are required FKs without cascade, so a bare delete
    // fails with a foreign-key error the moment a contact has history.
    // Agent-action and import audit rows are kept, detached from the
    // contact; campaign-sync receipts detach automatically (SetNull).
    await prisma.$transaction([
      prisma.aiMemoryItem.deleteMany({ where: { contactId: id } }), // embeddings cascade
      prisma.interaction.deleteMany({ where: { contactId: id } }),
      prisma.task.deleteMany({ where: { contactId: id } }),
      prisma.opportunity.deleteMany({ where: { contactId: id } }),
      prisma.enrollment.deleteMany({ where: { contactId: id } }),
      prisma.invoice.deleteMany({ where: { contactId: id } }), // revisions cascade
      // Pending proposals for this contact can never execute once it is
      // gone — close them out instead of leaving doomed approvable cards.
      prisma.agentActionRequest.updateMany({
        where: { contactId: id, status: "pending" },
        data: { status: "rejected", error: "Contact was deleted before review" },
      }),
      prisma.agentActionRequest.updateMany({
        where: { contactId: id },
        data: { contactId: null },
      }),
      prisma.importRow.updateMany({
        where: { matchedContactId: id },
        data: { matchedContactId: null },
      }),
      prisma.contact.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }
    return handleAuthError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Writes are session-only: agents propose changes through the approval
    // queue (/api/internal/agent-actions) instead of mutating directly.
    await requireRole("staff");
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const updateData: any = { ...data };

    if (data.email) {
      // Stored lowercased everywhere so email dedupe stays case-insensitive.
      updateData.email = data.email.trim().toLowerCase();
    }

    if (data.phone !== undefined) {
      updateData.phoneNormalized = normalizePhone(data.phone);
    }

    if (data.nextFollowUpAt !== undefined) {
      updateData.nextFollowUpAt = data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null;
    }

    const contact = await prisma.contact.update({
      where: { id: (await params).id },
      data: updateData,
    });

    return NextResponse.json({ ok: true, contact });
  } catch (error) {
    return handleAuthError(error);
  }
}
