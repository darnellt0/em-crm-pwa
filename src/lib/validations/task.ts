import { z } from "zod";

export const CreateTaskSchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
  dueAt: z.string().datetime().optional().nullable(),
  source: z.string().max(50).optional().default("manual"),
});

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  dueAt: z.string().datetime().optional().nullable(),
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
