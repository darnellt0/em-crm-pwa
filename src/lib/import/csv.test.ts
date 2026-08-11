import { describe, expect, it } from "vitest";
import { parseCsvRecords } from "./csv.js";

describe("parseCsvRecords", () => {
  it("preserves quoted commas, newlines, and escaped quotes", () => {
    const csv = 'Email,Notes\r\njane@example.com,"Called, then wrote:\r\n""Ready now"""\r\n';

    expect(parseCsvRecords(csv)).toEqual({
      headers: ["Email", "Notes"],
      rows: [
        {
          Email: "jane@example.com",
          Notes: 'Called, then wrote:\r\n"Ready now"',
        },
      ],
    });
  });

  it("rejects duplicate column headers instead of silently dropping data", () => {
    const csv = "Email,Phone,Phone\njane@example.com,555-1111,555-2222\n";
    expect(() => parseCsvRecords(csv)).toThrow(/Duplicate column header "Phone"/);
  });
});
