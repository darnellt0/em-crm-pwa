import { describe, expect, it } from "vitest";
import { mailboxKey, looksLikeEmail, parseReviewSheet, readGroup, readReviewSheet, type ReviewRow } from "./reviewSheet";

const HEADER =
  "group,what this row is,name,email,phone,tags,source,created,history,matched on,suggestion,DECISION," +
  "IF NONE ARE RIGHT: their name,their email,their mobile,note for Darnell,crmId";

const sheet = (...lines: string[]) => ["a title row", "", HEADER, ...lines].join("\n");

const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  sheetRow: 1,
  group: "shell-01",
  role: "placeholder",
  name: "Kim",
  email: "",
  phone: "",
  decision: "",
  answerName: "",
  answerEmail: "",
  answerPhone: "",
  note: "",
  crmId: "id-placeholder",
  ...over
});

describe("mailboxKey", () => {
  it("treats Gmail dots and +suffixes as one mailbox", () => {
    expect(mailboxKey("ash.allston@gmail.com")).toBe(mailboxKey("ashallston@gmail.com"));
    expect(mailboxKey("dr.afinalockhart@gmail.com")).toBe(mailboxKey("drafinalockhart@gmail.com"));
    expect(mailboxKey("kim+seeds@gmail.com")).toBe("kim@gmail.com");
    expect(mailboxKey("A.B@GoogleMail.com")).toBe("ab@gmail.com");
  });

  it("leaves other providers alone, because their dots are significant", () => {
    expect(mailboxKey("b.gomez@collegetrack.org")).toBe("b.gomez@collegetrack.org");
    expect(mailboxKey("bgomez@collegetrack.org")).not.toBe(mailboxKey("b.gomez@collegetrack.org"));
  });

  it("returns nothing for values that are not addresses", () => {
    for (const bad of ["", "Reyna Tomlinson", "@gmail.com", null, undefined]) {
      expect(mailboxKey(bad)).toBe("");
    }
  });
});

describe("looksLikeEmail", () => {
  it("accepts ordinary addresses and rejects the things people actually type", () => {
    expect(looksLikeEmail("shria@elevatedmovements.com")).toBe(true);
    expect(looksLikeEmail("  kim@100actsoflove.com  ")).toBe(true);
    for (const bad of ["Reyna Tomlinson", "kim@gmail", "two@@gmail.com", "a b@gmail.com", "", "@x.com"]) {
      expect(looksLikeEmail(bad)).toBe(false);
    }
  });
});

describe("parseReviewSheet", () => {
  it("reads the rows and ignores banners and spacers", () => {
    const rows = parseReviewSheet(
      sheet(
        "",
        "ONE OBVIOUS MATCH  —  answers are filled in below.",
        "shell-07,placeholder,Erika Russell,,,tags,src,2026-08-14,none,,,merge,,,,,id-a",
        "shell-07,real record,Erika Russell,erikajevon@yahoo.com,+16506226635,tags,src,2026-05-09,1 note(s),,,keep,,,,,id-b"
      )
    );
    expect(rows.map((r) => r.crmId)).toEqual(["id-a", "id-b"]);
    expect(rows[0].decision).toBe("merge");
    expect(rows[1].email).toBe("erikajevon@yahoo.com");
  });

  it("reads the answer columns", () => {
    const rows = parseReviewSheet(
      sheet('shell-05,placeholder,MM,,,tags,src,2026-08-14,none,,,,Maya Mensah,maya@example.org,510-555-0111,"met at the retreat, runs a book club",id-mm')
    );
    expect(rows[0].answerName).toBe("Maya Mensah");
    expect(rows[0].answerEmail).toBe("maya@example.org");
    expect(rows[0].answerPhone).toBe("510-555-0111");
    expect(rows[0].note).toBe("met at the retreat, runs a book club");
  });

  it("finds columns by heading, so an inserted column does not shift the answers", () => {
    const moved = "group,DECISION,name,what this row is,IF NONE ARE RIGHT: their name,their email,their mobile,note for Darnell,crmId";
    const rows = parseReviewSheet(["x", moved, "shell-05,,MM,placeholder,Maya Mensah,maya@example.org,5105550111,,id-mm"].join("\n"));
    expect(rows[0].answerName).toBe("Maya Mensah");
    expect(rows[0].role).toBe("placeholder");
    expect(rows[0].crmId).toBe("id-mm");
  });

  it("reads the Markdown table Drive hands back", () => {
    const md = [
      "| group | what this row is | name | DECISION | crmId |",
      "| :-: | :-: | :-: | :-: | :-: |",
      "| shell-01 | placeholder | Kim | merge | id-a |",
      "| shell-01 | real record | Kim Hamer | keep | id-b |"
    ].join("\n");
    const rows = parseReviewSheet(md);
    expect(rows).toHaveLength(2);
    expect(rows[1].name).toBe("Kim Hamer");
    expect(rows[1].decision).toBe("keep");
  });

  it("refuses a sheet it cannot recognise rather than reading nothing from it", () => {
    expect(() => parseReviewSheet("name,email\nKim,kim@x.com")).toThrow(/header row/);
    expect(() => parseReviewSheet("group,name\nshell-01,Kim")).toThrow(/"decision" column/);
  });
});

describe("readGroup", () => {
  it("merges the losers into the keeper", () => {
    const outcome = readGroup("shell-01", [
      row({ decision: "merge", crmId: "ph" }),
      row({ role: "real record", name: "Kim Hamer", decision: "keep", crmId: "real" })
    ]);
    expect(outcome).toEqual({ kind: "merge", group: "shell-01", keepCrmId: "real", mergeCrmIds: ["ph"] });
  });

  it("leaves a block alone when it is blank or marked separate", () => {
    expect(readGroup("shell-01", [row(), row({ role: "real record", crmId: "real" })]).kind).toBe("leave");
    expect(readGroup("shell-01", [row({ decision: "separate" }), row({ role: "real record", decision: "keep", crmId: "real" })]).kind).toBe("leave");
  });

  it("deletes a placeholder marked delete", () => {
    expect(readGroup("shell-05", [row({ name: "MM", decision: "delete", crmId: "ph" })])).toEqual({
      kind: "delete",
      group: "shell-05",
      crmIds: ["ph"]
    });
  });

  it("refuses delete on a row that is not a placeholder", () => {
    const outcome = readGroup("dup-01", [row({ role: "real record", name: "Wintor McNeel", decision: "delete", crmId: "real" })]);
    expect(outcome.kind).toBe("problem");
    expect(outcome).toMatchObject({ message: expect.stringContaining("real record") });
  });

  it("returns the described person when no record is the right one", () => {
    const outcome = readGroup("shell-05", [
      row({ name: "MM", answerName: "Maya Mensah", answerEmail: "maya@example.org", answerPhone: "510-555-0111", note: "book club" })
    ]);
    expect(outcome).toEqual({
      kind: "resolve",
      group: "shell-05",
      placeholderCrmId: "id-placeholder",
      answer: { name: "Maya Mensah", email: "maya@example.org", phone: "510-555-0111", note: "book club" }
    });
  });

  it("accepts a described person alongside merge on the same placeholder row", () => {
    const outcome = readGroup("shell-01", [
      row({ decision: "merge", answerName: "Kim Okonkwo", answerEmail: "kim@example.org" }),
      row({ role: "real record", name: "Kim Hamer", crmId: "real" })
    ]);
    expect(outcome.kind).toBe("resolve");
  });

  it("falls back to the placeholder's own name when only contact details are given", () => {
    const outcome = readGroup("shell-22", [row({ name: "Illy", answerEmail: "illy@example.org" })]);
    expect(outcome).toMatchObject({ kind: "resolve", answer: { name: "Illy" } });
  });

  describe("blocks that say two things at once are reported, never guessed at", () => {
    const problem = (rows: ReviewRow[]) => {
      const outcome = readGroup("shell-01", rows);
      expect(outcome.kind).toBe("problem");
      return outcome.kind === "problem" ? outcome.message : "";
    };

    it("a person described and a record kept", () => {
      expect(
        problem([
          row({ answerName: "Kim Okonkwo", answerEmail: "kim@example.org" }),
          row({ role: "real record", name: "Kim Hamer", decision: "keep", crmId: "real" })
        ])
      ).toMatch(/pick one or the other/);
    });

    it("a person described on two rows", () => {
      expect(
        problem([
          row({ answerEmail: "a@example.org" }),
          row({ role: "real record", answerEmail: "b@example.org", crmId: "real" })
        ])
      ).toMatch(/one row only/);
    });

    it("a person described on a real record instead of the placeholder", () => {
      expect(problem([row({ role: "real record", answerEmail: "a@example.org", crmId: "real" })])).toMatch(/placeholder row instead/);
    });

    it("delete and a description together", () => {
      expect(problem([row({ decision: "delete", answerEmail: "a@example.org" })])).toMatch(/marked delete/);
    });

    it("a description with nothing to identify the person by", () => {
      expect(problem([row({ answerName: "Maya Mensah" })])).toMatch(/no email and no mobile/);
    });

    it("an answer email that is not an address", () => {
      expect(problem([row({ answerName: "Maya", answerEmail: "Maya Mensah" })])).toMatch(/not an email address/);
    });

    it("two keeps", () => {
      expect(
        problem([
          row({ decision: "merge" }),
          row({ role: "real record", decision: "keep", crmId: "a" }),
          row({ role: "real record", decision: "keep", crmId: "b" })
        ])
      ).toMatch(/exactly one record survives/);
    });

    it("a merge with nothing to merge into", () => {
      expect(problem([row({ decision: "merge" })])).toMatch(/nothing marked keep/);
    });

    it("a word the sheet does not understand", () => {
      expect(problem([row({ decision: "combine" })])).toMatch(/not a decision/);
    });

    it("delete mixed with a merge", () => {
      expect(
        problem([row({ decision: "delete" }), row({ role: "real record", decision: "merge", crmId: "real" })])
      ).toMatch(/mixed with other decisions/);
    });
  });
});

describe("readReviewSheet", () => {
  it("keeps one outcome per block, in the order the sheet has them", () => {
    const rows = parseReviewSheet(
      sheet(
        "shell-07,placeholder,Erika,,,,,,none,,,merge,,,,,ph-a",
        "shell-07,real record,Erika Russell,e@x.com,,,,,1 note(s),,,keep,,,,,real-a",
        "shell-05,placeholder,MM,,,,,,none,,,,Maya Mensah,maya@example.org,,,ph-b",
        "dup-01,real record,Wintor,w@x.com,,,,,1 note(s),,,keep,,,,,real-b",
        "dup-01,real record,Wintor,w2@x.com,,,,,none,,,merge,,,,,real-c"
      )
    );
    expect(readReviewSheet(rows).map((outcome) => [outcome.group, outcome.kind])).toEqual([
      ["shell-07", "merge"],
      ["shell-05", "resolve"],
      ["dup-01", "merge"]
    ]);
  });
});
