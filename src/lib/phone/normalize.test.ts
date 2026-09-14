import { describe, expect, it } from "vitest";
import { normalizePhone } from "./normalize";

describe("normalizePhone", () => {
  it("normalizes ordinary US numbers however they are written", () => {
    for (const input of ["(408) 260-5717", "408-260-5717", "4082605717", "408.260.5717", " 408 260 5717 "]) {
      expect(normalizePhone(input)).toBe("+14082605717");
    }
    expect(normalizePhone("14082605717")).toBe("+14082605717");
    expect(normalizePhone("+1 (408) 260-5717")).toBe("+14082605717");
  });

  it("takes the first number when a field holds several", () => {
    // Real values from the contact list; concatenating produced 20-digit junk.
    expect(normalizePhone("5102056168:::5108603846")).toBe("+15102056168");
    expect(normalizePhone("7072283016:::5104954812")).toBe("+17072283016");
    expect(normalizePhone("510-856-8992, 510-780-6447")).toBe("+15108568992");
    expect(normalizePhone("5102056168 or 5108603846")).toBe("+15102056168");
  });

  it("rejects values that are not dialable rather than mangling them", () => {
    expect(normalizePhone("()209-5651")).toBeNull();   // produced "+2095651" before
    expect(normalizePhone("-() -916")).toBeNull();
    expect(normalizePhone("#ERROR!")).toBeNull();
    expect(normalizePhone("Reyna Tomlinson")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("accepts international numbers with or without a leading plus", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("+33 1 42 68 53 00")).toBe("+33142685300");
    expect(normalizePhone("442079460958")).toBe("+442079460958");
  });

  it("never returns a value that is too short or too long to dial", () => {
    expect(normalizePhone("+1234567")).toBeNull();          // 7 digits
    expect(normalizePhone("+1234567890123456")).toBeNull();  // 16 digits
    expect(normalizePhone("+51020561685108603846")).toBeNull(); // the 20-digit value
  });
});
