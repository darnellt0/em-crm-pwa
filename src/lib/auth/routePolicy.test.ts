import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const EXPECTED_ROLE_CALLS: Record<string, string[]> = {
  "agent-actions/[id]/decision/route.ts": ["partner_admin"],
  "agent-actions/route.ts": ["read_only"],
  "actions/focus/route.ts": ["read_only"],
  "contacts/[id]/interactions/route.ts": ["read_only"],
  "contacts/[id]/tasks/route.ts": ["read_only"],
  "contacts/bulk/route.ts": ["staff", "partner_admin"],
  "dashboard/route.ts": ["read_only"],
  "enrollments/route.ts": ["staff"],
  "imports/[jobId]/map/route.ts": ["partner_admin"],
  "imports/[jobId]/rows/route.ts": ["partner_admin"],
  "imports/[jobId]/run/route.ts": ["partner_admin"],
  "imports/[jobId]/upload/route.ts": ["partner_admin"],
  "imports/[jobId]/validate/route.ts": ["partner_admin"],
  "imports/cleaned-master/route.ts": ["partner_admin"],
  "imports/route.ts": ["partner_admin", "partner_admin"],
  "invoices/[id]/edit/route.ts": ["staff"],
  "invoices/[id]/history/route.ts": ["read_only"],
  "invoices/[id]/route.ts": ["read_only"],
  "invoices/route.ts": ["read_only", "staff"],
  "memory/bulk/route.ts": ["staff"],
  "memory/queue/route.ts": ["read_only"],
  "memory/search/route.ts": ["read_only"],
  "opportunities/[id]/route.ts": ["staff"],
  "opportunities/route.ts": ["read_only", "staff"],
  "programs/[id]/route.ts": ["staff", "read_only"],
  "programs/route.ts": ["read_only", "staff"],
  "tasks/[id]/route.ts": ["staff"],
  "tasks/route.ts": ["read_only", "staff"],
  "users/route.ts": ["staff", "admin"],
  "views/[id]/route.ts": ["read_only", "staff", "staff"],
  "views/route.ts": ["read_only", "staff"],
};

// Routes that accept either session auth OR internal service token.
// The role listed is the minimum for session-based auth; token auth
// grants staff-equivalent access.
const EXPECTED_DUAL_AUTH: Record<string, string[]> = {
  "contacts/route.ts": ["read_only", "staff"],
  "contacts/[id]/route.ts": ["read_only", "staff"],
  "interactions/route.ts": ["staff"],
};

// contacts/[id]/route.ts also has a DELETE handler that stays session-only
const EXPECTED_MIXED_AUTH: Record<string, { roleOnly: string[]; dual: string[] }> = {
  "contacts/[id]/route.ts": { roleOnly: ["partner_admin"], dual: ["read_only", "staff"] },
};

describe("API route authorization policy", () => {
  it.each(Object.entries(EXPECTED_ROLE_CALLS))("protects %s with requireRole", (relativePath, expected) => {
    const source = readFileSync(`src/app/api/${relativePath}`, "utf8");
    const actual = [...source.matchAll(/requireRole\("([a-z_]+)"\)/g)].map(
      (match) => match[1]
    );
    expect(actual).toEqual(expected);
    expect(source).not.toContain("requireUser(");
  });

  it.each(Object.entries(EXPECTED_DUAL_AUTH))("protects %s with dual auth", (relativePath, expected) => {
    const source = readFileSync(`src/app/api/${relativePath}`, "utf8");
    const dual = [...source.matchAll(/requireUserOrInternalToken\(req,\s*"([a-z_]+)"\)/g)].map(
      (match) => match[1]
    );
    expect(dual).toEqual(expected);
    expect(source).toContain("requireUserOrInternalToken");
  });

  it.each(Object.entries(EXPECTED_MIXED_AUTH))("protects %s with mixed auth", (relativePath, { roleOnly, dual }) => {
    const source = readFileSync(`src/app/api/${relativePath}`, "utf8");
    const roleOnlyActual = [...source.matchAll(/requireRole\("([a-z_]+)"\)/g)].map(
      (match) => match[1]
    );
    const dualActual = [...source.matchAll(/requireUserOrInternalToken\(req,\s*"([a-z_]+)"\)/g)].map(
      (match) => match[1]
    );
    expect(roleOnlyActual).toEqual(roleOnly);
    expect(dualActual).toEqual(dual);
  });

  it("keeps machine-only routes behind internal tokens", () => {
    for (const relativePath of [
      "embeddings/run/route.ts",
      "internal/contacts/search/route.ts",
      "internal/ops-summary/route.ts",
    ]) {
      const source = readFileSync(`src/app/api/${relativePath}`, "utf8");
      expect(source).toContain("requireInternalToken");
    }
  });

  it("keeps Campaign Studio sync routes behind their dedicated token", () => {
    for (const relativePath of [
      "internal/campaign-sync/contacts/route.ts",
      "internal/campaign-sync/events/route.ts",
    ]) {
      const source = readFileSync(`src/app/api/${relativePath}`, "utf8");
      expect(source).toContain("requireCampaignSyncToken");
      expect(source).not.toContain("requireInternalToken");
    }
  });

  it("keeps agent proposal routes behind the separate write token", () => {
    const source = readFileSync("src/app/api/internal/agent-actions/route.ts", "utf8");
    expect(source).toContain("requireAgentWriteToken");
    expect(source).not.toContain("requireInternalToken");
  });
});
