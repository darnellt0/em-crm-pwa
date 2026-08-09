import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireUserOrInternalToken } from "./requireUserOrInternalToken";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

function request(token?: string) {
  return new NextRequest("http://localhost/api/contacts", {
    headers: token ? { "x-internal-token": token } : undefined,
  });
}

afterEach(() => {
  delete process.env.INTERNAL_SERVICE_TOKEN;
  vi.restoreAllMocks();
});

describe("requireUserOrInternalToken", () => {
  it("accepts a valid internal service token", async () => {
    process.env.INTERNAL_SERVICE_TOKEN = "test-service-token-123";
    const result = await requireUserOrInternalToken(request("test-service-token-123"), "staff");
    expect(result.userId).toBe("internal-service");
    expect(result.role).toBe("staff");
  });

  it("rejects an invalid internal token and falls through to session auth", async () => {
    process.env.INTERNAL_SERVICE_TOKEN = "correct-token";
    await expect(
      requireUserOrInternalToken(request("wrong-token"), "staff")
    ).rejects.toThrow("UNAUTHENTICATED");
  });

  it("rejects when no token and no session", async () => {
    process.env.INTERNAL_SERVICE_TOKEN = "correct-token";
    await expect(
      requireUserOrInternalToken(request(), "staff")
    ).rejects.toThrow("UNAUTHENTICATED");
  });

  it("rejects when INTERNAL_SERVICE_TOKEN is not configured and no session", async () => {
    await expect(
      requireUserOrInternalToken(request("any-token"), "staff")
    ).rejects.toThrow("UNAUTHENTICATED");
  });

  it("internal token grants staff role regardless of minimumRole parameter", async () => {
    process.env.INTERNAL_SERVICE_TOKEN = "test-token";
    const result = await requireUserOrInternalToken(request("test-token"), "read_only");
    expect(result.role).toBe("staff");
  });
});
