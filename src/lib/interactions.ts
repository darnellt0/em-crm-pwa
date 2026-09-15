import type { Prisma } from "@prisma/client";

export const CONTACT_TOUCH_TYPES = ["call", "email", "meeting", "sms"];

// Also exclude historical provider receipts written as email/SMS before the
// dedicated campaign type existed. NULL outcomes are normal manual contact.
export const CAMPAIGN_OUTCOMES = ["sent", "delivered", "opened", "clicked", "bounced", "complaint", "unsubscribed", "dropped", "sms_sent", "sms_failed", "sms_opt_out", "sms_opt_in"];
export function relationshipInteractionWhere(now = new Date()): Prisma.InteractionWhereInput {
  return { type: { in: CONTACT_TOUCH_TYPES }, occurredAt: { lte: now }, OR: [{ outcome: null }, { outcome: { notIn: CAMPAIGN_OUTCOMES } }] };
}

// Conditional update is atomic: concurrent/backdated entries cannot regress a
// more recent touch. Internal notes and ambiguous "other" activity are not contact.
export async function advanceLastTouch(
  tx: Prisma.TransactionClient,
  contactId: string,
  type: string,
  occurredAt: Date,
) {
  if (!CONTACT_TOUCH_TYPES.includes(type) || occurredAt > new Date()) return;
  await tx.contact.updateMany({
    where: { id: contactId, OR: [{ lastTouchAt: null }, { lastTouchAt: { lt: occurredAt } }] },
    data: { lastTouchAt: occurredAt },
  });
}
