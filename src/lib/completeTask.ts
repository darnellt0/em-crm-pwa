import type { Prisma } from "@prisma/client";
import type { UpdateTask } from "@/lib/validations/task";

export async function completeTask(tx: Prisma.TransactionClient, id: string, data: UpdateTask, userId: string) {
  const before = await tx.task.findUniqueOrThrow({ where: { id }, include: { contact: true } });
  const { followThrough, ...fields } = data;
  const completing = data.status === "done" && before.status !== "done";
  if (followThrough && !completing) throw new Error("TASK_CONFLICT");
  if (completing && before.contactId && !followThrough) throw new Error("FOLLOW_THROUGH_REQUIRED");
  if (followThrough && !before.contact) throw new Error("FOLLOW_THROUGH_REQUIRED");
  // Conditional status claim prevents double-completion and duplicate next tasks.
  const claimed = await tx.task.updateMany({ where: { id, status: before.status }, data: { ...fields, dueAt: fields.dueAt === undefined ? undefined : fields.dueAt ? new Date(fields.dueAt) : null } });
  if (!claimed.count) throw new Error("TASK_CONFLICT");
  if (followThrough && before.contact) {
    const contact = before.contact;
    const scheduling = followThrough.choice === "schedule";
    if (scheduling && !contact.ownerUserId) throw new Error("LEAD_OWNER_REQUIRED");
    const changed = await tx.contact.updateMany({
      where: { id: contact.id, updatedAt: new Date(followThrough.expectedContactUpdatedAt) },
      data: {
        leadReviewedAt: new Date(),
        ...(scheduling ? { leadNextAction: followThrough.nextAction, nextFollowUpAt: new Date(followThrough.nextFollowUpAt!) } : {}),
        ...(followThrough.choice === "clear" ? { leadNextAction: null, nextFollowUpAt: null, leadStatus: followThrough.leadStatus } : {}),
      },
    });
    if (!changed.count) throw new Error("TASK_CONFLICT");
    if (scheduling) {
      const existing = await tx.task.findFirst({ where: { contactId: contact.id, source: "lead-tracking", status: { not: "done" } } });
      const next = { title: followThrough.nextAction!, dueAt: new Date(followThrough.nextFollowUpAt!), ownerUserId: contact.ownerUserId! };
      if (existing) await tx.task.update({ where: { id: existing.id }, data: next });
      else await tx.task.create({ data: { ...next, contactId: contact.id, source: "lead-tracking" } });
    } else if (followThrough.choice === "clear") {
      // A manual task can be completed while a separate lead-tracking task is
      // still open. Clearing the contact follow-up must retire that stale task
      // in the same transaction or the Tasks and Leads views disagree.
      await tx.task.updateMany({
        where: { contactId: contact.id, source: "lead-tracking", status: { not: "done" } },
        data: { status: "done" },
      });
    }
    await tx.interaction.create({ data: { contactId: contact.id, type: "note", createdByUserId: userId, summary: `Task completed: ${before.title}.\nFollow-up decision: ${followThrough.choice}.\nNext step: ${scheduling ? followThrough.nextAction : followThrough.choice === "keep" ? contact.leadNextAction || "Not set" : "Cleared"}.\nOutcome / reason: ${followThrough.note}` } });
  }
  return tx.task.findUniqueOrThrow({ where: { id } });
}
