import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { prisma, tx } = vi.hoisted(() => {
  const tx = {
    contact: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn((callback) => callback(tx)),
      contact: { findMany: vi.fn() },
      user: { findUnique: vi.fn() },
    },
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma }));

import { GET, POST } from "./route";

const TOKEN = "campaign-sync-test-token";
const URL = "http://localhost/api/internal/campaign-sync/contacts";

function getRequest(query = "") {
  return new NextRequest(`${URL}${query}`, {
    headers: { "x-campaign-sync-token": TOKEN },
  });
}

function postRequest(contacts: unknown[]) {
  return new NextRequest(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-campaign-sync-token": TOKEN,
    },
    body: JSON.stringify({ contacts }),
  });
}

function crmContact(overrides: Record<string, unknown> = {}) {
  return {
    id: "a4d18688-d878-40b8-8120-e70e9cc57f63",
    email: null,
    firstName: "Jordan",
    lastName: null,
    phone: "(555) 123-4567",
    phoneNormalized: "+15551234567",
    source: "Sunday Seeds",
    lifecycleStage: "lead",
    tags: [] as string[],
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    lastTouchAt: null,
    ...overrides,
  };
}

const baseUpsert = {
  externalContactId: "ext_1",
  subscribed: false,
  consentGiven: false,
};

describe("campaign contact export (GET)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CAMPAIGN_STUDIO_SYNC_TOKEN = TOKEN;
  });

  it("includes phone-only contacts and returns derived SMS state", async () => {
    prisma.contact.findMany.mockResolvedValue([
      crmContact({ tags: ["SMS Opt-In"] }),
      crmContact({
        id: "b4d18688-d878-40b8-8120-e70e9cc57f64",
        email: "person@example.com",
        tags: ["SMS Opt-In", "Do Not Text"],
      }),
    ]);

    const response = await GET(getRequest("?limit=50"));
    expect(response.status).toBe(200);
    const body = await response.json();

    const where = prisma.contact.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({
      OR: [{ email: { not: null } }, { phoneNormalized: { not: null } }],
    });
    expect(prisma.contact.findMany.mock.calls[0][0].select).toMatchObject({
      phoneNormalized: true,
    });

    expect(body.ok).toBe(true);
    expect(body.hasMore).toBe(false);
    expect(body.contacts[0]).toMatchObject({
      crmContactId: "a4d18688-d878-40b8-8120-e70e9cc57f63",
      email: null,
      phoneNormalized: "+15551234567",
      smsConsentGiven: true,
      smsOptedOut: false,
      smsConsentSource: "crm:tag",
    });
    expect(body.contacts[1]).toMatchObject({
      email: "person@example.com",
      smsConsentGiven: false,
      smsOptedOut: true,
      smsConsentSource: null,
    });
  });

  it("keeps cursor pagination alongside the reachability filter", async () => {
    prisma.contact.findMany.mockResolvedValue([]);
    const cursor = Buffer.from(
      JSON.stringify({ updatedAt: "2026-09-01T12:00:00.000Z", id: "cursor-id" }),
      "utf8"
    ).toString("base64url");

    const response = await GET(getRequest(`?cursor=${cursor}`));
    expect(response.status).toBe(200);

    const where = prisma.contact.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(2);
    expect(where.AND[1]).toEqual({
      OR: [
        { updatedAt: { gt: new Date("2026-09-01T12:00:00.000Z") } },
        { updatedAt: new Date("2026-09-01T12:00:00.000Z"), id: { gt: "cursor-id" } },
      ],
    });
  });
});

describe("campaign contact import (POST)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CAMPAIGN_STUDIO_SYNC_TOKEN = TOKEN;
    delete process.env.CAMPAIGN_SYNC_DEFAULT_OWNER_EMAIL;
    tx.contact.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    tx.contact.create.mockImplementation(async ({ data }) => ({ id: "new-contact-id", ...data }));
  });

  it("rejects a contact with neither email nor phone", async () => {
    const response = await POST(postRequest([{ ...baseUpsert, email: null }]));
    expect(response.status).toBe(400);
    expect(tx.contact.create).not.toHaveBeenCalled();
  });

  it("matches by lowercased email before considering the phone", async () => {
    const existing = crmContact({ email: "person@example.com", tags: ["VIP"] });
    tx.contact.findUnique.mockResolvedValue(existing);

    const response = await POST(
      postRequest([
        {
          ...baseUpsert,
          email: "Person@Example.com",
          phone: "555-123-4567",
          smsConsentGiven: true,
          tags: ["Sunday Seeds"],
        },
      ])
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      mappings: [{ externalContactId: "ext_1", crmContactId: existing.id }],
    });
    expect(tx.contact.findUnique).toHaveBeenCalledWith({ where: { email: "person@example.com" } });
    expect(tx.contact.findMany).not.toHaveBeenCalled();
    expect(tx.contact.create).not.toHaveBeenCalled();

    const update = tx.contact.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: existing.id });
    expect(update.data.email).toBeUndefined();
    expect([...update.data.tags].sort()).toEqual(
      ["Campaign Studio", "SMS Opt-In", "Sunday Seeds", "VIP"].sort()
    );
  });

  it("matches a phone-only contact by unique phoneNormalized", async () => {
    const existing = crmContact();
    tx.contact.findMany.mockResolvedValue([existing]);

    const response = await POST(
      postRequest([
        { ...baseUpsert, email: null, phone: "555.123.4567", smsConsentGiven: true },
      ])
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      mappings: [{ externalContactId: "ext_1", crmContactId: existing.id }],
    });
    expect(tx.contact.findUnique).not.toHaveBeenCalled();
    expect(tx.contact.findMany).toHaveBeenCalledWith({
      where: { phoneNormalized: "+15551234567" },
      take: 2,
    });
    expect(tx.contact.create).not.toHaveBeenCalled();
    expect(tx.contact.update.mock.calls[0][0].data).toMatchObject({
      phoneNormalized: "+15551234567",
      tags: expect.arrayContaining(["Campaign Studio", "SMS Opt-In"]),
    });
  });

  it("matches by phoneNormalized when only that field is supplied", async () => {
    const existing = crmContact();
    tx.contact.findMany.mockResolvedValue([existing]);

    const response = await POST(
      postRequest([{ ...baseUpsert, phoneNormalized: "+15551234567" }])
    );

    expect(response.status).toBe(200);
    expect(tx.contact.findMany).toHaveBeenCalledWith({
      where: { phoneNormalized: "+15551234567" },
      take: 2,
    });
    expect(tx.contact.update).toHaveBeenCalledOnce();
    expect(tx.contact.create).not.toHaveBeenCalled();
  });

  it("creates a new phone-only contact with a null email when nothing matches", async () => {
    tx.contact.findMany.mockResolvedValue([]);

    const response = await POST(
      postRequest([
        {
          ...baseUpsert,
          email: null,
          firstName: "Jordan",
          phone: "5551234567",
          source: "Sunday Seeds",
          smsConsentGiven: true,
          tags: ["Sunday Seeds"],
        },
      ])
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      mappings: [{ externalContactId: "ext_1", crmContactId: "new-contact-id" }],
    });
    expect(tx.contact.update).not.toHaveBeenCalled();
    const created = tx.contact.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      email: null,
      firstName: "Jordan",
      phone: "5551234567",
      phoneNormalized: "+15551234567",
      source: "Sunday Seeds",
      lifecycleStage: "lead",
    });
    expect([...created.tags].sort()).toEqual(["Campaign Studio", "SMS Opt-In", "Sunday Seeds"]);
  });

  it("uses the normalized number as the display phone when only phoneNormalized is sent", async () => {
    tx.contact.findMany.mockResolvedValue([]);

    await POST(postRequest([{ ...baseUpsert, phoneNormalized: "+15551234567" }]));

    expect(tx.contact.create.mock.calls[0][0].data).toMatchObject({
      email: null,
      phone: "+15551234567",
      phoneNormalized: "+15551234567",
    });
  });

  it("creates a new contact rather than guessing when the phone is ambiguous", async () => {
    tx.contact.findMany.mockResolvedValue([
      crmContact(),
      crmContact({ id: "b4d18688-d878-40b8-8120-e70e9cc57f64" }),
    ]);

    const response = await POST(
      postRequest([{ ...baseUpsert, email: null, phone: "5551234567" }])
    );

    expect(response.status).toBe(200);
    expect(tx.contact.update).not.toHaveBeenCalled();
    expect(tx.contact.create).toHaveBeenCalledOnce();
  });

  it("enriches a phone-matched contact with a newly learned email", async () => {
    const existing = crmContact({ email: null });
    tx.contact.findUnique.mockResolvedValue(null);
    tx.contact.findMany.mockResolvedValue([existing]);

    const response = await POST(
      postRequest([{ ...baseUpsert, email: "New@Example.com", phone: "5551234567" }])
    );

    expect(response.status).toBe(200);
    expect(tx.contact.create).not.toHaveBeenCalled();
    expect(tx.contact.update.mock.calls[0][0].data.email).toBe("new@example.com");
  });

  it("does not attach an incoming email to a phone match that already owns another email", async () => {
    tx.contact.findUnique.mockResolvedValue(null);
    tx.contact.findMany.mockResolvedValue([crmContact({ email: "other@example.com" })]);

    const response = await POST(
      postRequest([{ ...baseUpsert, email: "new@example.com", phone: "5551234567" }])
    );

    expect(response.status).toBe(200);
    expect(tx.contact.update).not.toHaveBeenCalled();
    expect(tx.contact.create.mock.calls[0][0].data.email).toBe("new@example.com");
  });

  it("adds Do Not Text and removes SMS Opt-In when the contact opted out", async () => {
    tx.contact.findMany.mockResolvedValue([crmContact({ tags: ["SMS Opt-In", "VIP"] })]);

    await POST(postRequest([{ ...baseUpsert, phone: "5551234567", smsOptedOut: true }]));

    const tags = tx.contact.update.mock.calls[0][0].data.tags as string[];
    expect(tags).toContain("Do Not Text");
    expect(tags).not.toContain("SMS Opt-In");
    expect(tags).toContain("VIP");
  });

  it("ignores opt-in when the CRM already has Do Not Text (Do Not Text wins)", async () => {
    tx.contact.findMany.mockResolvedValue([crmContact({ tags: ["Do Not Text"] })]);

    await POST(
      postRequest([
        {
          ...baseUpsert,
          phone: "5551234567",
          smsConsentGiven: true,
          smsOptedOut: false,
          smsConsentAt: "2026-09-01T12:00:00.000Z",
        },
      ])
    );

    const tags = tx.contact.update.mock.calls[0][0].data.tags as string[];
    expect(tags).toContain("Do Not Text");
    expect(tags).not.toContain("SMS Opt-In");
  });

  it("never removes Do Not Text, even when Campaign Studio sends SMS Opt-In as a tag", async () => {
    tx.contact.findMany.mockResolvedValue([crmContact({ tags: ["Do Not Text"] })]);

    await POST(
      postRequest([
        { ...baseUpsert, phone: "5551234567", smsOptedOut: false, tags: ["SMS Opt-In"] },
      ])
    );

    const tags = tx.contact.update.mock.calls[0][0].data.tags as string[];
    expect(tags).toContain("Do Not Text");
    expect(tags).not.toContain("SMS Opt-In");
  });

  it("adds Marketing Consent and dedupes verbatim tags", async () => {
    tx.contact.findMany.mockResolvedValue([crmContact({ tags: ["Sunday Seeds"] })]);

    await POST(
      postRequest([
        {
          ...baseUpsert,
          phone: "5551234567",
          subscribed: true,
          consentGiven: true,
          tags: ["Sunday Seeds", "Cohort 4", "Cohort 4"],
        },
      ])
    );

    const data = tx.contact.update.mock.calls[0][0].data;
    expect([...data.tags].sort()).toEqual(
      ["Campaign Studio", "Cohort 4", "Marketing Consent", "Sunday Seeds"].sort()
    );
    expect(data.lifecycleStage).toBe("subscriber");
  });

  it("keeps a non-lead lifecycle stage on existing contacts", async () => {
    tx.contact.findMany.mockResolvedValue([crmContact({ lifecycleStage: "customer" })]);

    await POST(
      postRequest([{ ...baseUpsert, phone: "5551234567", subscribed: true, consentGiven: true }])
    );

    expect(tx.contact.update.mock.calls[0][0].data.lifecycleStage).toBe("customer");
  });
});
