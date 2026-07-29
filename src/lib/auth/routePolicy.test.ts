import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const EXPECTED_ROLE_CALLS: Record<string, string[]> = {
  "agent-actions/[id]/decision/route.ts": ["partner_admin"],
  "agent-actions/route.ts": ["read_only"],
  "actions/focus/route.ts": ["read_only"],
  "contacts/[id]/interactions/route.ts": ["read_only"],
  "contacts/[id]/route.ts": ["read_only", "partner_admin", "staff"],
  "contacts/[id]/tasks/route.ts": ["read_only"],
  "contacts/bulk/route.ts": ["staff", "partner_admin"],
  "contacts/route.ts": ["read_only", "staff"],
  "dashboard/route.ts": ["read_only"],
  "enrollments/route.ts": ["staff"],
  "imports/[jobId]/execute/route.ts": ["partner_admin"],
  "imports/[jobId]/map/route.ts": ["partner_admin"],
  "imports/[jobId]/rows/route.ts": ["partner_admin"],
  "imports/[jobId]/run/route.ts": ["partner_admin"],
  "imports/[jobId]/upload/route.ts": ["partner_admin"],
  "imports/[jobId]/validate/route.ts": ["partner_admin"],
  "imports/cleaned-master/route.ts": ["partner_admin"],
  "imports/route.ts": ["partner_admin", "partner_admin"],
  "interactions/route.ts": ["staff"],
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

describe("API route authorization policy", () => {
  it.each(Object.entries(EXPECTED_ROLE_CALLS))("protects %s", (relativePath, expected) => {
    const source = readFileSync(`src/app/api/${relativePath}`, "utf8");
    const actual = [...source.matchAll(/requireRole\("([a-z_]+)"\)/g)].map(
      (match) => match[1]
    );
    expect(actual).toEqual(expected);
    expect(source).not.toContain("requireUser(");
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
