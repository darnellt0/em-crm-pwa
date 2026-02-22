import { z } from "zod";

export const CreateImportJobSchema = z.object({
  entity: z.enum(["contacts"]).default("contacts"),
  filename: z.string().min(1).max(255),
});

export const ImportMappingSchema = z.object({
  mapping: z.record(z.string(), z.string().nullable()),
});

export type CreateImportJob = z.infer<typeof CreateImportJobSchema>;
export type ImportMapping = z.infer<typeof ImportMappingSchema>;
