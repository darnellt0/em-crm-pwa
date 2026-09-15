import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { rejectDuplicateSourceIdentities, type SourceIdentityPlan } from "./sundaySeedsPlan";

function plan(sheetRow: number, fields: Record<string, string>, contactId?: string): SourceIdentityPlan {
  return { sheetRow, action: contactId ? "update" : "create", contactId, fields, conflicts: [] };
}

describe("Sunday Seeds source identity review", () => {
  it("keeps name-only matches in human review", () => {
    const importer = readFileSync("tools/import-sunday-seeds.ts", "utf8");
    expect(importer).toContain("name-only matching is disabled");
    expect(importer).not.toContain('match = hits[0]; how = "name"');
  });

  it("rejects every row sharing a normalized email", () => {
    const plans = [plan(4, { email: "Person@Example.com" }), plan(9, { email: "person@example.com" })];
    rejectDuplicateSourceIdentities(plans);
    expect(plans.map(item => item.action)).toEqual(["conflict", "conflict"]);
    expect(plans[0].conflicts.join(" ")).toContain("row 9");
    expect(plans[1].conflicts.join(" ")).toContain("row 4");
  });

  it("rejects multiple rows targeting the same existing contact", () => {
    const plans = [plan(5, {}, "contact-1"), plan(6, {}, "contact-1")];
    rejectDuplicateSourceIdentities(plans);
    expect(plans.every(item => item.action === "conflict")).toBe(true);
  });

  it("leaves distinct exact identities writable", () => {
    const plans = [plan(4, { email: "one@example.com" }), plan(5, { phoneNormalized: "+15555550123" })];
    rejectDuplicateSourceIdentities(plans);
    expect(plans.map(item => item.action)).toEqual(["create", "create"]);
  });
});
