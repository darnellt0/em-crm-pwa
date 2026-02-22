import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { UpdateTaskSchema } from "@/lib/validations/task";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const updateData: any = { ...data };

    if (data.dueAt !== undefined) {
      updateData.dueAt = data.dueAt ? new Date(data.dueAt) : null;
    }

    const task = await prisma.task.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return handleAuthError(error);
  }
}
