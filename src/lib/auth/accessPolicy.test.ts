import { describe, expect, it } from "vitest";
import {
  canSignInWithEmail,
  getAllowedEmails,
  getConfiguredRole,
  isEmailAllowed,
  normalizeEmail,
  parseEmailList,
} from "./accessPolicy";

describe("accessPolicy", () => {
  it("normalizes and deduplicates email lists", () => {
    expect([...parseEmailList(" A@Example.com, a@example.com, B@example.com ")]).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(normalizeEmail(" User@Example.COM ")).toBe("user@example.com");
  });

  it("fails closed when no email is configured", () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(getAllowedEmails(env).size).toBe(0);
    expect(isEmailAllowed("anyone@example.com", env)).toBe(false);
  });

  it("allowlists explicit invitations and every role assignment", () => {
    const env = {
      ADMIN_EMAILS: "owner@example.com",
      STAFF_EMAILS: "staff@example.com",
      ALLOWED_EMAILS: "invite@example.com",
    } as NodeJS.ProcessEnv;

    expect(isEmailAllowed("OWNER@example.com", env)).toBe(true);
    expect(isEmailAllowed("staff@example.com", env)).toBe(true);
    expect(isEmailAllowed("invite@example.com", env)).toBe(true);
    expect(isEmailAllowed("unknown@example.com", env)).toBe(false);
  });

  it("allows a configured first-time email without requiring a persisted user", () => {
    const env = {
      ADMIN_EMAILS: "main@elevatedmovements.com",
    } as NodeJS.ProcessEnv;

    expect(canSignInWithEmail("main@elevatedmovements.com", env)).toBe(true);
    expect(canSignInWithEmail("unknown@elevatedmovements.com", env)).toBe(false);
    expect(canSignInWithEmail(null, env)).toBe(false);
  });

  it("uses the highest configured role and defaults invitations to staff", () => {
    const env = {
      ADMIN_EMAILS: "owner@example.com",
      PARTNER_ADMIN_EMAILS: "partner@example.com,owner@example.com",
      STAFF_EMAILS: "staff@example.com",
      READ_ONLY_EMAILS: "viewer@example.com",
      ALLOWED_EMAILS: "invite@example.com",
    } as NodeJS.ProcessEnv;

    expect(getConfiguredRole("owner@example.com", env)).toBe("admin");
    expect(getConfiguredRole("partner@example.com", env)).toBe("partner_admin");
    expect(getConfiguredRole("staff@example.com", env)).toBe("staff");
    expect(getConfiguredRole("viewer@example.com", env)).toBe("read_only");
    expect(getConfiguredRole("invite@example.com", env)).toBe("staff");
  });
});
