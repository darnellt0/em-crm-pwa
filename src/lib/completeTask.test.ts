import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { completeTask } from "./completeTask";
import { UpdateTaskSchema } from "./validations/task";

const stamp = "2026-09-15T20:00:00Z";
function fixture() {
  const contact = { id: "c1", ownerUserId: "u1", leadNextAction: "Old step" };
  const task = { id: "t1", contactId: "c1", contact, status: "todo", source: "lead-tracking", title: "Old step" };
  const tx = { task: { findUniqueOrThrow: vi.fn().mockResolvedValue(task), updateMany: vi.fn().mockResolvedValue({ count: 1 }), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() }, contact: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, interaction: { create: vi.fn() } };
  return { tx, client: tx as unknown as Prisma.TransactionClient, task };
}
const review = { choice: "keep" as const, expectedContactUpdatedAt: stamp, note: "Confirmed outcome reviewed" };
describe("task follow-through", () => {
  it("requires an explicit review for every contact-linked task", async () => {
    const { tx, client, task } = fixture();
    task.source = "manual";
    await expect(completeTask(client, "t1", { status: "done" }, "u1")).rejects.toThrow("FOLLOW_THROUGH_REQUIRED");
    expect(tx.task.updateMany).not.toHaveBeenCalled();
  });
  it("keeps follow-up without inventing a touch or changing consent", async () => {
    const { tx, client } = fixture();
    await completeTask(client, "t1", { status: "done", followThrough: review }, "u1");
    expect(tx.contact.updateMany.mock.calls[0][0].data).toEqual({ leadReviewedAt: expect.any(Date) });
    expect(tx.interaction.create.mock.calls[0][0].data.type).toBe("note");
    expect(tx.task.create).not.toHaveBeenCalled();
  });
  it("schedules the next owned task and updates the contact together", async () => {
    const { tx, client } = fixture();
    await completeTask(client, "t1", { status: "done", followThrough: { ...review, choice: "schedule", nextAction: "Confirm introduction", nextFollowUpAt: stamp } }, "u1");
    expect(tx.task.create).toHaveBeenCalledWith({ data: { contactId: "c1", ownerUserId: "u1", title: "Confirm introduction", dueAt: new Date(stamp), source: "lead-tracking" } });
    expect(tx.contact.updateMany.mock.calls[0][0].where.updatedAt).toEqual(new Date(stamp));
  });
  it("rejects stale contact or repeated task completions", async () => {
    const { tx, client, task } = fixture();
    tx.contact.updateMany.mockResolvedValue({ count: 0 });
    await expect(completeTask(client, "t1", { status: "done", followThrough: review }, "u1")).rejects.toThrow("TASK_CONFLICT");
    task.status = "done";
    await expect(completeTask(client, "t1", { status: "done", followThrough: review }, "u1")).rejects.toThrow("TASK_CONFLICT");
    expect(tx.task.create).not.toHaveBeenCalled();
  });
  it("requires a non-active classification to clear follow-up", () => {
    expect(UpdateTaskSchema.safeParse({ status: "done", followThrough: { ...review, choice: "clear" } }).success).toBe(false);
    expect(UpdateTaskSchema.safeParse({ status: "done", followThrough: { ...review, choice: "clear", leadStatus: "nurture" } }).success).toBe(true);
    expect(UpdateTaskSchema.safeParse({ status: "todo", followThrough: review }).success).toBe(false);
    expect(UpdateTaskSchema.safeParse({ status: "done", followThrough: { ...review, choice: "schedule" } }).success).toBe(false);
  });
  it("retires a separate open lead task when a manual task clears follow-up", async () => {
    const { tx, client, task } = fixture();
    task.source = "manual";
    await completeTask(client, "t1", {
      status: "done",
      followThrough: { ...review, choice: "clear", leadStatus: "nurture" },
    }, "u1");
    expect(tx.task.updateMany).toHaveBeenNthCalledWith(2, {
      where: { contactId: "c1", source: "lead-tracking", status: { not: "done" } },
      data: { status: "done" },
    });
  });
});
