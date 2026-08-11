import { z } from "zod";

export const LIFECYCLE_STAGES = [
  "lead",
  "prospect",
  "opportunity",
  "customer",
  "subscriber",
  "evangelist",
  "other",
] as const;

const ContactIdSchema = z.string().uuid();

export const AgentActionPayloadSchema = z.discriminatedUnion("actionType", [
  z.object({
    actionType: z.literal("create_task"),
    contactId: ContactIdSchema.optional().nullable(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    dueAt: z.string().datetime().optional().nullable(),
  }).strict(),
  z.object({
    actionType: z.literal("log_interaction"),
    contactId: ContactIdSchema,
    type: z.enum(["call", "email", "meeting", "note", "sms", "other"]),
    summary: z.string().trim().min(1).max(5000),
    outcome: z.string().trim().max(2000).optional().nullable(),
    occurredAt: z.string().datetime().optional(),
  }).strict(),
  // No wall-clock refinement here: stored payloads are re-parsed with this
  // schema at summary/execution time, possibly after the date has passed.
  // The future-date requirement is enforced at proposal intake below.
  z.object({
    actionType: z.literal("set_follow_up"),
    contactId: ContactIdSchema,
    nextFollowUpAt: z.string().datetime(),
  }).strict(),
  z.object({
    actionType: z.literal("update_lifecycle_stage"),
    contactId: ContactIdSchema,
    lifecycleStage: z.enum(LIFECYCLE_STAGES),
  }).strict(),
  z.object({
    actionType: z.literal("add_tags"),
    contactId: ContactIdSchema,
    tags: z.array(z.string().trim().min(1).max(40)).min(1).max(10)
      .transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))]),
  }).strict(),
]);

export const AgentActionProposalSchema = z.object({
  agentId: z.literal("openclaw:nia").default("openclaw:nia"),
  idempotencyKey: z.string().trim().min(8).max(100).regex(/^[a-zA-Z0-9._:-]+$/),
  rationale: z.string().trim().min(5).max(2000),
  expiresAt: z.string().datetime().optional(),
  action: AgentActionPayloadSchema,
}).strict().superRefine((proposal, ctx) => {
  if (
    proposal.action.actionType === "set_follow_up" &&
    new Date(proposal.action.nextFollowUpAt).getTime() <= Date.now()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["action", "nextFollowUpAt"],
      message: "Date must be in the future",
    });
  }
});

export const AgentActionDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve") }),
  z.object({
    decision: z.literal("reject"),
    reason: z.string().trim().min(2).max(500),
  }),
]);

export type AgentActionPayload = z.infer<typeof AgentActionPayloadSchema>;
