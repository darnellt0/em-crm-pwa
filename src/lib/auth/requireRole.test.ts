import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));

import { handleAuthError, requireRole, requireUser } from "./requireRole";

describe("requireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: "user@example.com" } });
  });

  it("rejects requests without an authenticated database user", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("UNAUTHENTICATED");

    mocks.getServerSession.mockResolvedValue({ user: { email: "missing@example.com" } });
    mocks.findUnique.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("UNAUTHENTICATED");
  });

  it.each([
    ["read_only", "read_only", true],
    ["read_only", "staff", false],
    ["staff", "read_only", true],
    ["staff", "staff", true],
    ["staff", "partner_admin", false],
    ["partner_admin", "staff", true],
    ["partner_admin", "partner_admin", true],
    ["partner_admin", "admin", false],
    ["admin", "admin", true],
  ] as const)("checks %s against %s", async (actual, required, allowed) => {
    mocks.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
      role: actual,
    });

    const assertion = expect(requireRole(required));
    if (allowed) await assertion.resolves.toMatchObject({ role: actual });
    else await assertion.rejects.toThrow("FORBIDDEN_ROLE");
  });

  it("maps authentication errors to JSON status responses", async () => {
    expect(handleAuthError(new Error("UNAUTHENTICATED")).status).toBe(401);
    expect(handleAuthError(new Error("FORBIDDEN_ROLE")).status).toBe(403);
    expect(handleAuthError(new Error("unexpected")).status).toBe(500);
  });
});
