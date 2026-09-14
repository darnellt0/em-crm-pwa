/**
 * Imports the Sunday Seeds community tab into the CRM.
 *
 * Design rules, in order of importance:
 *
 *  1. Consent is never inferred. This writes no SMS consent and no opt-in tag.
 *     Being in the community is not permission to text; that comes only from
 *     the person replying to the SEEDS keyword.
 *  2. Nothing is overwritten. Existing CRM values win; the import only fills
 *     blanks and adds tags. Anything that disagrees is reported as a conflict
 *     for a human, never silently resolved.
 *  3. Dry run by default. --apply is required to write.
 *
 * Matching order: email (the CRM's unique key), then a unique normalized phone,
 * then first+last name when it is unambiguous. Anything still ambiguous is
 * reported rather than guessed.
 *
 * Two fields in the source have no home in this schema: job title and city.
 * Rather than invent columns, both are folded into the contact note, which is
 * written as a "proposed" memory item so it lands in the existing review queue.
 *
 * Usage:
 *   pnpm exec tsx tools/import-sunday-seeds.ts --tab <ss.json> --mapping <mapping.json>
 *   pnpm exec tsx tools/import-sunday-seeds.ts --tab <ss.json> --mapping <mapping.json> --apply
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/phone/normalize";

const prisma = new PrismaClient();
const MEMBER_TAG = "Sunday Seeds";
const SOURCE = "Sunday Seeds community list";

// Column positions in the tab, from its header row.
const COL = { first: 0, last: 1, preferred: 2, phone: 3, email1: 4, email2: 5, city: 6, knows: 7, org: 8 } as const;

type Row = string[];
const cell = (r: Row, i: number) => String(r?.[i] ?? "").trim();
const lower = (s: string) => s.trim().toLowerCase();
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(s.trim());

function readValues(path: string): Row[] {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(parsed) ? parsed : (parsed.values ?? []);
}

type Approved = { organisation: string; title: string; tags: string[]; note: string };

/** Reads the reviewed mapping sheet, keeping only rows a human marked approved. */
function readMapping(path: string): Map<number, Approved> {
  const rows = readValues(path);
  const header = rows.findIndex((r) => cell(r, 0) === "Sheet row");
  const out = new Map<number, Approved>();
  if (header === -1) return out;
  for (const r of rows.slice(header + 1)) {
    const sheetRow = Number(cell(r, 0));
    if (!sheetRow || lower(cell(r, 8)) !== "y") continue;
    out.set(sheetRow, {
      organisation: cell(r, 3),
      title: cell(r, 4),
      tags: cell(r, 5).split(";").map((t) => t.trim()).filter(Boolean),
      note: cell(r, 6)
    });
  }
  return out;
}

type Plan = {
  sheetRow: number; name: string; action: "create" | "update" | "conflict";
  contactId?: string; detail: string[]; conflicts: string[];
};

async function main() {
  const args = process.argv.slice(2);
  const arg = (n: string) => { const i = args.indexOf(n); return i === -1 ? undefined : args[i + 1]; };
  const apply = args.includes("--apply");
  const tabPath = arg("--tab"), mappingPath = arg("--mapping");
  if (!tabPath || !mappingPath) throw new Error("--tab <file> and --mapping <file> are both required");

  const rows = readValues(tabPath);
  const mapping = readMapping(mappingPath);

  // Index the CRM once; these lists are small enough to hold in memory.
  const contacts = await prisma.contact.findMany({
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, phoneNormalized: true, tags: true, organizationId: true, source: true }
  });
  const byEmail = new Map(contacts.filter((c) => c.email).map((c) => [lower(c.email!), c]));
  const byPhone = new Map<string, typeof contacts>();
  const byName = new Map<string, typeof contacts>();
  for (const c of contacts) {
    if (c.phoneNormalized) byPhone.set(c.phoneNormalized, [...(byPhone.get(c.phoneNormalized) ?? []), c]);
    const key = `${lower(c.firstName ?? "")}|${lower(c.lastName ?? "")}`;
    if (key !== "|") byName.set(key, [...(byName.get(key) ?? []), c]);
  }

  const plans: Plan[] = [];
  const memories: { contactKey: string; content: string }[] = [];

  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    const sheetRow = i + 1;
    const first = cell(r, COL.first), last = cell(r, COL.last);
    if (!first && !last) continue;
    const name = `${first} ${last}`.trim();
    const detail: string[] = [], conflicts: string[] = [];

    const emailRaw = cell(r, COL.email1);
    const email = isEmail(emailRaw) ? lower(emailRaw) : "";
    if (emailRaw && !email) conflicts.push(`"${emailRaw}" is not a valid email address, so it was ignored`);
    const phoneRaw = cell(r, COL.phone);
    const phone = normalizePhone(phoneRaw);
    if (phoneRaw && !phone) conflicts.push(`phone "${phoneRaw}" could not be read`);

    // --- match ---
    let match = email ? byEmail.get(email) : undefined;
    let how = match ? "email" : "";
    if (!match && phone) {
      const hits = byPhone.get(phone) ?? [];
      if (hits.length === 1) { match = hits[0]; how = "phone"; }
      else if (hits.length > 1) conflicts.push(`phone ${phone} belongs to ${hits.length} CRM contacts`);
    }
    if (!match && first && last) {
      const hits = byName.get(`${lower(first)}|${lower(last)}`) ?? [];
      if (hits.length === 1) { match = hits[0]; how = "name"; }
      else if (hits.length > 1) conflicts.push(`${hits.length} CRM contacts share this name`);
    }

    const approved = mapping.get(sheetRow);
    const wantTags = new Set([MEMBER_TAG, ...(approved?.tags ?? [])]);

    // --- note: things the schema has no field for ---
    const noteBits: string[] = [];
    if (approved?.note) noteBits.push(approved.note);
    if (approved?.title) noteBits.push(`Title: ${approved.title}.`);
    const city = cell(r, COL.city);
    if (city) noteBits.push(`Based in ${city}.`);
    const knows = cell(r, COL.knows);
    if (knows && !isEmail(knows) && !/^\+?[\d()\-. ]+$/.test(knows)) noteBits.push(`How Shria knows her: ${knows}.`);

    if (match) {
      if (email && match.email && lower(match.email) !== email) conflicts.push(`CRM has ${match.email}, sheet has ${email}`);
      if (phone && match.phoneNormalized && match.phoneNormalized !== phone) conflicts.push(`CRM has phone ${match.phoneNormalized}, sheet has ${phone}`);
      if (email && !match.email) detail.push(`set email ${email}`);
      if (phone && !match.phoneNormalized) detail.push(`set phone ${phone}`);
      const newTags = [...wantTags].filter((t) => !match!.tags.includes(t));
      if (newTags.length) detail.push(`add tags ${newTags.join(", ")}`);
      if (approved?.organisation && !match.organizationId) detail.push(`link organisation "${approved.organisation}"`);
      if (noteBits.length) detail.push("add a note for review");
      plans.push({ sheetRow, name, action: conflicts.length ? "conflict" : "update", contactId: match.id, detail: [`matched by ${how}`, ...detail], conflicts });
    } else {
      if (!email && !phone) conflicts.push("no email and no usable phone, so this row cannot be identified");
      detail.push(`create contact${email ? ` with ${email}` : ""}${phone ? ` / ${phone}` : ""}`);
      detail.push(`tags ${[...wantTags].join(", ")}`);
      if (approved?.organisation) detail.push(`link organisation "${approved.organisation}"`);
      if (noteBits.length) detail.push("add a note for review");
      plans.push({ sheetRow, name, action: conflicts.length ? "conflict" : "create", detail, conflicts });
    }

    if (noteBits.length) memories.push({ contactKey: name, content: noteBits.join(" ") });
  }

  // --- report ---
  const creates = plans.filter((p) => p.action === "create");
  const updates = plans.filter((p) => p.action === "update");
  const issues = plans.filter((p) => p.action === "conflict");
  console.log(`\n${apply ? "APPLYING" : "DRY RUN — nothing will be written"}\n`);
  console.log(`rows read           : ${plans.length}`);
  console.log(`  would create      : ${creates.length}`);
  console.log(`  would update      : ${updates.length}`);
  console.log(`  need a human      : ${issues.length}`);
  console.log(`  notes for review  : ${memories.length}`);
  console.log(`  approved mappings : ${mapping.size}`);
  console.log(`\nSMS consent written : none, by design\n`);

  if (issues.length) {
    console.log("--- need a human ---");
    for (const p of issues) console.log(`  row ${p.sheetRow} ${p.name}\n      ${p.conflicts.join("\n      ")}`);
  }
  console.log("\n--- sample of planned updates ---");
  for (const p of updates.slice(0, 8)) console.log(`  row ${p.sheetRow} ${p.name}: ${p.detail.join("; ")}`);
  console.log("\n--- sample of planned creates ---");
  for (const p of creates.slice(0, 8)) console.log(`  row ${p.sheetRow} ${p.name}: ${p.detail.join("; ")}`);

  if (!apply) { console.log("\nRe-run with --apply to write these changes."); await prisma.$disconnect(); return; }
  console.log("\n--apply given, but writing is not implemented in this build; review the plan first.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
