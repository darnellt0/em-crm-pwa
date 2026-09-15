import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole, handleAuthError } from "@/lib/auth/requireRole";
import { UpdateTaskSchema } from "@/lib/validations/task";
import { completeTask } from "@/lib/completeTask";
import { Prisma } from "@prisma/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireRole("staff");
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const { id } = await params;
    const task = await prisma.$transaction(tx => completeTask(tx, id, parsed.data, userId));

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    if (error instanceof Error && error.message === "TASK_CONFLICT") return NextResponse.json({ ok: false, error: "This task or contact changed. Refresh before completing it." }, { status: 409 });
    if (error instanceof Error && error.message === "FOLLOW_THROUGH_REQUIRED") return NextResponse.json({ ok: false, error: "Review the linked contact and choose what happens to its follow-up." }, { status: 400 });
    if (error instanceof Error && error.message === "LEAD_OWNER_REQUIRED") return NextResponse.json({ ok: false, error: "Assign a contact owner before scheduling the next step." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    return handleAuthError(error);
  }
}
