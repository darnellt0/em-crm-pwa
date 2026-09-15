import { describe, it, expect } from "vitest";
import { UpdateOpportunitySchema } from "./opportunity";
describe("opportunity validation", () => {
  it("rejects invisible/custom stages and invalid amounts", () => {
    expect(UpdateOpportunitySchema.safeParse({ stage: "closed" }).success).toBe(false);
    expect(UpdateOpportunitySchema.safeParse({ value: -1 }).success).toBe(false);
    expect(UpdateOpportunitySchema.safeParse({ value: Infinity }).success).toBe(false);
  });
  it("supports unknown and zero values", () => {
    expect(UpdateOpportunitySchema.parse({ value: null })).toEqual({ value: null });
    expect(UpdateOpportunitySchema.parse({ value: 0 })).toEqual({ value: 0 });
  });
});
