/**
 * Finds the empty "Sunday Seeds" placeholder records — contacts carrying the
 * tag but no email, no dialable phone and no history of any kind. They were
 * created by an earlier pass that read only the first-name column, so they
 * cannot be reached, never sync to Campaign Studio, and exist only to inflate
 * the tag count. The real person is usually already in the CRM under the same
 * name.
 *
 * For each shell it reports the reachable contacts that share its name, with
 * the history hanging off each, so a human can decide: fold the shell into the
 * real record, delete it, or leave it alone because it is somebody else.
 *
 * Names are matched exactly first, then loosely, because the placeholders carry
 * the name as it was typed once: "Asara Teshai" is the CRM's "Asara Tsehai",
 * "Tina Colby" is "Tina Huynh Colby", "Dr. Starks" is "Mary Starks". A loose
 * match is reported but never given a suggested answer — reporting it wrongly
 * as having no counterpart is what would invite deleting a real person's row.
 *
 * Read-only. Prints JSON for the review sheet; the decision column feeds
 * tools/merge-contacts.ts unchanged.
 *
 * Usage:
 *   pnpm exec tsx tools/sunday-seeds-shells.ts                  # JSON
 *   pnpm exec tsx tools/sunday-seeds-shells.ts --csv > out.csv  # the review sheet
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const fullName = (c: { firstName: string | null; lastName: string | null }) =>
  `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();

const SELECT = {
  id: true, firstName: true, lastName: true, email: true, phone: true, phoneNormalized: true,
  tags: true, source: true, persona: true, createdAt: true, lastTouchAt: true,
  _count: { select: { interactions: true, tasks: true, opportunities: true, invoices: true, enrollments: true, memories: true } }
} as const;

type Row = Awaited<ReturnType<typeof loadAll>>[number];

async function loadAll() {
  return prisma.contact.findMany({ select: SELECT });
}

function describeHistory(c: Row) {
  const h = c._count;
  return [
    h.interactions && `${h.interactions} interaction(s)`,
    h.tasks && `${h.tasks} task(s)`,
    h.opportunities && `${h.opportunities} opportunity(ies)`,
    h.invoices && `${h.invoices} invoice(s)`,
    h.enrollments && `${h.enrollments} enrolment(s)`,
    h.memories && `${h.memories} note(s)`
  ].filter(Boolean).join(", ") || "none";
}

/** Letters only, so punctuation and spacing stop mattering. */
const letters = (s: string) => s.replace(/[^a-z]/gi, "").toLowerCase();

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

const isEmpty = (c: Row) =>
  !c.email && !c.phoneNormalized &&
  Object.values(c._count).every((n) => n === 0);

/** Tags the reviewer cares about: drop the bookkeeping and the mail-merge debris. */
const TAG_NOISE = /^(cid|src|rel|type|channel):|^Campaign Pasted Segment/i;
function tidyTags(tags: string[]) {
  const keep: string[] = [];
  for (const t of tags.map((x) => x.trim()).filter((x) => x && !TAG_NOISE.test(x))) {
    if (!keep.some((k) => k.toLowerCase() === t.toLowerCase())) keep.push(t);
  }
  return keep.slice(0, 6).join("; ") + (keep.length > 6 ? `  (+${keep.length - 6} more)` : "");
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvRow = (cells: unknown[]) => cells.map(csvCell).join(",");

const HEADINGS = [
  "group", "what this row is", "name", "email", "phone", "tags",
  "source", "created", "history", "matched on", "suggestion", "DECISION",
  // Where the reviewer writes the answer when none of the records below is the
  // right person. Without these there is nowhere to put what she knows.
  "IF NONE ARE RIGHT: their name", "their email", "their mobile", "note for Darnell",
  "crmId"
];

/** Which section of the sheet a block belongs in; lower sorts first. */
function section(block: Record<string, unknown>[]) {
  const suggestion = String(block[0].suggestion);
  if (suggestion.includes("near-miss")) return 2;
  if (block.length === 1) return 3;
  return block.length === 2 ? 0 : 1;
}

/** Gmail ignores dots and anything after a plus, so these reach one mailbox. */
function mailbox(email: string | null | undefined) {
  const raw = (email ?? "").trim().toLowerCase();
  const [user, domain] = raw.split("@");
  if (!user || !domain) return "";
  if (domain !== "gmail.com" && domain !== "googlemail.com") return raw;
  return `${user.split("+")[0].replace(/\./g, "")}@gmail.com`;
}

/** Two candidate records that are one person: same mailbox, same mobile, or the same name. */
function sameHuman(a: Record<string, unknown>, b: Record<string, unknown>) {
  const mA = mailbox(String(a.email)), mB = mailbox(String(b.email));
  if (mA && mA === mB) return "the same mailbox (Gmail ignores the dots)";
  if (a.phone && a.phone === b.phone) return "the same mobile number";
  if (String(a.name).trim().toLowerCase() === String(b.name).trim().toLowerCase()) return "the same name";
  return "";
}

const BANNER: Record<number, string> = {
  0: "ONE OBVIOUS MATCH  —  answers are filled in below. Change any that look wrong.",
  1: "SEVERAL PEOPLE SHARE THIS NAME  —  mark one real record 'keep' and the placeholder 'merge', or write 'separate' to leave the block alone.",
  2: "THE NAME IS CLOSE BUT NOT IDENTICAL  —  read these carefully; a near-miss is often the same person typed from memory.",
  3: "NOBODY TO MERGE INTO  —  write 'delete' on the placeholder to drop it, or leave the decision blank to keep it.",
  4: "TWO RECORDS, ONE PERSON  —  found while checking the names above. Nothing to do with the placeholders: these are real duplicates in the CRM. Answers are filled in; change them if the wrong one is marked keep."
};

function toCsv(rows: Record<string, unknown>[]) {
  const blocks = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) blocks.set(String(r.group), [...(blocks.get(String(r.group)) ?? []), r]);
  const ordered = [...blocks.entries()].sort(
    (a, b) => section(a[1]) - section(b[1]) || a[0].localeCompare(b[0])
  );

  const lines = [
    csvRow(["Sunday Seeds: empty placeholder records left over from the 14 August pass"]),
    csvRow(["Each block is one placeholder (no email, no phone, no history at all) followed by the real contacts that share its name."]),
    csvRow(["Fill the DECISION column: keep / merge / delete / separate. A block left blank is not touched."]),
    "",
    csvRow(HEADINGS)
  ];

  const emit = (r: Record<string, unknown>) =>
    lines.push(csvRow([
      r.group, r.role, r.name, r.email, r.phone, tidyTags(String(r.tags).split(";")),
      r.source, r.created, r.history, r.matchedOn, r.suggestion, r.decision,
      "", "", "", "",
      r.crmId
    ]));

  let current = -1;
  for (const [, block] of ordered) {
    const s = section(block);
    if (s !== current) { lines.push("", csvRow([BANNER[s]])); current = s; }
    for (const r of block) emit(r);
  }

  // Checking the names turned up records that duplicate each other. They are a
  // separate problem from the placeholders, but this is the sitting in which
  // somebody is already looking at these people, so they are asked here.
  const pairs: Record<string, unknown>[][] = [];
  const seenPair = new Set<string>();
  for (const [, block] of ordered) {
    const candidates = block.slice(1);
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const why = sameHuman(candidates[i], candidates[j]);
        if (!why) continue;
        const key = [candidates[i].crmId, candidates[j].crmId].sort().join("|");
        if (seenPair.has(key)) continue;
        seenPair.add(key);
        // Keep whichever record carries more: history first, then a mobile.
        const weight = (r: Record<string, unknown>) =>
          (String(r.history) === "none" ? 0 : 2) + (r.phone ? 1 : 0);
        const [keep, absorb] = weight(candidates[i]) >= weight(candidates[j])
          ? [candidates[i], candidates[j]] : [candidates[j], candidates[i]];
        const group = `dup-${String(pairs.length + 1).padStart(2, "0")}`;
        pairs.push([
          { ...keep, group, role: "real record", matchedOn: why, suggestion: "keep this one — it carries more", decision: "keep" },
          { ...absorb, group, role: "real record", matchedOn: why, suggestion: "fold into the row above", decision: "merge" }
        ]);
      }
    }
  }
  if (pairs.length) {
    lines.push("", csvRow([BANNER[4]]));
    for (const pair of pairs) for (const r of pair) emit(r);
  }

  return lines.join("\n") + "\n";
}

async function main() {
  const args = process.argv.slice(2);
  const tagIndex = args.indexOf("--tag");
  const tag = tagIndex === -1 ? "Sunday Seeds" : args[tagIndex + 1];

  const all = await loadAll();
  const tagged = all.filter((c) => c.tags.includes(tag));
  const shells = tagged.filter(isEmpty);
  // Only a reachable record can be the person a shell stands in for; another
  // empty record is not a better home for it.
  const reachable = all.filter((c) => c.email || c.phoneNormalized);

  const out: Record<string, unknown>[] = [];
  let n = 0;

  for (const shell of shells) {
    const first = lower(shell.firstName);
    const last = lower(shell.lastName);

    let candidates: Row[] = [];
    let matchedOn = "";

    if (last) {
      candidates = reachable.filter((c) => lower(c.firstName) === first && lower(c.lastName) === last);
      matchedOn = "first and last name";
    }
    // The pass that made these wrote whole names into the first-name column,
    // so "Katy Kondo" has to be split before it can match a real record.
    if (!candidates.length && !last && first.includes(" ")) {
      const [a, ...rest] = first.split(/\s+/);
      candidates = reachable.filter((c) => lower(c.firstName) === a && lower(c.lastName) === rest.join(" "));
      matchedOn = "name split out of the first-name cell";
    }
    if (!candidates.length && !last) {
      candidates = reachable.filter((c) => lower(c.firstName) === first);
      matchedOn = "first name only";
    }
    // Last resort: the name was typed from memory, so allow a shared surname or
    // a couple of letters' difference across the whole name.
    let loose = false;
    if (!candidates.length) {
      const words = `${first} ${last}`.trim().split(/\s+/).filter(Boolean);
      const surname = words.length > 1 ? words[words.length - 1] : "";
      const whole = letters(`${first}${last}`);
      candidates = reachable.filter((c) => {
        const cWords = `${lower(c.firstName)} ${lower(c.lastName)}`.trim().split(/\s+/).filter(Boolean);
        if (surname && cWords.includes(surname)) return true;
        // A one-word placeholder such as "Dayana" against a record whose name
        // starts the same way ("Dayana Alvardo-Escobedo").
        if (!surname && cWords[0] === first) return true;
        return whole.length >= 5 && editDistance(whole, letters(fullName(c))) <= 2;
      });
      if (candidates.length) { matchedOn = "similar name, not identical — check this one"; loose = true; }
    }

    const suggestion =
      loose ? `${candidates.length} record(s) with a near-miss name — confirm before merging`
      : candidates.length === 1 ? "merge into the record below"
      : candidates.length === 0 ? "nothing to merge into — ask Shria who this is"
      : `${candidates.length} people share this name — pick one`;
    // Only an exact single match is safe to answer on the reviewer's behalf.
    const prefill = candidates.length === 1 && !loose;

    n += 1;
    const group = `shell-${String(n).padStart(2, "0")}`;

    out.push({
      group,
      role: "placeholder",
      name: fullName(shell) || "(no name)",
      email: "",
      phone: shell.phone ?? "",
      tags: shell.tags.join("; "),
      source: shell.source ?? "",
      created: shell.createdAt.toISOString().slice(0, 10),
      history: "none",
      matchedOn: candidates.length ? matchedOn : "",
      suggestion,
      decision: prefill ? "merge" : "",
      crmId: shell.id
    });

    for (const c of candidates) {
      out.push({
        group,
        role: "real record",
        name: fullName(c),
        email: c.email ?? "",
        phone: c.phoneNormalized ?? c.phone ?? "",
        tags: c.tags.join("; "),
        source: c.source ?? "",
        created: c.createdAt.toISOString().slice(0, 10),
        history: describeHistory(c),
        matchedOn: "",
        suggestion: c.tags.includes(tag) ? "" : `not tagged ${tag} yet`,
        decision: prefill ? "keep" : "",
        crmId: c.id
      });
    }
  }

  console.error(`tagged ${tag}: ${tagged.length}; placeholders: ${shells.length}; groups: ${n}`);
  console.log(args.includes("--csv") ? toCsv(out) : JSON.stringify(out, null, 1));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
