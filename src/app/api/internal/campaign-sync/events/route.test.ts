import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { prisma, tx } = vi.hoisted(() => {
  const tx = {
    contact: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    campaignSyncReceipt: {
      create: vi.fn(),
    },
    interaction: {
      create: vi.fn(),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn((callback) => callback(tx)),
    },
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma }));

import { POST } from "./route";

describe("campaign event ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CAMPAIGN_STUDIO_SYNC_TOKEN = "campaign-sync-test-token";
  });

  it("falls back to email when a stale CRM contact ID is supplied", async () => {
    const contact = {
      id: "a4d18688-d878-40b8-8120-e70e9cc57f63",
      email: "person@example.com",
      tags: [],
      lastTouchAt: null,
    };
    tx.contact.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(contact);
    tx.contact.update.mockResolvedValue(contact);
    tx.campaignSyncReceipt.create.mockResolvedValue({ id: "receipt_1" });
    tx.interaction.create.mockResolvedValue({ id: "interaction_1" });

    const response = await POST(
      new NextRequest("http://localhost/api/internal/campaign-sync/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-campaign-sync-token": "campaign-sync-test-token",
        },
        body: JSON.stringify({
          eventId: "event_1",
          eventType: "OPENED",
          crmContactId: "88a2e17f-58a9-4100-9825-e6b38df0349e",
          email: "Person@Example.com",
          occurredAt: "2026-07-28T20:00:00.000Z",
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      matched: true,
      contactId: contact.id,
    });
    expect(tx.contact.findUnique).toHaveBeenNthCalledWith(2, {
      where: { email: "person@example.com" },
    });
    expect(tx.campaignSyncReceipt.create).toHaveBeenCalledOnce();
    expect(tx.interaction.create).toHaveBeenCalledOnce();
  });
});
