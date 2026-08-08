import { NextRequest, NextResponse } from "next/server";
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
    await prisma.contact.delete({ where: { id: (await params).id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUserOrInternalToken(req, "staff");
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const updateData: any = { ...data };

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
