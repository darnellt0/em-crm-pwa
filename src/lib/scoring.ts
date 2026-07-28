type UrgencyItem =
  | { type: "task"; isOverdue?: boolean; isDueToday?: boolean }
  | { type: "invoice"; isOverdue?: boolean; status?: string }
  | { type: "opportunity"; isStuck?: boolean }
  | { type: "followup" };

type ValueItem = {
  value?: number | null;
  maxValue?: number | null;
};

type RelationshipContact = {
  interactionCount30d?: number | null;
  approvedMemories?: number | null;
};

type MomentumContact = {
  interactionsLast7d?: number | null;
  interactionsPrevious7d?: number | null;
};

type NeglectContact = {
  daysSinceLastTouch?: number | null;
};

export function calculateUrgency(item: UrgencyItem) {
  if (item.type === "task") {
    if (item.isOverdue) return 100;
    if (item.isDueToday) return 80;
  }

  if (item.type === "invoice") {
    if (item.isOverdue) return 95;
    if (item.status === "sent") return 70;
  }

  if (item.type === "opportunity" && item.isStuck) {
    return 80;
  }

  return 0;
}

export function calculateValue(item: ValueItem) {
  const value = item.value ?? 0;
  const maxValue = item.maxValue ?? 0;

  if (value <= 0 || maxValue <= 0) return 0;

  return Math.min(100, Math.round((value / maxValue) * 100));
}

export function calculateRelationship(contact: RelationshipContact) {
  const interactionScore = Math.min(100, (contact.interactionCount30d ?? 0) * 10);
  const memoryScore = Math.min(100, (contact.approvedMemories ?? 0) * 5);

  return Math.round(interactionScore * 0.6 + memoryScore * 0.4);
}

export function calculateMomentum(contact: MomentumContact) {
  const last7 = contact.interactionsLast7d ?? 0;
  const previous7 = contact.interactionsPrevious7d ?? 0;

  if (last7 > previous7) return 90;
  if (last7 === previous7) return 60;
  return 30;
}

export function calculateNeglect(contact: NeglectContact) {
  const days = contact.daysSinceLastTouch ?? 30;

  if (days <= 3) return 10;
  if (days <= 7) return 30;
  if (days <= 14) return 60;
  if (days <= 30) return 80;
  return 100;
}

export function calculateActionScore({
  urgency,
  value,
  relationship,
  momentum,
  neglect,
}: {
  urgency: number;
  value: number;
  relationship: number;
  momentum: number;
  neglect: number;
}) {
  return urgency * 0.3 + value * 0.25 + relationship * 0.15 + momentum * 0.15 + neglect * 0.15;
}
