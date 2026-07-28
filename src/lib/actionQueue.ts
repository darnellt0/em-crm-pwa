import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  calculateActionScore,
  calculateMomentum,
  calculateNeglect,
  calculateRelationship,
  calculateUrgency,
  calculateValue,
} from "@/lib/scoring";

export type ActionItem = {
  id: string;
  type: "task" | "opportunity" | "invoice" | "followup";
  title: string;
  score: number;
  reason: string;
  link: string;
};

type ContactMetrics = {
  name: string;
  interactionCount30d: number;
  interactionsLast7d: number;
  interactionsPrevious7d: number;
  approvedMemories: number;
  daysSinceLastTouch: number;
  highestValue: number;
  lastInteractionAt?: Date;
  nextFollowUpAt?: Date | null;
};

function startOfDay(input: Date) {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(input: Date) {
  const date = new Date(input);
  date.setHours(23, 59, 59, 999);
  return date;
}

function diffInDays(from: Date, to: Date) {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function formatContactName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Unnamed Contact";
}

function decimalToNumber(value?: Prisma.Decimal | null) {
  return value ? Number(value) : 0;
}

function buildReason(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(", ");
}

export async function getPriorityActions(limit = 10): Promise<ActionItem[]> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const day7 = new Date(todayStart);
  day7.setDate(day7.getDate() - 7);
  const day14 = new Date(todayStart);
  day14.setDate(day14.getDate() - 14);
  const day30 = new Date(todayStart);
  day30.setDate(day30.getDate() - 30);

  const [tasks, opportunities, invoices, followupContacts] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: "done" } },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            lastTouchAt: true,
            nextFollowUpAt: true,
          },
        },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    }),
    prisma.opportunity.findMany({
      where: { stage: { notIn: ["closed_won", "closed_lost"] } },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            lastTouchAt: true,
            nextFollowUpAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { isLatest: true, status: { notIn: ["void", "paid"] } },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            lastTouchAt: true,
            nextFollowUpAt: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.contact.findMany({
      where: {
        nextFollowUpAt: {
          not: null,
          lte: todayEnd,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        lastTouchAt: true,
        nextFollowUpAt: true,
      },
      orderBy: { nextFollowUpAt: "asc" },
    }),
  ]);

  const contactIdSet = new Set<string>();

  for (const task of tasks) if (task.contactId) contactIdSet.add(task.contactId);
  for (const opportunity of opportunities) contactIdSet.add(opportunity.contactId);
  for (const invoice of invoices) contactIdSet.add(invoice.contactId);
  for (const contact of followupContacts) contactIdSet.add(contact.id);

  const contactIds = Array.from(contactIdSet);
  if (contactIds.length === 0) {
    return [];
  }

  const [interactionCount30d, interactionsLast7d, interactionsPrevious7d, approvedMemories, lastInteractionDates] =
    await Promise.all([
      prisma.interaction.groupBy({
        by: ["contactId"],
        where: { contactId: { in: contactIds }, occurredAt: { gte: day30 } },
        _count: { id: true },
      }),
      prisma.interaction.groupBy({
        by: ["contactId"],
        where: { contactId: { in: contactIds }, occurredAt: { gte: day7 } },
        _count: { id: true },
      }),
      prisma.interaction.groupBy({
        by: ["contactId"],
        where: { contactId: { in: contactIds }, occurredAt: { gte: day14, lt: day7 } },
        _count: { id: true },
      }),
      prisma.aiMemoryItem.groupBy({
        by: ["contactId"],
        where: { contactId: { in: contactIds }, status: "approved" },
        _count: { id: true },
      }),
      prisma.interaction.groupBy({
        by: ["contactId"],
        where: { contactId: { in: contactIds } },
        _max: { occurredAt: true },
      }),
    ]);

  const contactValueMap = new Map<string, number>();
  for (const opportunity of opportunities) {
    const current = contactValueMap.get(opportunity.contactId) ?? 0;
    contactValueMap.set(opportunity.contactId, Math.max(current, decimalToNumber(opportunity.value)));
  }
  for (const invoice of invoices) {
    const current = contactValueMap.get(invoice.contactId) ?? 0;
    contactValueMap.set(invoice.contactId, Math.max(current, decimalToNumber(invoice.amount)));
  }

  const count30Map = new Map(interactionCount30d.map((row) => [row.contactId, row._count.id]));
  const last7Map = new Map(interactionsLast7d.map((row) => [row.contactId, row._count.id]));
  const previous7Map = new Map(interactionsPrevious7d.map((row) => [row.contactId, row._count.id]));
  const memoryMap = new Map(approvedMemories.map((row) => [row.contactId, row._count.id]));
  const lastInteractionMap = new Map(lastInteractionDates.map((row) => [row.contactId, row._max.occurredAt ?? undefined]));

  const contactMetricsMap = new Map<string, ContactMetrics>();

  const seedContactMetrics = (
    contactId: string,
    firstName?: string | null,
    lastName?: string | null,
    lastTouchAt?: Date | null,
    nextFollowUpAt?: Date | null
  ) => {
    if (contactMetricsMap.has(contactId)) return;

    const latestInteractionAt = lastInteractionMap.get(contactId);
    const baseline = lastTouchAt && latestInteractionAt ? (lastTouchAt > latestInteractionAt ? lastTouchAt : latestInteractionAt) : lastTouchAt ?? latestInteractionAt ?? undefined;
    const referenceDate = baseline ?? new Date(0);

    contactMetricsMap.set(contactId, {
      name: formatContactName(firstName, lastName),
      interactionCount30d: count30Map.get(contactId) ?? 0,
      interactionsLast7d: last7Map.get(contactId) ?? 0,
      interactionsPrevious7d: previous7Map.get(contactId) ?? 0,
      approvedMemories: memoryMap.get(contactId) ?? 0,
      daysSinceLastTouch: diffInDays(referenceDate, now),
      highestValue: contactValueMap.get(contactId) ?? 0,
      lastInteractionAt: latestInteractionAt,
      nextFollowUpAt,
    });
  };

  for (const task of tasks) {
    if (task.contact) {
      seedContactMetrics(
        task.contact.id,
        task.contact.firstName,
        task.contact.lastName,
        task.contact.lastTouchAt,
        task.contact.nextFollowUpAt
      );
    }
  }

  for (const opportunity of opportunities) {
    seedContactMetrics(
      opportunity.contact.id,
      opportunity.contact.firstName,
      opportunity.contact.lastName,
      opportunity.contact.lastTouchAt,
      opportunity.contact.nextFollowUpAt
    );
  }

  for (const invoice of invoices) {
    seedContactMetrics(
      invoice.contact.id,
      invoice.contact.firstName,
      invoice.contact.lastName,
      invoice.contact.lastTouchAt,
      invoice.contact.nextFollowUpAt
    );
  }

  for (const contact of followupContacts) {
    seedContactMetrics(contact.id, contact.firstName, contact.lastName, contact.lastTouchAt, contact.nextFollowUpAt);
  }

  const maxValue = Math.max(
    0,
    ...tasks.map((task) => (task.contactId ? contactMetricsMap.get(task.contactId)?.highestValue ?? 0 : 0)),
    ...opportunities.map((opportunity) => decimalToNumber(opportunity.value)),
    ...invoices.map((invoice) => decimalToNumber(invoice.amount)),
    ...followupContacts.map((contact) => contactMetricsMap.get(contact.id)?.highestValue ?? 0)
  );

  const actions: ActionItem[] = [];

  for (const task of tasks) {
    const contactMetrics = task.contactId ? contactMetricsMap.get(task.contactId) : undefined;
    const isOverdue = !!task.dueAt && task.dueAt < todayStart;
    const isDueToday = !!task.dueAt && task.dueAt >= todayStart && task.dueAt <= todayEnd;
    const urgency = calculateUrgency({ type: "task", isOverdue, isDueToday });
    const value = calculateValue({ value: contactMetrics?.highestValue ?? 0, maxValue });
    const relationship = calculateRelationship(contactMetrics ?? {});
    const momentum = calculateMomentum(contactMetrics ?? {});
    const neglect = calculateNeglect(contactMetrics ?? {});
    const score = Math.round(calculateActionScore({ urgency, value, relationship, momentum, neglect }));

    actions.push({
      id: task.id,
      type: "task",
      title: task.title,
      score,
      reason: buildReason([
        isOverdue ? "overdue task" : isDueToday ? "due today" : "open task",
        value >= 70 ? "attached to high-value contact" : null,
        contactMetrics && contactMetrics.daysSinceLastTouch >= 8
          ? `no touch in ${contactMetrics.daysSinceLastTouch} days`
          : null,
      ]),
      link: task.contactId ? `/contacts/${task.contactId}` : "/tasks",
    });
  }

  for (const opportunity of opportunities) {
    const contactMetrics = contactMetricsMap.get(opportunity.contactId);
    const latestActivity = contactMetrics?.lastInteractionAt ?? opportunity.createdAt;
    const daysSinceActivity = diffInDays(latestActivity, now);
    const isStuck = daysSinceActivity >= 7;
    const urgency = calculateUrgency({ type: "opportunity", isStuck });
    const value = calculateValue({ value: decimalToNumber(opportunity.value), maxValue });
    const relationship = calculateRelationship(contactMetrics ?? {});
    const momentum = calculateMomentum(contactMetrics ?? {});
    const neglect = calculateNeglect(contactMetrics ?? {});
    const score = Math.round(calculateActionScore({ urgency, value, relationship, momentum, neglect }));

    actions.push({
      id: opportunity.id,
      type: "opportunity",
      title: `Follow up with ${opportunity.name}`,
      score,
      reason: buildReason([
        value >= 70 ? "high-value deal" : "active deal",
        isStuck ? `no activity in ${daysSinceActivity} days` : `stage: ${opportunity.stage}`,
      ]),
      link: `/contacts/${opportunity.contactId}`,
    });
  }

  for (const invoice of invoices) {
    const contactMetrics = contactMetricsMap.get(invoice.contactId);
    const isOverdue = invoice.status !== "paid" && invoice.dueDate < todayStart;
    const urgency = calculateUrgency({ type: "invoice", isOverdue, status: invoice.status });
    const value = calculateValue({ value: decimalToNumber(invoice.amount), maxValue });
    const relationship = calculateRelationship(contactMetrics ?? {});
    const momentum = calculateMomentum(contactMetrics ?? {});
    const neglect = calculateNeglect(contactMetrics ?? {});
    const score = Math.round(calculateActionScore({ urgency, value, relationship, momentum, neglect }));

    actions.push({
      id: invoice.id,
      type: "invoice",
      title: `Invoice for ${contactMetrics?.name ?? "contact"}`,
      score,
      reason: buildReason([
        isOverdue
          ? `invoice overdue by ${diffInDays(invoice.dueDate, now)} days`
          : invoice.status === "sent"
            ? "sent invoice awaiting payment"
            : `invoice is ${invoice.status}`,
        value >= 70 ? "high invoice value" : null,
      ]),
      link: `/contacts/${invoice.contactId}`,
    });
  }

  for (const contact of followupContacts) {
    const contactMetrics = contactMetricsMap.get(contact.id);
    const urgency = 80;
    const value = calculateValue({ value: contactMetrics?.highestValue ?? 0, maxValue });
    const relationship = calculateRelationship(contactMetrics ?? {});
    const momentum = calculateMomentum(contactMetrics ?? {});
    const neglect = calculateNeglect(contactMetrics ?? {});
    const score = Math.round(calculateActionScore({ urgency, value, relationship, momentum, neglect }));
    const daysLate =
      contact.nextFollowUpAt && contact.nextFollowUpAt < todayStart ? diffInDays(contact.nextFollowUpAt, now) : 0;

    actions.push({
      id: contact.id,
      type: "followup",
      title: `Follow up with ${contactMetrics?.name ?? "contact"}`,
      score,
      reason: buildReason([
        daysLate > 0 ? `follow-up overdue by ${daysLate} days` : "follow-up due today",
        contactMetrics && contactMetrics.daysSinceLastTouch >= 4
          ? `no touch in ${contactMetrics.daysSinceLastTouch} days`
          : null,
      ]),
      link: `/contacts/${contact.id}`,
    });
  }

  return actions.sort((a, b) => b.score - a.score).slice(0, limit);
}
