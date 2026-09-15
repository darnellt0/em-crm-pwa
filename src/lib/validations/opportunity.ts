import { z } from "zod";
export const OPPORTUNITY_STAGES = ["discovery", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"] as const;
export const CreateOpportunitySchema = z.object({
  contactId: z.string().uuid(), name: z.string().trim().min(1).max(200),
  value: z.number().finite().nonnegative().max(9999999999.99).optional().nullable(),
  stage: z.enum(OPPORTUNITY_STAGES).default("discovery"),
  closeDate: z.string().datetime().optional().nullable(),
}).strict();
export const UpdateOpportunitySchema = CreateOpportunitySchema.omit({ contactId: true }).partial().strict();
