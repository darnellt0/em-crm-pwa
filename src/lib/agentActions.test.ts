import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  actionUpdateMany: vi.fn(),
  actionFindUniqueOrThrow: vi.fn(),
  actionUpdate: vi.fn(),
  taskCreate: vi.fn(),
  interactionCreate: vi.fn(),
  contactFindUniqueOrThrow: vi.fn(),
  contactUpdate: vi.fn(),
}));

const transactionClient = {
  agentActionRequest: {
    updateMany: mocks.actionUpdateMany,
    findUniqueOrThrow: mocks.actionFindUniqueOrThrow,
    update: mocks.actionUpdate,
  },
  task: { create: mocks.taskCreate },
  interaction: { create: mocks.interactionCreate },
  contact: {
    findUniqueOrThrow: mocks.contactFindUniqueOrThrow,
    update: mocks.contactUpdate,
  },
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    agentActionRequest: {
      updateMany: mocks.actionUpdateMany,
    },
  },
}));

import { approveAndExecuteAgentAction, executeAgentAction } from "./agentActions";

describe("agent action execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback(transactionClient));
  });

  it("creates a task owned by the human reviewer only after execution", async () => {
    mocks.taskCreate.mockResolvedValue({ id: "task-1", title: "Call Jane" });

    const result = await executeAgentAction(
      transactionClient as unknown as Prisma.TransactionClient,
      {
        actionType: "create_task",
        title: "Call Jane",
        priority: "high",
        contactId: null,
      },
      "reviewer-1"
    );

    expect(mocks.taskCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: "reviewer-1",
        title: "Call Jane",
        priority: "high",
        source: "openclaw:nia",
      }),
      select: { id: true, title: true },
    });
    expect(result).toEqual({ entityType: "task", entityId: "task-1", title: "Call Jane" });
  });

  it("adds normalized tags without removing existing tags", async () => {
    mocks.contactFindUniqueOrThrow.mockResolvedValue({ tags: ["customer"] });
    mocks.contactUpdate.mockResolvedValue({ id: "contact-1", tags: ["customer", "vip"] });

    await executeAgentAction(
      transactionClient as unknown as Prisma.TransactionClient,
      {
        actionType: "add_tags",
        contactId: "d2891351-95e3-4c87-a734-49f857260b7e",
        tags: ["VIP", "vip"],
      },
      "reviewer-1"
    );

    expect(mocks.contactUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tags: ["customer", "vip"] } })
    );
  });

  it("atomically claims a pending proposal, executes it, and records the result", async () => {
    mocks.actionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.actionFindUniqueOrThrow.mockResolvedValue({
      payload: { actionType: "create_task", title: "Review proposal", priority: "low" },
    });
    mocks.taskCreate.mockResolvedValue({ id: "task-2", title: "Review proposal" });
    mocks.actionUpdate.mockResolvedValue({ id: "action-1", status: "executed" });

    await expect(approveAndExecuteAgentAction("action-1", "reviewer-1")).resolves.toMatchObject({
      status: "executed",
    });

    expect(mocks.actionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "pending" }) })
    );
    expect(mocks.taskCreate).toHaveBeenCalledTimes(1);
    expect(mocks.actionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "executed", executedAt: expect.any(Date) }),
      })
    );
  });
});
