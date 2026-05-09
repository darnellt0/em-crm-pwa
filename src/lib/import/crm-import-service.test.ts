import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCrmContactImport } from "./crm-import-service.js";

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findMany: vi.fn() },
    contact: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    importRow: { create: vi.fn() },
    importJob: { update: vi.fn() },
  },
}));

// Stub the normalizePhone import so tests are self-contained
vi.mock("@/lib/phone/normalize", () => ({
  normalizePhone: (raw: string | null | undefined) => {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7) return null;
    if (digits.length === 10) return `+1${digits}`;
    return `+${digits}`;
  },
}));

const prisma = mockPrisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no existing users, no existing orgs
  mockPrisma.user.findMany.mockResolvedValue([]);
  // contact.findUnique: use mockImplementation so mockResolvedValueOnce in tests
  // is not overridden by a persistent mockResolvedValue default.
  mockPrisma.contact.findUnique.mockImplementation(async () => null);
  mockPrisma.organization.findFirst.mockResolvedValue(null);
  mockPrisma.organization.create.mockResolvedValue({ id: "org_1", name: "ACME" });
  mockPrisma.contact.create.mockResolvedValue({ id: "c_new" });
  mockPrisma.contact.update.mockResolvedValue({ id: "c_existing" });
  mockPrisma.importRow.create.mockResolvedValue({});
  mockPrisma.importJob.update.mockResolvedValue({});
});

// ─── Identity anchor tests ────────────────────────────────────────────────────

describe("identity anchor", () => {
  it("skips rows with no email, phone, or name", async () => {
    const result = await runCrmContactImport(prisma, [{}]);
    expect(result.skipped).toBe(1);
    expect(result.rows[0].action).toBe("skipped");
    expect(mockPrisma.contact.create).not.toHaveBeenCalled();
  });

  it("allows phone-only contacts (no email)", async () => {
    const result = await runCrmContactImport(prisma, [
      { phone: "5551234567", firstName: "Jane" },
    ]);
    expect(result.created).toBe(1);
    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phoneNormalized: "+15551234567",
          email: undefined,
        }),
      })
    );
  });

  it("creates a contact with email and normalized phone", async () => {
    const result = await runCrmContactImport(prisma, [
      { email: "jane@example.com", phone: "5551234567", firstName: "Jane" },
    ]);
    expect(result.created).toBe(1);
    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "jane@example.com",
          phoneNormalized: "+15551234567",
        }),
      })
    );
  });
});

// ─── Deduplication tests ──────────────────────────────────────────────────────

describe("deduplication", () => {
  it("matches existing contact by email and updates it", async () => {
    mockPrisma.contact.findUnique.mockResolvedValueOnce({
      id: "c_existing",
      email: "jane@example.com",
      phone: null,
      phoneNormalized: null,
      tags: ["old-tag"],
      persona: null,
      firstName: "Jane",
      lastName: "Doe",
      source: "csv",
      lifecycleStage: "lead",
      leadScore: 0,
      ownerUserId: null,
      organizationId: null,
      nextFollowUpAt: null,
      lastTouchAt: null,
    });

    const result = await runCrmContactImport(prisma, [
      { email: "jane@example.com", tags: "new-tag" },
    ]);

    expect(result.updated).toBe(1);
    expect(result.rows[0].matchType).toBe("email");
    expect(result.rows[0].matchedContactId).toBe("c_existing");
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c_existing" },
        data: expect.objectContaining({
          tags: expect.arrayContaining(["old-tag", "new-tag"]),
        }),
      })
    );
  });

  it("falls back to phone deduplication when email does not match", async () => {
    // Row has no email — only the phone findUnique fires (email lookup is skipped)
    mockPrisma.contact.findUnique.mockResolvedValueOnce({
      id: "c_phone",
      email: null,
      phone: "5551234567",
      phoneNormalized: "+15551234567",
      tags: [],
      persona: null,
      firstName: "Bob",
      lastName: null,
      source: null,
      lifecycleStage: "lead",
      leadScore: 0,
      ownerUserId: null,
      organizationId: null,
      nextFollowUpAt: null,
      lastTouchAt: null,
    });

    const result = await runCrmContactImport(prisma, [
      { phone: "5551234567", firstName: "Bob" },
    ]);

    expect(result.updated).toBe(1);
    expect(result.rows[0].matchType).toBe("phone");
  });
});

// ─── Tag handling tests ───────────────────────────────────────────────────────

describe("tag handling", () => {
  it("merges tags (union) on update", async () => {
    mockPrisma.contact.findUnique.mockResolvedValueOnce({
      id: "c1",
      email: "a@example.com",
      phone: null,
      phoneNormalized: null,
      tags: ["existing-tag"],
      persona: null,
      firstName: null,
      lastName: null,
      source: null,
      lifecycleStage: "lead",
      leadScore: 0,
      ownerUserId: null,
      organizationId: null,
      nextFollowUpAt: null,
      lastTouchAt: null,
    });

    await runCrmContactImport(prisma, [
      { email: "a@example.com", tags: "new-tag,another-tag" },
    ]);

    const updateCall = mockPrisma.contact.update.mock.calls[0][0];
    expect(updateCall.data.tags).toEqual(
      expect.arrayContaining(["existing-tag", "new-tag", "another-tag"])
    );
    expect(new Set(updateCall.data.tags).size).toBe(updateCall.data.tags.length); // no duplicates
  });

  it("adds Needs Review tag when reviewStatus contains 'review'", async () => {
    const result = await runCrmContactImport(prisma, [
      { email: "review@example.com", reviewStatus: "Needs Review" },
    ]);
    expect(result.created).toBe(1);
    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tags: expect.arrayContaining(["Needs Review"]),
        }),
      })
    );
  });

  it("adds Email Bounce tag for bounced contacts", async () => {
    const result = await runCrmContactImport(prisma, [
      { email: "bounce@example.com", tags: "Email Bounce" },
    ]);
    expect(result.created).toBe(1);
    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tags: expect.arrayContaining(["Email Bounce"]),
        }),
      })
    );
  });

  it("does not duplicate tags on update", async () => {
    mockPrisma.contact.findUnique.mockResolvedValueOnce({
      id: "c1",
      email: "dup@example.com",
      phone: null,
      phoneNormalized: null,
      tags: ["newsletter", "vip"],
      persona: null,
      firstName: null,
      lastName: null,
      source: null,
      lifecycleStage: "lead",
      leadScore: 0,
      ownerUserId: null,
      organizationId: null,
      nextFollowUpAt: null,
      lastTouchAt: null,
    });

    await runCrmContactImport(prisma, [
      { email: "dup@example.com", tags: "newsletter,vip" },
    ]);

    const updateCall = mockPrisma.contact.update.mock.calls[0][0];
    const tagSet = new Set(updateCall.data.tags);
    expect(tagSet.size).toBe(updateCall.data.tags.length);
  });
});

// ─── Notes / persona tests ────────────────────────────────────────────────────

describe("notes (persona field)", () => {
  it("appends notes to existing persona without overwriting", async () => {
    mockPrisma.contact.findUnique.mockResolvedValueOnce({
      id: "c1",
      email: "notes@example.com",
      phone: null,
      phoneNormalized: null,
      tags: [],
      persona: "Original note.",
      firstName: null,
      lastName: null,
      source: null,
      lifecycleStage: "lead",
      leadScore: 0,
      ownerUserId: null,
      organizationId: null,
      nextFollowUpAt: null,
      lastTouchAt: null,
    });

    await runCrmContactImport(prisma, [
      { email: "notes@example.com", notes: "New note." },
    ]);

    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ persona: "Original note.\nNew note." }),
      })
    );
  });

  it("does not duplicate notes if same note already exists", async () => {
    mockPrisma.contact.findUnique.mockResolvedValueOnce({
      id: "c1",
      email: "notes@example.com",
      phone: null,
      phoneNormalized: null,
      tags: [],
      persona: "Existing note.",
      firstName: null,
      lastName: null,
      source: null,
      lifecycleStage: "lead",
      leadScore: 0,
      ownerUserId: null,
      organizationId: null,
      nextFollowUpAt: null,
      lastTouchAt: null,
    });

    await runCrmContactImport(prisma, [
      { email: "notes@example.com", notes: "Existing note." },
    ]);

    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ persona: "Existing note." }),
      })
    );
  });
});

// ─── Owner mapping tests ──────────────────────────────────────────────────────

describe("owner mapping", () => {
  it("maps owner email to userId when user exists", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "user_1", email: "darnell@example.com" },
    ]);

    await runCrmContactImport(prisma, [
      { email: "contact@example.com", owner: "darnell@example.com" },
    ]);

    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerUserId: "user_1" }),
      })
    );
  });

  it("ignores owner when user email does not exist", async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    await runCrmContactImport(prisma, [
      { email: "contact@example.com", owner: "unknown@example.com" },
    ]);

    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerUserId: undefined }),
      })
    );
  });
});

// ─── Organization tests ───────────────────────────────────────────────────────

describe("organization", () => {
  it("finds existing organization by name", async () => {
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org_existing", name: "ACME" });

    await runCrmContactImport(prisma, [
      { email: "contact@example.com", organization: "ACME" },
    ]);

    expect(mockPrisma.organization.create).not.toHaveBeenCalled();
    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: "org_existing" }),
      })
    );
  });

  it("creates organization when it does not exist", async () => {
    mockPrisma.organization.findFirst.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValue({ id: "org_new", name: "NewCo" });

    await runCrmContactImport(prisma, [
      { email: "contact@example.com", organization: "NewCo" },
    ]);

    expect(mockPrisma.organization.create).toHaveBeenCalledWith({ data: { name: "NewCo" } });
    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: "org_new" }),
      })
    );
  });
});

// ─── Priority / leadScore tests ───────────────────────────────────────────────

describe("priority to leadScore", () => {
  it("maps high priority to leadScore 80", async () => {
    await runCrmContactImport(prisma, [
      { email: "high@example.com", priority: "high" },
    ]);
    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadScore: 80 }) })
    );
  });

  it("maps medium priority to leadScore 50", async () => {
    await runCrmContactImport(prisma, [
      { email: "med@example.com", priority: "medium" },
    ]);
    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadScore: 50 }) })
    );
  });

  it("defaults leadScore to 0 when no priority", async () => {
    await runCrmContactImport(prisma, [{ email: "nopri@example.com" }]);
    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadScore: 0 }) })
    );
  });
});

// ─── nextFollowUpAt preservation tests ───────────────────────────────────────

describe("nextFollowUpAt preservation", () => {
  it("preserves existing nextFollowUpAt when import value is blank", async () => {
    const existingDate = new Date("2026-06-01");
    mockPrisma.contact.findUnique.mockResolvedValueOnce({
      id: "c1",
      email: "followup@example.com",
      phone: null,
      phoneNormalized: null,
      tags: [],
      persona: null,
      firstName: null,
      lastName: null,
      source: null,
      lifecycleStage: "lead",
      leadScore: 0,
      ownerUserId: null,
      organizationId: null,
      nextFollowUpAt: existingDate,
      lastTouchAt: null,
    });

    await runCrmContactImport(prisma, [
      { email: "followup@example.com" }, // no nextFollowUpAt
    ]);

    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nextFollowUpAt: existingDate }),
      })
    );
  });

  it("overwrites nextFollowUpAt when import provides a new date", async () => {
    mockPrisma.contact.findUnique.mockResolvedValueOnce({
      id: "c1",
      email: "followup@example.com",
      phone: null,
      phoneNormalized: null,
      tags: [],
      persona: null,
      firstName: null,
      lastName: null,
      source: null,
      lifecycleStage: "lead",
      leadScore: 0,
      ownerUserId: null,
      organizationId: null,
      nextFollowUpAt: new Date("2026-06-01"),
      lastTouchAt: null,
    });

    await runCrmContactImport(prisma, [
      { email: "followup@example.com", nextFollowUpAt: "2026-09-15" },
    ]);

    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nextFollowUpAt: new Date("2026-09-15") }),
      })
    );
  });
});

// ─── Dry run tests ────────────────────────────────────────────────────────────

describe("dry run", () => {
  it("does not write to database in dry run mode", async () => {
    const result = await runCrmContactImport(
      prisma,
      [{ email: "dry@example.com", firstName: "Dry" }],
      { dryRun: true }
    );

    expect(mockPrisma.contact.create).not.toHaveBeenCalled();
    expect(mockPrisma.contact.update).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(result.created).toBe(1);
  });

  it("still counts rows correctly in dry run mode", async () => {
    const result = await runCrmContactImport(
      prisma,
      [
        { email: "a@example.com" },
        { email: "b@example.com" },
        {}, // no anchor — skipped
      ],
      { dryRun: true }
    );

    expect(result.totalRows).toBe(3);
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(1);
  });
});

// ─── ImportJob finalization tests ─────────────────────────────────────────────

describe("ImportJob finalization", () => {
  it("updates ImportJob with final stats when importJobId is provided", async () => {
    await runCrmContactImport(
      prisma,
      [{ email: "a@example.com" }],
      { dryRun: false, importJobId: "job_1" }
    );

    expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_1" },
        data: expect.objectContaining({
          status: "completed",
          stats: expect.objectContaining({ created: 1, total: 1 }),
        }),
      })
    );
  });

  it("does not update ImportJob in dry run mode", async () => {
    await runCrmContactImport(
      prisma,
      [{ email: "a@example.com" }],
      { dryRun: true, importJobId: "job_1" }
    );

    expect(mockPrisma.importJob.update).not.toHaveBeenCalled();
  });
});
