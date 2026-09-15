import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    task: { findMany: vi.fn() },
    opportunity: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
    contact: { findMany: vi.fn() },
    interaction: { groupBy: vi.fn() },
    aiMemoryItem: { groupBy: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { getPriorityActions } from "./actionQueue.js";

describe("getPriorityActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.task.findMany.mockResolvedValue([]);
    prismaMock.opportunity.findMany.mockResolvedValue([]);
    prismaMock.invoice.findMany.mockResolvedValue([]);
    prismaMock.contact.findMany.mockResolvedValue([]);
    prismaMock.interaction.groupBy.mockResolvedValue([]);
    prismaMock.aiMemoryItem.groupBy.mockResolvedValue([]);
  });

  it("keeps unlinked review tasks visible and filters scoring to genuine contact", async () => {
    prismaMock.task.findMany.mockResolvedValue([{ id: "t1", title: "Review meeting outcome", status: "todo", contactId: null, dueAt: null }]);
    const actions = await getPriorityActions();
    expect(actions).toEqual([expect.objectContaining({ id: "t1", link: "/tasks" })]);
    expect(prismaMock.interaction.groupBy).toHaveBeenCalledTimes(4);
    for (const [args] of prismaMock.interaction.groupBy.mock.calls) {
      expect(args.where.AND[0]).toMatchObject({ type: { in: ["call", "email", "meeting", "sms"] }, occurredAt: { lte: expect.any(Date) }, OR: [{ outcome: null }, { outcome: { notIn: expect.arrayContaining(["opened", "sms_failed"]) } }] });
    }
  });

  it("excludes paid and void invoices from the focus queue", async () => {
    await getPriorityActions();

    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isLatest: true, status: { notIn: ["void", "paid"] } },
      })
    );
  });
});
