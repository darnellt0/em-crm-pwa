import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const LEAD_STATUSES = ["unreviewed", "active", "nurture", "disqualified"] as const;
export const LEAD_LABELS: Record<string, string> = {
  unreviewed: "Needs review", active: "Active lead", nurture: "Nurture", disqualified: "Not a fit",
};
export const LEAD_QUEUES = ["active", "unreviewed", "nurture", "disqualified", "unassigned", "missing_next_step", "overdue", "all"] as const;
export const LeadQuerySchema = z.object({
  queue: z.enum(LEAD_QUEUES).default("active"),
  q: z.string().trim().max(200).default(""),
  owner: z.union([z.enum(["", "me", "unassigned"]), z.string().uuid()]).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export const UpdateLeadSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  leadStatus: z.enum(LEAD_STATUSES),
  ownerUserId: z.string().uuid().nullable(),
  nextFollowUpAt: z.string().datetime().nullable(),
  leadNextAction: z.string().trim().max(200).nullable(),
  reviewNote: z.string().trim().min(5).max(2000),
  createTask: z.boolean().default(false),
}).strict().superRefine((data, ctx) => {
  if (data.leadStatus === "active" || data.createTask) {
    if (!data.ownerUserId) ctx.addIssue({ code: "custom", path: ["ownerUserId"], message: "Choose an owner" });
    if (!data.nextFollowUpAt) ctx.addIssue({ code: "custom", path: ["nextFollowUpAt"], message: "Set the next follow-up" });
    if (!data.leadNextAction) ctx.addIssue({ code: "custom", path: ["leadNextAction"], message: "Describe the next action" });
  }
});

export function leadWhere(query: z.infer<typeof LeadQuerySchema>, userId: string, now = new Date()): Prisma.ContactWhereInput {
  const conditions: Prisma.ContactWhereInput[] = [];
  if (LEAD_STATUSES.includes(query.queue as typeof LEAD_STATUSES[number])) conditions.push({ leadStatus: query.queue });
  if (query.queue === "unassigned") conditions.push({ leadStatus: { in: ["active", "unreviewed", "nurture"] }, ownerUserId: null });
  if (query.queue === "missing_next_step") conditions.push({ leadStatus: "active", OR: [{ leadNextAction: null }, { leadNextAction: "" }, { nextFollowUpAt: null }, { ownerUserId: null }] });
  if (query.queue === "overdue") {
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    conditions.push({ leadStatus: { in: ["active", "nurture"] }, nextFollowUpAt: { lt: today } });
  }
  if (query.owner) conditions.push({ ownerUserId: query.owner === "me" ? userId : query.owner === "unassigned" ? null : query.owner });
  if (query.q) {
    const contains = { contains: query.q, mode: "insensitive" as const };
    conditions.push({ OR: [{ firstName: contains }, { lastName: contains }, { email: contains }, { source: contains }, { organization: { name: contains } }] });
  }
  return { AND: conditions };
}
