import { z } from "zod";

const CurrencyAmountSchema = z
  .number()
  .positive()
  .finite()
  .max(9_999_999_999.99)
  .multipleOf(0.01);

export const CreateInvoiceSchema = z
  .object({
    contactId: z.string().uuid(),
    amount: CurrencyAmountSchema,
    status: z.enum(["draft", "sent", "paid", "void"]).default("draft"),
    issueDate: z.string().datetime(),
    dueDate: z.string().datetime(),
    notes: z.string().max(5000).optional().nullable(),
  })
  .refine((data) => new Date(data.dueDate) >= new Date(data.issueDate), {
    message: "Due date cannot be before the issue date",
    path: ["dueDate"],
  });

const EDITABLE_FIELDS = ["amount", "status", "issueDate", "dueDate", "notes"] as const;

export const EditInvoiceSchema = z
  .object({
    amount: CurrencyAmountSchema.optional(),
    status: z.enum(["draft", "sent", "paid", "void"]).optional(),
    issueDate: z.string().datetime().optional(),
    dueDate: z.string().datetime().optional(),
    notes: z.string().max(5000).optional().nullable(),
    changeNote: z.string().max(500).optional().nullable(),
  })
  .refine((data) => EDITABLE_FIELDS.some((field) => data[field] !== undefined), {
    message: "At least one invoice field must be provided",
  });

export type CreateInvoice = z.infer<typeof CreateInvoiceSchema>;
export type EditInvoice = z.infer<typeof EditInvoiceSchema>;
