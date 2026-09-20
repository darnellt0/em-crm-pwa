/**
 * Acts on the Sunday Seeds placeholder review sheet once a human has filled it
 * in.
 *
 * Most blocks just name records, and those pass straight through to
 * merge-contacts.ts. The interesting case is the three answer columns: when
 * none of the records offered was the right person, the reviewer writes that
 * person down instead. This resolves what she wrote against the CRM — matching
 * on mailbox, then mobile, then exact name — and creates the contact when
 * nobody matches. Only then can the placeholder be folded into somebody.
 *
 * Two passes on purpose. This one settles who each person is and writes only
 * contacts; merge-contacts.ts then does the merging and deleting, so the guard
 * that refuses to delete a real record stays in one place.
 *
 * SMS consent is never written here. Consent comes from a person texting SEEDS
 * and from nothing else, least of all from somebody else naming them.
 *
 * Usage:
 *   pnpm exec tsx tools/sunday-seeds-review.ts --sheet <filled-sheet.csv>
 *   pnpm exec tsx tools/sunday-seeds-review.ts --sheet <filled-sheet.csv> --apply
 *   pnpm exec tsx tools/merge-contacts.ts --decisions <the file this writes>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/phone/normalize";
import { mailboxKey, parseReviewSheet, readReviewSheet, type Answer } from "../src/lib/sundaySeeds/reviewSheet";

const prisma = new PrismaClient();
const MEMBER_TAG = "Sunday Seeds";

type Decision = { group: string; crmId: string; decision: string };

type Resolution =
  | { kind: "matched"; contactId: string; how: string; name: string; fills: string[] }
  | { kind: "create"; name: string; email: string; phone: string }
  | { kind: "problem"; message: string };

const lower = (value: string) => value.trim().toLowerCase();

/** "Maya Mensah" -> first "Maya", last "Mensah"; a longer surname stays whole. */
function splitName(full: string): { firstName: string; lastName: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: words[0] ?? "", lastName: words.slice(1).join(" ") };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const sheetPath = args[args.indexOf("--sheet") + 1];
  if (args.indexOf("--sheet") === -1 || !sheetPath) throw new Error("--sheet <file> is required");
  const outPath = args.indexOf("--out") === -1
    ? sheetPath.replace(/\.[^.]+$/, "") + ".decisions.json"
    : args[args.indexOf("--out") + 1];

  const outcomes = readReviewSheet(parseReviewSheet(readFileSync(sheetPath, "utf8")));

  // Index the CRM once; it is small enough to hold in memory.
  const contacts = await prisma.contact.findMany({
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, phoneNormalized: true, tags: true, updatedAt: true }
  });
  const byMailbox = new Map<string, typeof contacts>();
  const byPhone = new Map<string, typeof contacts>();
  const byName = new Map<string, typeof contacts>();
  for (const contact of contacts) {
    const mailbox = mailboxKey(contact.email);
    if (mailbox) byMailbox.set(mailbox, [...(byMailbox.get(mailbox) ?? []), contact]);
    if (contact.phoneNormalized) byPhone.set(contact.phoneNormalized, [...(byPhone.get(contact.phoneNormalized) ?? []), contact]);
    const key = `${lower(contact.firstName ?? "")}|${lower(contact.lastName ?? "")}`;
    if (key !== "|") byName.set(key, [...(byName.get(key) ?? []), contact]);
  }

  /** Who did the reviewer mean? Mailbox, then mobile, then an exact name. */
  function resolve(answer: Answer): Resolution {
    const phone = answer.phone ? normalizePhone(answer.phone) : null;
    if (answer.phone && !phone) return { kind: "problem", message: `mobile "${answer.phone}" could not be read` };

    const mailbox = mailboxKey(answer.email);
    let hits = mailbox ? byMailbox.get(mailbox) ?? [] : [];
    let how = hits.length ? "their email" : "";

    if (!hits.length && phone) {
      hits = byPhone.get(phone) ?? [];
      if (hits.length > 1) return { kind: "problem", message: `mobile ${phone} belongs to ${hits.length} contacts` };
      how = hits.length ? "their mobile" : "";
    }
    if (!hits.length) {
      const { firstName, lastName } = splitName(answer.name);
      if (firstName && lastName) {
        hits = byName.get(`${lower(firstName)}|${lower(lastName)}`) ?? [];
        if (hits.length > 1) return { kind: "problem", message: `${hits.length} contacts are called ${answer.name}` };
        how = hits.length ? "their name" : "";
      }
    }
    if (hits.length > 1) return { kind: "problem", message: `${hits.length} contacts share ${mailbox || phone}` };

    if (!hits.length) {
      if (!answer.email && !phone) return { kind: "problem", message: "no email and no usable mobile" };
      return { kind: "create", name: answer.name, email: lower(answer.email), phone: phone ?? "" };
    }

    // Fill what the record is missing; never overwrite what somebody entered.
    const found = hits[0];
    const fills: string[] = [];
    if (answer.email && !found.email) fills.push(`email ${lower(answer.email)}`);
    else if (answer.email && mailboxKey(found.email) !== mailbox) {
      fills.push(`(keeping ${found.email}, not ${lower(answer.email)})`);
    }
    if (phone && !found.phoneNormalized) fills.push(`mobile ${phone}`);
    else if (phone && found.phoneNormalized !== phone) fills.push(`(keeping ${found.phoneNormalized}, not ${phone})`);
    return {
      kind: "matched",
      contactId: found.id,
      how,
      name: `${found.firstName ?? ""} ${found.lastName ?? ""}`.trim() || "(no name)",
      fills
    };
  }

  const decisions: Decision[] = [];
  const problems: string[] = [];
  const creates: { group: string; placeholderCrmId: string; answer: Answer }[] = [];
  const updates: { group: string; contactId: string; answer: Answer }[] = [];
  let left = 0, merges = 0, deletes = 0;

  console.log(`\n${apply ? "APPLYING — contacts only; merges happen in the next step" : "DRY RUN — nothing will be written"}\n`);

  for (const outcome of outcomes) {
    switch (outcome.kind) {
      case "leave":
        left++;
        break;

      case "problem":
        problems.push(`${outcome.group}: ${outcome.message}`);
        break;

      case "merge":
        decisions.push({ group: outcome.group, crmId: outcome.keepCrmId, decision: "keep" });
        for (const id of outcome.mergeCrmIds) decisions.push({ group: outcome.group, crmId: id, decision: "merge" });
        merges++;
        break;

      case "delete":
        for (const id of outcome.crmIds) decisions.push({ group: outcome.group, crmId: id, decision: "delete" });
        deletes += outcome.crmIds.length;
        break;

      case "resolve": {
        const resolution = resolve(outcome.answer);
        if (resolution.kind === "problem") {
          problems.push(`${outcome.group}: ${outcome.answer.name} — ${resolution.message}`);
          break;
        }
        if (resolution.kind === "matched") {
          console.log(`${outcome.group}: "${outcome.answer.name}" is ${resolution.name}, found by ${resolution.how}`);
          if (resolution.fills.length) console.log(`    add: ${resolution.fills.join(", ")}`);
          if (resolution.contactId === outcome.placeholderCrmId) {
            problems.push(`${outcome.group}: that resolves to the placeholder itself, which cannot be merged into itself`);
            break;
          }
          updates.push({ group: outcome.group, contactId: resolution.contactId, answer: outcome.answer });
          decisions.push({ group: outcome.group, crmId: resolution.contactId, decision: "keep" });
          decisions.push({ group: outcome.group, crmId: outcome.placeholderCrmId, decision: "merge" });
        } else {
          console.log(`${outcome.group}: "${resolution.name}" is nobody in the CRM yet — create them`);
          console.log(`    ${[resolution.email, resolution.phone].filter(Boolean).join(" / ")}`);
          creates.push({ group: outcome.group, placeholderCrmId: outcome.placeholderCrmId, answer: outcome.answer });
        }
        if (outcome.answer.note) console.log(`    note for review: ${outcome.answer.note}`);
        break;
      }
    }
  }

  if (apply) {
    await prisma.$transaction(async (tx) => {
      for (const create of creates) {
        const { firstName, lastName } = splitName(create.answer.name);
        const phone = create.answer.phone ? normalizePhone(create.answer.phone) : null;
        const contact = await tx.contact.create({
          data: {
            firstName: firstName || null,
            lastName: lastName || null,
            email: create.answer.email ? lower(create.answer.email) : null,
            phone: create.answer.phone || null,
            phoneNormalized: phone,
            tags: [MEMBER_TAG],
            source: "Sunday Seeds placeholder review"
          } as never
        });
        // The merge in the next step folds the placeholder into this record.
        decisions.push({ group: create.group, crmId: contact.id, decision: "keep" });
        decisions.push({ group: create.group, crmId: create.placeholderCrmId, decision: "merge" });
        if (create.answer.note) await proposeNote(tx, contact.id, create.answer.note);
      }

      for (const update of updates) {
        const existing = await tx.contact.findUniqueOrThrow({
          where: { id: update.contactId },
          select: { email: true, phone: true, phoneNormalized: true, updatedAt: true }
        });
        const fields: Record<string, unknown> = {};
        if (update.answer.email && !existing.email) fields.email = lower(update.answer.email);
        const phone = update.answer.phone ? normalizePhone(update.answer.phone) : null;
        if (phone && !existing.phoneNormalized) {
          fields.phone = update.answer.phone;
          fields.phoneNormalized = phone;
        }
        if (Object.keys(fields).length) {
          const changed = await tx.contact.updateMany({
            where: { id: update.contactId, updatedAt: existing.updatedAt },
            data: fields as never
          });
          if (!changed.count) throw new Error(`REVIEW_STALE: contact ${update.contactId} changed during apply`);
        }
        if (update.answer.note) await proposeNote(tx, update.contactId, update.answer.note);
      }
    }, { timeout: 300000 });
  }

  // Only a real run writes the decisions file. On a dry run the contacts that
  // would be created do not exist yet, so the file would name merges into
  // records that are not there — worse than no file at all.
  if (apply) writeFileSync(outPath, JSON.stringify(decisions, null, 1));

  const say = (label: string, value: number) => console.log(`${label.padEnd(23)}: ${value}`);
  console.log("");
  say("blocks left alone", left);
  say("merges to run", merges + creates.length + updates.length);
  say("placeholders to delete", deletes);
  say(apply ? "contacts created" : "contacts to create", creates.length);
  say(apply ? "contacts filled in" : "contacts to fill in", updates.length);
  console.log(`${"SMS consent written".padEnd(23)}: none, by design`);

  if (problems.length) {
    console.log(`\n--- ${problems.length} block(s) need a human ---`);
    for (const problem of problems) console.log(`  ${problem}`);
  }

  if (!apply) {
    console.log(`\nRe-run with --apply to create and fill in those contacts and write ${outPath}.`);
  } else {
    console.log(`\nDecisions written to ${outPath}. Now run:`);
    console.log(`  pnpm exec tsx tools/merge-contacts.ts --decisions ${outPath}`);
  }
  await prisma.$disconnect();
}

/** Notes are proposed, not asserted; a human still approves them in the CRM. */
async function proposeNote(tx: Prisma.TransactionClient, contactId: string, content: string) {
  const existing = await tx.aiMemoryItem.findFirst({
    where: { contactId, content, status: "proposed", proposedBy: "sunday-seeds-review" },
    select: { id: true }
  });
  if (!existing) {
    await tx.aiMemoryItem.create({ data: { contactId, content, status: "proposed", proposedBy: "sunday-seeds-review" } });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
