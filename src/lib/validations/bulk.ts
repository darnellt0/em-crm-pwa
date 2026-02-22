import { z } from "zod";

export const ContactBulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum([
    "assign_owner",
    "set_stage",
    "add_tags",
    "remove_tags",
    "set_follow_up",
    "create_task",
  ]),
  ownerUserId: z.string().uuid().optional(),
  lifecycleStage: z.string().optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
  task: z
    .object({
      title: z.string().min(3).max(200),
      dueAt: z.string().datetime().nullable().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
    })
    .optional(),
});

export const MemoryBulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["approve", "approve_pin", "reject"]),
  reason: z.string().max(500).optional(),
  enqueueEmbedding: z.boolean().optional().default(true),
  embeddingModel: z.string().optional().default("nomic-embed-text"),
});

export type ContactBulkAction = z.infer<typeof ContactBulkActionSchema>;
export type MemoryBulkAction = z.infer<typeof MemoryBulkActionSchema>;
