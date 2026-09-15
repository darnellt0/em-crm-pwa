import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { LEAD_LABELS, type UpdateLeadSchema } from "@/lib/leads";

export async function updateLead(tx: Prisma.TransactionClient, id: string, data: z.infer<typeof UpdateLeadSchema>, userId: string) {
  const before = await tx.contact.findUniqueOrThrow({ where: { id } });
  // Compare-and-swap prevents stale forms/retries from silently overwriting a
  // newer edit or creating a duplicate follow-up task.
  const changed = await tx.contact.updateMany({
    where: { id, updatedAt: new Date(data.expectedUpdatedAt) },
    data: {
      leadStatus: data.leadStatus, leadNextAction: data.leadNextAction || null,
      leadReviewedAt: new Date(), ownerUserId: data.ownerUserId,
      nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null,
    },
  });
  if (!changed.count) throw new Error("LEAD_CONFLICT");
  if (data.createTask && data.ownerUserId && data.leadNextAction) {
    const existing = await tx.task.findFirst({ where: { contactId: id, source: "lead-tracking", status: { not: "done" } }, orderBy: { createdAt: "desc" } });
    const taskData = { title: data.leadNextAction, ownerUserId: data.ownerUserId, dueAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null };
    if (existing) await tx.task.update({ where: { id: existing.id }, data: taskData });
    else await tx.task.create({ data: { ...taskData, contactId: id, source: "lead-tracking" } });
  }
  await tx.interaction.create({ data: {
    contactId: id, type: "note", createdByUserId: userId,
    summary: `Lead review: ${LEAD_LABELS[before.leadStatus] || before.leadStatus} → ${LEAD_LABELS[data.leadStatus]}.\nNext action: ${data.leadNextAction || "Not set"}.\nFollow-up: ${data.nextFollowUpAt || "Not set"}.\nOwner: ${data.ownerUserId || "Unassigned"}.\nEvidence / reason: ${data.reviewNote}`,
  } });
  return tx.contact.findUniqueOrThrow({ where: { id } });
}
