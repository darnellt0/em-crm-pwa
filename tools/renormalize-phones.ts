/**
 * Re-runs the phone normalizer over stored contacts so the database reflects
 * the current rules.
 *
 * Changing normalizePhone only affects values written after the change; this
 * brings existing rows into line. Dry run by default.
 *
 * Usage:
 *   pnpm exec tsx tools/renormalize-phones.ts
 *   pnpm exec tsx tools/renormalize-phones.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/phone/normalize";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  const contacts = await prisma.contact.findMany({
    where: { OR: [{ phone: { not: null } }, { phoneNormalized: { not: null } }] },
    select: { id: true, firstName: true, lastName: true, phone: true, phoneNormalized: true }
  });

  const recovered: typeof contacts = [];
  const cleared: typeof contacts = [];
  const corrected: typeof contacts = [];
  const changes: { id: string; value: string | null }[] = [];

  for (const c of contacts) {
    const next = normalizePhone(c.phone);
    if (next === c.phoneNormalized) continue;
    changes.push({ id: c.id, value: next });
    if (next && !c.phoneNormalized) recovered.push(c);
    else if (!next && c.phoneNormalized) cleared.push(c);
    else corrected.push(c);
  }

  const name = (c: (typeof contacts)[number]) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "(no name)";
  console.log(`\n${apply ? "APPLYING" : "DRY RUN — nothing will be written"}\n`);
  console.log(`contacts examined            : ${contacts.length}`);
  console.log(`  unchanged                  : ${contacts.length - changes.length}`);
  console.log(`  corrected to a valid number : ${corrected.length}`);
  console.log(`  newly usable                : ${recovered.length}`);
  console.log(`  cleared as not dialable     : ${cleared.length}`);

  for (const [label, list] of [["corrected", corrected], ["newly usable", recovered], ["cleared", cleared]] as const) {
    if (!list.length) continue;
    console.log(`\n--- ${label} ---`);
    for (const c of list) {
      console.log(`  ${name(c).padEnd(22)} raw=${JSON.stringify(c.phone)}`);
      console.log(`  ${"".padEnd(22)} ${JSON.stringify(c.phoneNormalized)} -> ${JSON.stringify(normalizePhone(c.phone))}`);
    }
  }

  if (!apply) {
    console.log("\nRe-run with --apply to write these changes.");
  } else {
    for (const ch of changes) {
      await prisma.contact.update({ where: { id: ch.id }, data: { phoneNormalized: ch.value } });
    }
    console.log(`\nwrote ${changes.length} change(s).`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
