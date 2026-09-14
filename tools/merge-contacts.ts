/**
 * Merges duplicate CRM contacts according to decisions made on the review
 * sheet. Dry run by default.
 *
 * A merge moves every related record onto the kept contact, fills any blank
 * field on the keeper from the records being absorbed, unions their tags and
 * sources, and only then deletes the absorbed rows. It never overwrites a value
 * the keeper already has, so nothing a human entered is lost.
 *
 * Groups are skipped unless exactly one row is marked keep and every other row
 * in that group is marked merge. A group marked "separate" is left alone; the
 * contacts share a phone but are different people.
 *
 * Usage:
 *   pnpm exec tsx tools/merge-contacts.ts --decisions <decisions.json>
 *   pnpm exec tsx tools/merge-contacts.ts --decisions <decisions.json> --apply
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Decision = { group: string; crmId: string; decision: string };

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const path = args[args.indexOf("--decisions") + 1];
  if (!path || args.indexOf("--decisions") === -1) throw new Error("--decisions <file> is required");
  const decisions: Decision[] = JSON.parse(readFileSync(path, "utf8"));

  const groups = new Map<string, Decision[]>();
  for (const d of decisions) groups.set(d.group, [...(groups.get(d.group) ?? []), d]);

  let merged = 0, skipped = 0, separated = 0;
  console.log(`\n${apply ? "APPLYING" : "DRY RUN — nothing will be written"}\n`);

  for (const [group, rows] of groups) {
    const keepers = rows.filter((r) => r.decision === "keep");
    const losers = rows.filter((r) => r.decision === "merge");
    const separate = rows.filter((r) => r.decision === "separate");

    if (separate.length) { console.log(`${group}: left alone (marked separate)`); separated++; continue; }
    if (keepers.length !== 1 || losers.length !== rows.length - 1) {
      console.log(`${group}: SKIPPED — needs exactly one keep and the rest merge (got ${keepers.length} keep, ${losers.length} merge, ${rows.length} rows)`);
      skipped++; continue;
    }

    const keeper = await prisma.contact.findUnique({ where: { id: keepers[0].crmId } });
    if (!keeper) { console.log(`${group}: SKIPPED — the record marked keep no longer exists`); skipped++; continue; }
    const absorbed = await prisma.contact.findMany({ where: { id: { in: losers.map((l) => l.crmId) } } });

    // Fill blanks on the keeper only; never overwrite what it already holds.
    const fill: Record<string, unknown> = {};
    for (const field of ["email", "phone", "phoneNormalized", "firstName", "lastName", "persona", "organizationId", "ownerUserId"] as const) {
      if (!keeper[field]) {
        const donor = absorbed.find((a) => a[field]);
        if (donor) fill[field] = donor[field];
      }
    }
    const tags = new Set(keeper.tags);
    const sources = new Set((keeper.source ?? "").split(";").map((s) => s.trim()).filter(Boolean));
    for (const a of absorbed) {
      a.tags.forEach((t) => tags.add(t));
      (a.source ?? "").split(";").map((s) => s.trim()).filter(Boolean).forEach((s) => sources.add(s));
    }
    if (tags.size !== keeper.tags.length) fill.tags = [...tags];
    if (sources.size) fill.source = [...sources].join("; ");

    const counts = await prisma.$transaction([
      prisma.interaction.count({ where: { contactId: { in: absorbed.map((a) => a.id) } } }),
      prisma.task.count({ where: { contactId: { in: absorbed.map((a) => a.id) } } }),
      prisma.aiMemoryItem.count({ where: { contactId: { in: absorbed.map((a) => a.id) } } }),
      prisma.opportunity.count({ where: { contactId: { in: absorbed.map((a) => a.id) } } })
    ]);
    const moving = { interactions: counts[0], tasks: counts[1], notes: counts[2], opportunities: counts[3] };

    console.log(`${group}: keep ${keeper.id.slice(0, 8)}, absorb ${absorbed.length}`);
    if (Object.keys(fill).length) console.log(`    fill blanks: ${Object.keys(fill).join(", ")}`);
    const movingSummary = Object.entries(moving).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ");
    console.log(`    move across: ${movingSummary || "nothing"}`);

    if (apply) {
      const ids = absorbed.map((a) => a.id);
      await prisma.$transaction([
        prisma.interaction.updateMany({ where: { contactId: { in: ids } }, data: { contactId: keeper.id } }),
        prisma.task.updateMany({ where: { contactId: { in: ids } }, data: { contactId: keeper.id } }),
        prisma.aiMemoryItem.updateMany({ where: { contactId: { in: ids } }, data: { contactId: keeper.id } }),
        prisma.opportunity.updateMany({ where: { contactId: { in: ids } }, data: { contactId: keeper.id } }),
        prisma.invoice.updateMany({ where: { contactId: { in: ids } }, data: { contactId: keeper.id } }),
        prisma.enrollment.updateMany({ where: { contactId: { in: ids } }, data: { contactId: keeper.id } }),
        ...(Object.keys(fill).length ? [prisma.contact.update({ where: { id: keeper.id }, data: fill })] : []),
        prisma.contact.deleteMany({ where: { id: { in: ids } } })
      ]);
    }
    merged++;
  }

  console.log(`\ngroups merged   : ${merged}`);
  console.log(`groups separate : ${separated}`);
  console.log(`groups skipped  : ${skipped}`);
  if (!apply) console.log("\nRe-run with --apply to write these changes.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
