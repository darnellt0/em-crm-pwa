import { z } from "zod";

export const CreateInteractionSchema = z.object({
  contactId: z.string().uuid(),
  type: z.enum(["call", "email", "meeting", "note", "sms", "other"]),
  summary: z.string().max(5000).optional().nullable(),
  outcome: z.string().max(2000).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
});

export type CreateInteraction = z.infer<typeof CreateInteractionSchema>;
