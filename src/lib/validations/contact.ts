import { z } from "zod";

export const CreateContactSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  persona: z.string().max(100).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  lifecycleStage: z.string().max(50).optional().default("lead"),
  tags: z.array(z.string().min(1).max(40)).optional().default([]),
  ownerUserId: z.string().uuid().optional().nullable(),
  organizationId: z.string().uuid().optional().nullable(),
  nextFollowUpAt: z.string().datetime().optional().nullable(),
});

export const UpdateContactSchema = CreateContactSchema.partial();

export type CreateContact = z.infer<typeof CreateContactSchema>;
export type UpdateContact = z.infer<typeof UpdateContactSchema>;
