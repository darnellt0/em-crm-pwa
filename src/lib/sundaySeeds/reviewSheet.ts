/**
 * Reads back the Sunday Seeds placeholder review sheet once a human has filled
 * it in.
 *
 * The sheet asks two different questions. Most blocks ask "which of these
 * records is this person?", answered in the DECISION column with
 * keep/merge/delete/separate. When none of the records is the right person
 * there is nothing to point at, so the sheet also carries three columns for
 * writing the person down directly — their name, their email, their mobile.
 * Those answers are the reason this module exists: a decision names a record
 * that already exists, an answer describes one that may not.
 *
 * Everything here is pure. Resolving an answer against the CRM and writing
 * anything is the caller's job, so the rules below can be tested on their own.
 */

/** A column is found by its heading, so inserting a column cannot break this. */
const COLUMNS = {
  group: ["group"],
  role: ["what this row is"],
  name: ["name"],
  email: ["email"],
  phone: ["phone"],
  history: ["history"],
  decision: ["decision"],
  answerName: ["if none are right: their name", "if none are right"],
  answerEmail: ["their email"],
  answerPhone: ["their mobile", "their phone"],
  note: ["note for darnell", "note"],
  crmId: ["crmid"]
} as const;

export type ReviewRow = {
  sheetRow: number;
  group: string;
  role: string;
  name: string;
  email: string;
  phone: string;
  decision: string;
  answerName: string;
  answerEmail: string;
  answerPhone: string;
  note: string;
  crmId: string;
};

export type Answer = {
  name: string;
  email: string;
  phone: string;
  note: string;
};

export type GroupOutcome =
  /** Nobody filled this block in. */
  | { kind: "leave"; group: string; why: string }
  /** Fold the losers into the keeper, both of which already exist. */
  | { kind: "merge"; group: string; keepCrmId: string; mergeCrmIds: string[] }
  /** Drop these records; they stand in for nobody. */
  | { kind: "delete"; group: string; crmIds: string[] }
  /** The reviewer described the person instead of pointing at a record. */
  | { kind: "resolve"; group: string; placeholderCrmId: string; answer: Answer }
  /** The block contradicts itself, so it is reported rather than guessed at. */
  | { kind: "problem"; group: string; message: string };

const clean = (value: string | undefined) => (value ?? "").trim();
const lower = (value: string | undefined) => clean(value).toLowerCase();

/**
 * Gmail delivers to one mailbox regardless of dots or a +suffix, so
 * ash.allston@ and ashallston@ are the same person. Treating them as different
 * addresses is what made the importer skip Ashley Allston.
 */
export function mailboxKey(email: string | null | undefined): string {
  const raw = lower(email ?? "");
  const at = raw.lastIndexOf("@");
  if (at <= 0) return "";
  const user = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  if (domain !== "gmail.com" && domain !== "googlemail.com") return raw;
  const bare = user.split("+")[0].split(".").join("");
  return bare ? `${bare}@gmail.com` : "";
}

export function looksLikeEmail(value: string): boolean {
  const trimmed = clean(value);
  if (!trimmed || /\s/.test(trimmed)) return false;
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@")) return false;
  const domain = trimmed.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return dot > 0 && domain.length - dot > 2;
}

/** Splits one line of CSV, honouring quotes and doubled quotes inside them. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') { cell += ch; continue; }
      if (line[i + 1] === '"') { cell += '"'; i++; continue; }
      quoted = false;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { cells.push(cell); cell = ""; continue; }
    cell += ch;
  }
  cells.push(cell);
  return cells;
}

/**
 * Splits a Markdown pipe-table row. Google Drive hands a spreadsheet back in
 * this shape, so the sheet can be read without a Sheets API round trip.
 */
function splitPipeLine(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.replace(/\\(.)/g, "$1"));
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 1 && cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

/** Reads the sheet as CSV or as the Markdown table Drive returns. */
export function parseReviewSheet(text: string): ReviewRow[] {
  const lines = text.split(/\r?\n/);
  const pipes = lines.filter((line) => line.trim().startsWith("|")).length;
  const split = pipes > lines.length / 2 ? splitPipeLine : splitCsvLine;

  const table = lines.map(split).filter((cells) => !isSeparatorRow(cells));

  const headerIndex = table.findIndex((cells) => lower(cells[0]) === "group");
  if (headerIndex === -1) {
    throw new Error("no header row found: expected a row whose first cell is \"group\"");
  }
  const headings = table[headerIndex].map(lower);

  const columnOf = (candidates: readonly string[]) => {
    for (const candidate of candidates) {
      const exact = headings.indexOf(candidate);
      if (exact !== -1) return exact;
      const prefixed = headings.findIndex((heading) => heading.startsWith(candidate));
      if (prefixed !== -1) return prefixed;
    }
    return -1;
  };

  const at: Record<keyof typeof COLUMNS, number> = {} as never;
  for (const key of Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]) {
    at[key] = columnOf(COLUMNS[key]);
  }
  for (const required of ["group", "decision", "crmId"] as const) {
    if (at[required] === -1) throw new Error(`the sheet has no "${required}" column`);
  }

  const cellAt = (cells: string[], index: number) => (index === -1 ? "" : clean(cells[index]));

  const rows: ReviewRow[] = [];
  for (let i = headerIndex + 1; i < table.length; i++) {
    const cells = table[i];
    const group = cellAt(cells, at.group);
    const crmId = cellAt(cells, at.crmId);
    // Banner and spacer rows carry a single cell of prose and no record.
    if (!group || !crmId) continue;
    rows.push({
      sheetRow: i + 1,
      group,
      role: cellAt(cells, at.role),
      name: cellAt(cells, at.name),
      email: cellAt(cells, at.email),
      phone: cellAt(cells, at.phone),
      decision: lower(cellAt(cells, at.decision)),
      answerName: cellAt(cells, at.answerName),
      answerEmail: cellAt(cells, at.answerEmail),
      answerPhone: cellAt(cells, at.answerPhone),
      note: cellAt(cells, at.note),
      crmId
    });
  }
  return rows;
}

const hasAnswer = (row: ReviewRow) => Boolean(row.answerName || row.answerEmail || row.answerPhone);
const isPlaceholder = (row: ReviewRow) => lower(row.role).startsWith("placeholder");

/**
 * Turns one block of the sheet into a single instruction, or into a complaint.
 *
 * Nothing here guesses. A block that says two things at once is reported with
 * what it said, because the cost of guessing wrong is a merged or deleted
 * person, and the cost of asking is one more line in a report.
 */
export function readGroup(group: string, rows: ReviewRow[]): GroupOutcome {
  const decided = rows.filter((row) => row.decision);
  const answered = rows.filter(hasAnswer);

  if (rows.some((row) => row.decision === "separate")) {
    return { kind: "leave", group, why: "marked separate" };
  }
  if (!decided.length && !answered.length) {
    return { kind: "leave", group, why: "left blank" };
  }

  if (answered.length > 1) {
    return {
      kind: "problem",
      group,
      message: `${answered.length} rows describe a person; fill those columns on one row only`
    };
  }

  if (answered.length === 1) {
    const answer = answered[0];
    if (!isPlaceholder(answer)) {
      return {
        kind: "problem",
        group,
        message: `the person is described on the "${answer.role}" row (${answer.name}); describe them on the placeholder row instead`
      };
    }
    if (answer.decision === "delete") {
      return { kind: "problem", group, message: "the placeholder is marked delete and also describes a person" };
    }
    const contradictions = decided.filter((row) => row.crmId !== answer.crmId && row.decision === "keep");
    if (contradictions.length) {
      return {
        kind: "problem",
        group,
        message: `a person is described, but ${contradictions[0].name} is also marked keep; pick one or the other`
      };
    }
    if (answer.answerEmail && !looksLikeEmail(answer.answerEmail)) {
      return { kind: "problem", group, message: `"${answer.answerEmail}" is not an email address` };
    }
    if (!answer.answerEmail && !answer.answerPhone) {
      return {
        kind: "problem",
        group,
        message: `"${answer.answerName || answer.name}" was named with no email and no mobile, so they cannot be identified`
      };
    }
    return {
      kind: "resolve",
      group,
      placeholderCrmId: answer.crmId,
      answer: {
        name: answer.answerName || answer.name,
        email: answer.answerEmail,
        phone: answer.answerPhone,
        note: answer.note
      }
    };
  }

  const doomed = decided.filter((row) => row.decision === "delete");
  if (doomed.length) {
    if (doomed.length !== decided.length) {
      return { kind: "problem", group, message: "delete is mixed with other decisions in the same block" };
    }
    const real = doomed.filter((row) => !isPlaceholder(row));
    if (real.length) {
      return {
        kind: "problem",
        group,
        message: `${real[0].name} is a real record, not a placeholder, so delete was not accepted`
      };
    }
    return { kind: "delete", group, crmIds: doomed.map((row) => row.crmId) };
  }

  const keepers = decided.filter((row) => row.decision === "keep");
  const losers = decided.filter((row) => row.decision === "merge");
  const strays = decided.filter((row) => !["keep", "merge"].includes(row.decision));
  if (strays.length) {
    return { kind: "problem", group, message: `"${strays[0].decision}" is not a decision this sheet understands` };
  }
  if (keepers.length !== 1) {
    return {
      kind: "problem",
      group,
      message: keepers.length
        ? `${keepers.length} rows are marked keep; exactly one record survives a merge`
        : "something is marked merge with nothing marked keep"
    };
  }
  if (!losers.length) {
    return { kind: "leave", group, why: "one row is marked keep and nothing is marked merge, so there is nothing to do" };
  }
  return { kind: "merge", group, keepCrmId: keepers[0].crmId, mergeCrmIds: losers.map((row) => row.crmId) };
}

/** Reads the whole sheet, keeping the sheet's own order. */
export function readReviewSheet(rows: ReviewRow[]): GroupOutcome[] {
  const blocks = new Map<string, ReviewRow[]>();
  for (const row of rows) blocks.set(row.group, [...(blocks.get(row.group) ?? []), row]);
  return [...blocks.entries()].map(([group, block]) => readGroup(group, block));
}
