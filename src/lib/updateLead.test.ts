import { beforeEach, describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { UpdateLeadSchema } from "./leads";
import { updateLead } from "./updateLead";
const tx = { contact: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn() }, interaction: { create: vi.fn() }, task: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() } };
const data = UpdateLeadSchema.parse({ expectedUpdatedAt: "2026-09-15T00:00:00.000Z", leadStatus: "active", ownerUserId: "bcb24b7d-4381-4f97-b6e8-ee927d1f104a", nextFollowUpAt: "2026-09-18T07:00:00Z", leadNextAction: "Review with Shria", reviewNote: "Calendar verified; outcome needs confirmation", createTask: true });
describe("lead review write", () => {
  beforeEach(() => { vi.resetAllMocks(); tx.contact.findUniqueOrThrow.mockResolvedValue({ leadStatus: "unreviewed" }); tx.contact.updateMany.mockResolvedValue({ count: 1 }); });
  it("records evidence without touching lifecycle, consent, or last contact", async () => {
    await updateLead(tx as unknown as Prisma.TransactionClient, "c1", data, "u1");
    const write = tx.contact.updateMany.mock.calls[0][0];
    for (const key of ["lastTouchAt", "tags", "lifecycleStage"]) expect(write.data).not.toHaveProperty(key);
    expect(write.where.updatedAt).toEqual(new Date(data.expectedUpdatedAt));
    expect(tx.interaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "note", summary: expect.stringContaining(data.reviewNote), createdByUserId: "u1" }) });
    expect(tx.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({ contactId: "c1", ownerUserId: data.ownerUserId, source: "lead-tracking" }) });
  });
  it("rejects stale/replayed writes before creating notes or tasks", async () => {
    tx.contact.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateLead(tx as unknown as Prisma.TransactionClient, "c1", data, "u1")).rejects.toThrow("LEAD_CONFLICT");
    expect(tx.task.create).not.toHaveBeenCalled(); expect(tx.interaction.create).not.toHaveBeenCalled();
  });
  it("updates only the dedicated lead task, rather than adding duplicates", async () => {
    tx.task.findFirst.mockResolvedValue({ id: "existing" });
    await updateLead(tx as unknown as Prisma.TransactionClient, "c1", data, "u1");
    expect(tx.task.create).not.toHaveBeenCalled();
    expect(tx.task.update).toHaveBeenCalledWith({ where: { id: "existing" }, data: expect.objectContaining({ title: data.leadNextAction }) });
  });
});
