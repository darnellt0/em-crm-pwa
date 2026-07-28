import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    task: { findMany: vi.fn() },
    opportunity: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
    contact: { findMany: vi.fn() },
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
