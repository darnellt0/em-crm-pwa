import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { z } from "zod";

const UpdateViewSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isShared: z.boolean().optional(),
  filters: z.record(z.any()).optional(),
  sort: z.array(z.any()).optional(),
  columns: z.array(z.string()).optional(),
});

// GET /api/views/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();

    const view = await prisma.savedView.findUnique({
      where: { id: params.id },
    });

    if (!view) {
      return NextResponse.json({ ok: false, error: "View not found" }, { status: 404 });
    }

    // Only owner or shared views are accessible
    if (view.ownerUserId !== user.userId && !view.isShared) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, view });
  } catch (error) {
    return handleAuthError(error);
  }
}

// PATCH /api/views/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();

    const existing = await prisma.savedView.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "View not found" }, { status: 404 });
    }

    if (existing.ownerUserId !== user.userId) {
      return NextResponse.json({ ok: false, error: "Only the owner can edit this view" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateViewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.isShared !== undefined) updateData.isShared = parsed.data.isShared;
    if (parsed.data.filters !== undefined) updateData.filters = parsed.data.filters;
    if (parsed.data.sort !== undefined) updateData.sort = parsed.data.sort;
    if (parsed.data.columns !== undefined) updateData.columns = parsed.data.columns;

    const view = await prisma.savedView.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({ ok: true, view });
  } catch (error) {
    return handleAuthError(error);
  }
}

// DELETE /api/views/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();

    const existing = await prisma.savedView.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "View not found" }, { status: 404 });
    }

    if (existing.ownerUserId !== user.userId) {
      return NextResponse.json({ ok: false, error: "Only the owner can delete this view" }, { status: 403 });
    }

    await prisma.savedView.delete({ where: { id: params.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
