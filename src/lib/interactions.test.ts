import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { advanceLastTouch } from "./interactions";
import { readFileSync } from "node:fs";

describe("last-contact chronology", () => {
  it("renders the stored contact date, not the newest internal note", () => {
    const page = readFileSync("src/app/(dashboard)/contacts/[id]/page.tsx", "utf8");
    expect(page).toContain("Last contact: {new Date(contact.lastTouchAt)");
    expect(page).not.toContain("lastInteraction.occurredAt");
  });
  it.each(["note", "other"])("does not mark %s as contact", async type => {
    const updateMany = vi.fn();
    await advanceLastTouch({ contact: { updateMany } } as unknown as Prisma.TransactionClient, "c1", type, new Date());
    expect(updateMany).not.toHaveBeenCalled();
  });
  it.each(["call", "email", "meeting", "sms"])("uses the actual %s date with an atomic monotonic condition", async type => {
    const updateMany = vi.fn(); const date = new Date("2026-08-10T18:30:00Z");
    await advanceLastTouch({ contact: { updateMany } } as unknown as Prisma.TransactionClient, "c1", type, date);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "c1", OR: [{ lastTouchAt: null }, { lastTouchAt: { lt: date } }] }, data: { lastTouchAt: date } });
  });
  it("never advances contact time into the future", async () => {
    const updateMany = vi.fn();
    await advanceLastTouch({ contact: { updateMany } } as unknown as Prisma.TransactionClient, "c1", "meeting", new Date(Date.now() + 86400000));
    expect(updateMany).not.toHaveBeenCalled();
  });
  it("ships a one-time repair for historical campaign-polluted contact dates", () => {
    const migration = readFileSync("prisma/migrations/20260915233000_repair_last_touch/migration.sql", "utf8");
    expect(migration).toContain('UPDATE "Contact"');
    expect(migration).toContain('MAX(i."occurredAt")');
    expect(migration).toContain("'opened'");
    expect(migration).toContain("'sms_failed'");
    expect(migration).toContain('i."occurredAt" <= CURRENT_TIMESTAMP');
  });
});
