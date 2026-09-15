import { z } from "zod";

export const TaskFollowThroughSchema = z.object({
  choice: z.enum(["keep", "schedule", "clear"]),
  expectedContactUpdatedAt: z.string().datetime(),
  note: z.string().trim().min(5).max(1500),
  nextAction: z.string().trim().min(1).max(200).optional(),
  nextFollowUpAt: z.string().datetime().optional(),
  leadStatus: z.enum(["unreviewed", "nurture", "disqualified"]).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.choice === "schedule" && (!data.nextAction || !data.nextFollowUpAt)) ctx.addIssue({ code: "custom", message: "Provide a next action and date" });
  if (data.choice === "clear" && !data.leadStatus) ctx.addIssue({ code: "custom", message: "Choose a non-active lead status before clearing the follow-up" });
});

export const CreateTaskSchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
  dueAt: z.string().datetime().optional().nullable(),
  source: z.string().max(50).optional().default("manual"),
  ownerUserId: z.string().uuid().optional(),
});

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  followThrough: TaskFollowThroughSchema.optional(),
}).strict().superRefine((data, ctx) => {
  if (data.followThrough && data.status !== "done") ctx.addIssue({ code: "custom", message: "Follow-through applies only when completing a task" });
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
