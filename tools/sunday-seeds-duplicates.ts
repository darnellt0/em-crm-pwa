/**
 * Finds the CRM records that block the Sunday Seeds import because more than
 * one of them could be the same person.
 *
 * Two kinds are reported: several contacts sharing a name, and several contacts
 * sharing a phone number. For each candidate it reports how much history hangs
 * off the record, because when merging, the record carrying the relationship
 * history is normally the one worth keeping.
 *
 * Read-only. Prints JSON for the review sheet.
 *
 * Usage: pnpm exec tsx tools/sunday-seeds-duplicates.ts --tab <ss.json>
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/phone/normalize";

const prisma = new PrismaClient();
const COL = { first: 0, last: 1, phone: 3, email1: 4 } as const;
const cell = (r: string[], i: number) => String(r?.[i] ?? "").trim();
const lower = (s: string) => s.trim().toLowerCase();
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(s.trim());

async function main() {
  const args = process.argv.slice(2);
  const tabPath = args[args.indexOf("--tab") + 1];
  if (!tabPath || args.indexOf("--tab") === -1) throw new Error("--tab <file> is required");
  const parsed = JSON.parse(readFileSync(tabPath, "utf8"));
  const rows: string[][] = Array.isArray(parsed) ? parsed : (parsed.values ?? []);

  const contacts = await prisma.contact.findMany({
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true, phoneNormalized: true,
      tags: true, source: true, lifecycleStage: true, persona: true, createdAt: true, lastTouchAt: true,
      _count: { select: { interactions: true, tasks: true, opportunities: true, invoices: true, enrollments: true, memories: true } }
    }
  });

  const byName = new Map<string, typeof contacts>();
  const byPhone = new Map<string, typeof contacts>();
  for (const c of contacts) {
    const key = `${lower(c.firstName ?? "")}|${lower(c.lastName ?? "")}`;
    if (key !== "|") byName.set(key, [...(byName.get(key) ?? []), c]);
    if (c.phoneNormalized) byPhone.set(c.phoneNormalized, [...(byPhone.get(c.phoneNormalized) ?? []), c]);
  }

  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    const first = cell(r, COL.first), last = cell(r, COL.last);
    if (!first && !last) continue;
    const emailRaw = cell(r, COL.email1);
    const ssEmail = isEmail(emailRaw) ? lower(emailRaw) : "";
    const ssPhone = normalizePhone(cell(r, COL.phone)) ?? "";

    // An email match is unambiguous (it is the CRM's unique key), so those rows
    // are not blocked and do not belong in this review.
    if (ssEmail && contacts.some((c) => c.email && lower(c.email) === ssEmail)) continue;

    let group = byName.get(`${lower(first)}|${lower(last)}`) ?? [];
    let reason = "same name";
    if (group.length < 2 && ssPhone) {
      const byP = byPhone.get(ssPhone) ?? [];
      if (byP.length > 1) { group = byP; reason = "same phone number"; }
    }
    if (group.length < 2) continue;

    const key = group.map((c) => c.id).sort().join(",");
    if (seen.has(key)) continue;
    seen.add(key);

    for (const c of group) {
      const h = c._count;
      const history = [
        h.interactions && `${h.interactions} interaction(s)`,
        h.tasks && `${h.tasks} task(s)`,
        h.opportunities && `${h.opportunities} opportunity(ies)`,
        h.invoices && `${h.invoices} invoice(s)`,
        h.enrollments && `${h.enrollments} enrolment(s)`,
        h.memories && `${h.memories} note(s)`
      ].filter(Boolean).join(", ") || "none";
      out.push({
        ssRow: i + 1,
        ssName: `${first} ${last}`.trim(),
        ssEmail: ssEmail || emailRaw || "",
        ssPhone,
        why: reason,
        candidates: group.length,
        crmId: c.id,
        crmName: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
        crmEmail: c.email ?? "",
        crmPhone: c.phoneNormalized ?? c.phone ?? "",
        persona: c.persona ?? "",
        source: c.source ?? "",
        tags: c.tags.join("; "),
        created: c.createdAt.toISOString().slice(0, 10),
        lastTouch: c.lastTouchAt ? c.lastTouchAt.toISOString().slice(0, 10) : "",
        history
      });
    }
  }
  console.log(JSON.stringify(out, null, 1));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
