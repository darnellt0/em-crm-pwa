import { describe, expect, it } from "vitest";
import { CreateInvoiceSchema, EditInvoiceSchema } from "./invoice.js";

const validInvoice = {
  contactId: "c66b2256-5df5-4c04-a081-4e4d6cc6303f",
  amount: 125.25,
  issueDate: "2026-07-23T12:00:00.000Z",
  dueDate: "2026-08-23T12:00:00.000Z",
};

describe("invoice validation", () => {
  it("accepts amounts with at most two decimal places", () => {
    expect(CreateInvoiceSchema.safeParse(validInvoice).success).toBe(true);
    expect(EditInvoiceSchema.safeParse({ amount: 0.01 }).success).toBe(true);
  });

  it("rejects fractional cents and non-finite values", () => {
    expect(CreateInvoiceSchema.safeParse({ ...validInvoice, amount: 10.001 }).success).toBe(false);
    expect(EditInvoiceSchema.safeParse({ amount: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  it("rejects a due date before the issue date", () => {
    expect(
      CreateInvoiceSchema.safeParse({
        ...validInvoice,
        dueDate: "2026-07-01T12:00:00.000Z",
      }).success
    ).toBe(false);
  });

  it("rejects edits that change no invoice field", () => {
    expect(EditInvoiceSchema.safeParse({}).success).toBe(false);
    expect(EditInvoiceSchema.safeParse({ changeNote: "no-op" }).success).toBe(false);
    expect(EditInvoiceSchema.safeParse({ status: "sent" }).success).toBe(true);
  });
});
