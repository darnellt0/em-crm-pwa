import { Prisma } from "@prisma/client";

export interface ContactFilterInput {
  q?: string;
  stage?: string;
  owner?: string;
  tag?: string;
  followUp?: string;
  userId: string;
  now?: Date;
}

export function buildContactWhere({
  q = "",
  stage = "",
  owner = "",
  tag = "",
  followUp = "",
  userId,
  now = new Date(),
}: ContactFilterInput): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = {};

  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ];
  }

  if (stage) where.lifecycleStage = stage;
  if (owner === "unassigned") where.ownerUserId = null;
  else if (owner === "me") where.ownerUserId = userId;
  else if (owner) where.ownerUserId = owner;
  if (tag) where.tags = { has: tag };

  if (followUp === "none") {
    where.nextFollowUpAt = null;
  } else if (followUp === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    where.nextFollowUpAt = { gte: start, lte: end };
  } else if (followUp === "overdue") {
    where.nextFollowUpAt = { lt: now };
  } else if (followUp === "7days") {
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    where.nextFollowUpAt = { gte: now, lte: end };
  }

  return where;
}
