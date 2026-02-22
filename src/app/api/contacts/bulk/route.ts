import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { ContactBulkActionSchema } from "@/lib/validations/bulk";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const parsed = ContactBulkActionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const { ids, action } = parsed.data;
    const errors: any[] = [];
    let updatedCount = 0;

    await prisma.$transaction(async (tx) => {
      if (action === "assign_owner") {
        if (!parsed.data.ownerUserId) throw new Error("ownerUserId required");
        const res = await tx.contact.updateMany({
          where: { id: { in: ids } },
          data: { ownerUserId: parsed.data.ownerUserId },
        });
        updatedCount = res.count;
        return;
      }

      if (action === "set_stage") {
        if (!parsed.data.lifecycleStage) throw new Error("lifecycleStage required");
        const res = await tx.contact.updateMany({
          where: { id: { in: ids } },
          data: { lifecycleStage: parsed.data.lifecycleStage },
        });
        updatedCount = res.count;
        return;
      }

      if (action === "add_tags" || action === "remove_tags") {
        if (!parsed.data.tags?.length) throw new Error("tags required");
        for (const id of ids) {
          const c = await tx.contact.findUnique({ where: { id }, select: { tags: true } });
          if (!c) continue;
          const set = new Set(c.tags ?? []);
          if (action === "add_tags") parsed.data.tags.forEach((t) => set.add(t));
          if (action === "remove_tags") parsed.data.tags.forEach((t) => set.delete(t));
          await tx.contact.update({ where: { id }, data: { tags: Array.from(set) } });
          updatedCount++;
        }
        return;
      }

      if (action === "set_follow_up") {
        const followUp = parsed.data.nextFollowUpAt
          ? new Date(parsed.data.nextFollowUpAt)
          : null;
        const res = await tx.contact.updateMany({
          where: { id: { in: ids } },
          data: { nextFollowUpAt: followUp },
        });
        updatedCount = res.count;
        return;
      }

      if (action === "create_task") {
        if (!parsed.data.task) throw new Error("task object required");
        const { title, dueAt, priority } = parsed.data.task;
        for (const contactId of ids) {
          await tx.task.create({
            data: {
              contactId,
              ownerUserId: userId,
              title,
              priority: priority || "medium",
              dueAt: dueAt ? new Date(dueAt) : undefined,
              source: "bulk",
            },
          });
          updatedCount++;
        }
        return;
      }
    });

    return NextResponse.json({
      ok: true,
      updatedCount,
      skippedCount: ids.length - updatedCount,
      errors,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
