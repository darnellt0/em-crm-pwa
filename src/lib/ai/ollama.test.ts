import { describe, expect, it } from "vitest";
import { parseMemoryProposals } from "./ollama.js";

describe("parseMemoryProposals", () => {
  it("accepts a bare array of proposals", () => {
    const text = JSON.stringify([
      { content: "Prefers morning calls", memoryType: "personal" },
      { content: "Interested in the fall cohort" },
    ]);
    expect(parseMemoryProposals(text)).toHaveLength(2);
  });

  it("accepts an object wrapping an array, regardless of key name", () => {
    expect(
      parseMemoryProposals(JSON.stringify({ memories: [{ content: "Has two kids" }] }))
    ).toHaveLength(1);
    expect(
      parseMemoryProposals(JSON.stringify({ facts: [{ content: "Based in Austin" }] }))
    ).toHaveLength(1);
  });

  it("accepts a single proposal returned as a bare object", () => {
    const result = parseMemoryProposals(
      JSON.stringify({ content: "Runs a nonprofit", confidence: 0.9 })
    );
    expect(result).toEqual([{ content: "Runs a nonprofit", confidence: 0.9 }]);
  });

  it("drops entries without a non-empty content string", () => {
    const text = JSON.stringify({
      memories: [{ content: "" }, { memoryType: "personal" }, { content: "Valid fact" }],
    });
    expect(parseMemoryProposals(text)).toEqual([{ content: "Valid fact" }]);
  });

  it("returns empty for invalid JSON, empty strings, and unrecognized shapes", () => {
    expect(parseMemoryProposals("not json")).toEqual([]);
    expect(parseMemoryProposals("")).toEqual([]);
    expect(parseMemoryProposals(JSON.stringify({ memories: "none" }))).toEqual([]);
    expect(parseMemoryProposals(JSON.stringify(42))).toEqual([]);
  });
});
