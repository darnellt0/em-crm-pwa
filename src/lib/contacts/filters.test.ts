import { describe, expect, it } from "vitest";
import { buildContactWhere } from "./filters";

const userId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-07-28T17:00:00-07:00");

describe("buildContactWhere", () => {
  it("builds text, lifecycle, and tag filters", () => {
    expect(
      buildContactWhere({ q: "Jordan", stage: "prospect", tag: "Needs Review", userId, now })
    ).toMatchObject({
      lifecycleStage: "prospect",
      tags: { has: "Needs Review" },
      OR: [
        { firstName: { contains: "Jordan", mode: "insensitive" } },
        { lastName: { contains: "Jordan", mode: "insensitive" } },
        { email: { contains: "Jordan", mode: "insensitive" } },
        { phone: { contains: "Jordan" } },
      ],
    });
  });

  it("supports current-user and unassigned owner queues", () => {
    expect(buildContactWhere({ owner: "me", userId, now })).toEqual({ ownerUserId: userId });
    expect(buildContactWhere({ owner: "unassigned", userId, now })).toEqual({ ownerUserId: null });
  });

  it("supports contacts without a scheduled follow-up", () => {
    expect(buildContactWhere({ followUp: "none", userId, now })).toEqual({ nextFollowUpAt: null });
  });

  it("builds a bounded seven-day follow-up queue", () => {
    const where = buildContactWhere({ followUp: "7days", userId, now });
    expect(where.nextFollowUpAt).toEqual({
      gte: now,
      lte: new Date("2026-08-04T17:00:00-07:00"),
    });
  });
});
