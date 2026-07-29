import { Prisma } from "@prisma/client";

export interface ContactFilterInput {
  q?: string;
  stage?: string;
  owner?: string;
  tag?: string;
  followUp?: string;
  marketing?: string;
  contactMethod?: string;
  userId: string;
  now?: Date;
}

export function buildContactWhere({
  q = "",
  stage = "",
  owner = "",
  tag = "",
  followUp = "",
  marketing = "",
  contactMethod = "",
  userId,
  now = new Date(),
}: ContactFilterInput): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = {};
  const and: Prisma.ContactWhereInput[] = [];

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

  if (marketing === "bounced") {
    and.push(
      {
        OR: [
          { tags: { has: "Email Bounce" } },
          { source: { contains: "Email Bounces", mode: "insensitive" } },
        ],
      },
    );
  } else if (marketing === "unsubscribed") {
    and.push(
      {
        OR: [
          { tags: { has: "Unsubscribed" } },
          { source: { contains: "Mailchimp Unsubscribed", mode: "insensitive" } },
        ],
      },
    );
  } else if (marketing === "suppressed") {
    and.push({ tags: { has: "Do Not Market" } });
  } else if (marketing === "marketable") {
    where.NOT = { tags: { has: "Do Not Market" } };
  }

  if (contactMethod === "phone_only") {
    and.push({ phone: { not: null } }, { email: null });
  } else if (contactMethod === "email_only") {
    and.push({ email: { not: null } }, { phone: null });
  } else if (contactMethod === "both") {
    and.push({ email: { not: null } }, { phone: { not: null } });
  } else if (contactMethod === "none") {
    and.push({ email: null }, { phone: null });
  }

  if (and.length > 0) where.AND = and;

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
