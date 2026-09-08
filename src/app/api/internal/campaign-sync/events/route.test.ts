import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const { prisma, tx } = vi.hoisted(() => {
  const tx = {
    contact: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
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

const TOKEN = "campaign-sync-test-token";

function eventRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/internal/campaign-sync/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-campaign-sync-token": TOKEN,
    },
    body: JSON.stringify({
      eventId: "event_1",
      occurredAt: "2026-07-28T20:00:00.000Z",
      ...body,
    }),
  });
}

function crmContact(overrides: Record<string, unknown> = {}) {
  return {
    id: "a4d18688-d878-40b8-8120-e70e9cc57f63",
    email: null,
    phone: "(555) 123-4567",
    phoneNormalized: "+15551234567",
    lifecycleStage: "customer",
    tags: [] as string[],
    lastTouchAt: null,
    ...overrides,
  };
}

describe("campaign event ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CAMPAIGN_STUDIO_SYNC_TOKEN = TOKEN;
    tx.contact.update.mockResolvedValue({});
    tx.campaignSyncReceipt.create.mockResolvedValue({ id: "receipt_1" });
    tx.interaction.create.mockResolvedValue({ id: "interaction_1" });
  });

  it("falls back to email when a stale CRM contact ID is supplied", async () => {
    const contact = crmContact({ email: "person@example.com" });
    tx.contact.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(contact);

    const response = await POST(
      eventRequest({
        eventType: "OPENED",
        crmContactId: "88a2e17f-58a9-4100-9825-e6b38df0349e",
        email: "Person@Example.com",
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
    expect(tx.contact.findMany).not.toHaveBeenCalled();
    expect(tx.campaignSyncReceipt.create).toHaveBeenCalledOnce();
    expect(tx.interaction.create).toHaveBeenCalledOnce();
    expect(tx.interaction.create.mock.calls[0][0].data).toMatchObject({ type: "email" });
  });

  it("resolves a phone-only contact by unique normalized phone", async () => {
    const contact = crmContact();
    tx.contact.findMany.mockResolvedValue([contact]);

    const response = await POST(
      eventRequest({
        eventType: "SMS_SENT",
        phone: "555-123-4567",
        campaignName: "Sunday Seeds #12",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      duplicate: false,
      matched: true,
      contactId: contact.id,
    });
    expect(tx.contact.findUnique).not.toHaveBeenCalled();
    expect(tx.contact.findMany).toHaveBeenCalledWith({
      where: { phoneNormalized: "+15551234567" },
      take: 2,
    });
    expect(tx.campaignSyncReceipt.create.mock.calls[0][0].data).toMatchObject({
      externalEventId: "event_1",
      eventType: "SMS_SENT",
      contactId: contact.id,
    });
  });

  it("records the receipt but does not guess when the phone matches several contacts", async () => {
    tx.contact.findMany.mockResolvedValue([
      crmContact(),
      crmContact({ id: "b4d18688-d878-40b8-8120-e70e9cc57f64" }),
    ]);

    const response = await POST(eventRequest({ eventType: "SMS_SENT", phone: "5551234567" }));

    await expect(response.json()).resolves.toMatchObject({ ok: true, matched: false });
    expect(tx.campaignSyncReceipt.create).toHaveBeenCalledOnce();
    expect(tx.contact.update).not.toHaveBeenCalled();
    expect(tx.interaction.create).not.toHaveBeenCalled();
  });

  it("logs SMS_SENT as an sms interaction and advances lastTouchAt without touching tags", async () => {
    const contact = crmContact({ tags: ["SMS Opt-In"], lastTouchAt: new Date("2026-01-01T00:00:00Z") });
    tx.contact.findMany.mockResolvedValue([contact]);

    await POST(
      eventRequest({
        eventType: "SMS_SENT",
        phone: "5551234567",
        campaignName: "Sunday Seeds #12",
      })
    );

    expect(tx.contact.update).toHaveBeenCalledWith({
      where: { id: contact.id },
      data: { lastTouchAt: new Date("2026-07-28T20:00:00.000Z") },
    });
    expect(tx.interaction.create.mock.calls[0][0].data).toMatchObject({
      contactId: contact.id,
      type: "sms",
      summary: "Sunday Seeds #12 text sent.",
      outcome: "sms_sent",
      occurredAt: new Date("2026-07-28T20:00:00.000Z"),
    });
  });

  it("logs SMS_FAILED as an sms interaction with no tag change", async () => {
    const contact = crmContact({ tags: ["SMS Opt-In"] });
    tx.contact.findMany.mockResolvedValue([contact]);

    await POST(
      eventRequest({
        eventType: "SMS_FAILED",
        phone: "5551234567",
        campaignName: "Sunday Seeds #12",
        metadata: { error: "Unreachable destination" },
      })
    );

    const update = tx.contact.update.mock.calls[0][0];
    expect(update.data.tags).toBeUndefined();
    expect(tx.interaction.create.mock.calls[0][0].data).toMatchObject({
      type: "sms",
      summary: "Sunday Seeds #12 text failed to send (Unreachable destination).",
      outcome: "sms_failed",
    });
  });

  it("SMS_OPT_OUT adds Do Not Text, removes SMS Opt-In, and logs the STOP", async () => {
    const contact = crmContact({ tags: ["SMS Opt-In", "VIP"] });
    tx.contact.findMany.mockResolvedValue([contact]);

    const response = await POST(eventRequest({ eventType: "SMS_OPT_OUT", phone: "5551234567" }));

    expect(response.status).toBe(200);
    const update = tx.contact.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: contact.id });
    expect([...update.data.tags].sort()).toEqual(["Do Not Text", "VIP"]);
    expect(update.data).not.toHaveProperty("lifecycleStage");
    expect(tx.interaction.create.mock.calls[0][0].data).toMatchObject({
      type: "sms",
      summary: "Opted out of SMS (STOP).",
      outcome: "sms_opt_out",
    });
  });

  it("SMS_OPT_IN adds SMS Opt-In when the contact has no opt-out", async () => {
    const contact = crmContact({ tags: ["VIP"] });
    tx.contact.findMany.mockResolvedValue([contact]);

    await POST(eventRequest({ eventType: "SMS_OPT_IN", phone: "5551234567" }));

    const update = tx.contact.update.mock.calls[0][0];
    expect([...update.data.tags].sort()).toEqual(["SMS Opt-In", "VIP"]);
    expect(tx.interaction.create.mock.calls[0][0].data).toMatchObject({
      type: "sms",
      summary: "Opted in to SMS.",
      outcome: "sms_opt_in",
    });
  });

  it("SMS_OPT_IN is ignored while Do Not Text is present (Do Not Text wins)", async () => {
    const contact = crmContact({ tags: ["Do Not Text"] });
    tx.contact.findMany.mockResolvedValue([contact]);

    await POST(eventRequest({ eventType: "SMS_OPT_IN", phone: "5551234567" }));

    const update = tx.contact.update.mock.calls[0][0];
    expect(update.data.tags).toEqual(["Do Not Text"]);
    // The opt-in attempt is still visible in the timeline.
    expect(tx.interaction.create).toHaveBeenCalledOnce();
  });

  it("resolves SMS events by crmContactId before phone", async () => {
    const contact = crmContact({ tags: [] });
    tx.contact.findUnique.mockResolvedValue(contact);

    await POST(
      eventRequest({
        eventType: "SMS_OPT_OUT",
        crmContactId: contact.id,
        phone: "5551234567",
      })
    );

    expect(tx.contact.findUnique).toHaveBeenCalledWith({ where: { id: contact.id } });
    expect(tx.contact.findMany).not.toHaveBeenCalled();
    expect(tx.contact.update.mock.calls[0][0].data.tags).toEqual(["Do Not Text"]);
  });

  it("treats a replayed SMS event as an idempotent duplicate", async () => {
    tx.contact.findMany.mockResolvedValue([crmContact({ tags: ["SMS Opt-In"] })]);
    tx.campaignSyncReceipt.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      })
    );

    const response = await POST(eventRequest({ eventType: "SMS_OPT_OUT", phone: "5551234567" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, duplicate: true });
    expect(tx.contact.update).not.toHaveBeenCalled();
    expect(tx.interaction.create).not.toHaveBeenCalled();
  });

  it("rejects SMS events that carry no identifier", async () => {
    const response = await POST(eventRequest({ eventType: "SMS_SENT" }));
    expect(response.status).toBe(400);
    expect(tx.campaignSyncReceipt.create).not.toHaveBeenCalled();
  });
});
