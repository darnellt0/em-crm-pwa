import { describe, expect, it } from "vitest";
import { dateInputToIso, isoToDateInput } from "./dates.js";

describe("date-only field helpers", () => {
  it("round-trips a picked date through local midnight unchanged", () => {
    const iso = dateInputToIso("2026-08-14");
    expect(isoToDateInput(iso)).toBe("2026-08-14");
    // Local midnight, not UTC midnight (unless the test runs in UTC).
    const stored = new Date(iso);
    expect(stored.getFullYear()).toBe(2026);
    expect(stored.getMonth()).toBe(7);
    expect(stored.getDate()).toBe(14);
    expect(stored.getHours()).toBe(0);
  });

  it("preserves the UTC calendar date for legacy UTC-midnight values", () => {
    // Records created before the local-midnight fix store exactly T00:00:00Z.
    // The intended calendar date is the UTC one; local getters would return
    // the previous day anywhere west of UTC and corrupt the date on re-save.
    expect(isoToDateInput("2026-08-14T00:00:00.000Z")).toBe("2026-08-14");
  });

  it("uses local time for values with a real time component", () => {
    const afternoon = new Date(2026, 7, 14, 15, 30);
    expect(isoToDateInput(afternoon.toISOString())).toBe("2026-08-14");
  });

  it("returns empty string for missing or invalid values", () => {
    expect(isoToDateInput(null)).toBe("");
    expect(isoToDateInput(undefined)).toBe("");
    expect(isoToDateInput("not-a-date")).toBe("");
  });
});
