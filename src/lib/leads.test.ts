import { describe, it, expect } from "vitest";
import { LeadQuerySchema, UpdateLeadSchema, leadWhere } from "./leads";

const owner = "bcb24b7d-4381-4f97-b6e8-ee927d1f104a";
const base = { expectedUpdatedAt: "2026-09-15T00:00:00.000Z", leadStatus: "unreviewed", ownerUserId: null, nextFollowUpAt: null, leadNextAction: null, reviewNote: "Confirmed against the invitation" };
describe("lead review validation and queues", () => {
  it("requires owner, action and follow-up for an active lead", () => {
    const result = UpdateLeadSchema.safeParse({ ...base, leadStatus: "active" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(i => i.path[0])).toEqual(["ownerUserId", "nextFollowUpAt", "leadNextAction"]);
    expect(UpdateLeadSchema.safeParse({ ...base, leadStatus: "active", ownerUserId: owner, leadNextAction: "Review proposal", nextFollowUpAt: "2026-09-18T07:00:00Z" }).success).toBe(true);
  });
  it("requires task details even on a non-active contact", () => {
    expect(UpdateLeadSchema.safeParse({ ...base, createTask: true }).success).toBe(false);
  });
  it("rejects unknown statuses and consent/lifecycle mutations", () => {
    expect(UpdateLeadSchema.safeParse({ ...base, leadStatus: "won" }).success).toBe(false);
    expect(UpdateLeadSchema.safeParse({ ...base, lifecycleStage: "subscriber" }).success).toBe(false);
    expect(UpdateLeadSchema.safeParse({ ...base, tags: [] }).success).toBe(false);
  });
  it("validates queue names and pagination", () => {
    for (const input of [{ page: "NaN" }, { page: 0 }, { queue: "unknown" }, { owner: "invalid" }]) expect(LeadQuerySchema.safeParse(input).success).toBe(false);
  });
  it("does not infer active leads from the imported lifecycle stage", () => {
    expect(leadWhere(LeadQuerySchema.parse({}), owner)).toEqual({ AND: [{ leadStatus: "active" }] });
  });
  it("combines owner and search without overriding the queue", () => {
    const result = leadWhere(LeadQuerySchema.parse({ queue: "unreviewed", owner: "me", q: "Cristel" }), owner);
    expect(result.AND).toEqual(expect.arrayContaining([{ leadStatus: "unreviewed" }, { ownerUserId: owner }]));
    expect(JSON.stringify(result)).toContain("Cristel");
  });
  it("keeps today's follow-ups out of overdue", () => {
    const now = new Date(2026, 8, 15, 14);
    expect(leadWhere(LeadQuerySchema.parse({ queue: "overdue" }), owner, now)).toEqual({ AND: [{ leadStatus: { in: ["active", "nurture"] }, nextFollowUpAt: { lt: new Date(2026, 8, 15) } }] });
  });
});
