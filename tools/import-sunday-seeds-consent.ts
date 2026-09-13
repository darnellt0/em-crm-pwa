/**
 * Imports Sunday Seeds members from a CSV into the CRM as the single master list.
 *
 * Consent is explicit and per-row: a member is only marked "SMS Opt-In" when the
 * CSV says they consented and records how. Rows without that stay in the
 * community (tagged "Sunday Seeds") but are never texted, which is what the
 * sender enforces.
 *
 * CSV columns (header row required, case-insensitive, extra columns ignored):
 *   first name, last name, preferred name, cell phone number,
 *   sms opt-in status   -> "yes" / "opted in" / "y" marks consent
 *   opt-in method       -> free text, stored as the consent source
 *   do not text         -> "yes"/"true" marks a permanent opt-out
 *
 * Usage:
 *   pnpm exec tsx tools/import-sunday-seeds-consent.ts --file seeds.csv --dry-run
 *   pnpm exec tsx tools/import-sunday-seeds-consent.ts --file seeds.csv --apply
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/phone/normalize";

const prisma = new PrismaClient();

const MEMBER_TAG = "Sunday Seeds";
const OPT_IN_TAG = "SMS Opt-In";
const OPT_OUT_TAG = "Do Not Text";

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((cells) => Object.fromEntries(keys.map((key, index) => [key, (cells[index] ?? "").trim()])));
}

const truthy = (value: string | undefined) =>
  ["yes", "y", "true", "1", "opted in", "opted-in", "confirmed"].includes((value ?? "").trim().toLowerCase());

function pick(row: Row, ...names: string[]) {
  for (const name of names) if (row[name]) return row[name];
  return "";
}

async function main() {
  const args = process.argv.slice(2);
  const file = args[args.indexOf("--file") + 1];
  const apply = args.includes("--apply");
  if (!file || args.indexOf("--file") === -1) throw new Error("--file <path.csv> is required");

  const rows = parseCsv(readFileSync(file, "utf8"));
  const summary = { total: rows.length, skippedNoPhone: 0, created: 0, updated: 0, consented: 0, optedOut: 0 };

  for (const row of rows) {
    const phone = normalizePhone(pick(row, "cell phone number", "phone", "mobile"));
    const firstName = pick(row, "preferred name", "first name") || null;
    const lastName = pick(row, "last name") || null;
    if (!phone) { summary.skippedNoPhone += 1; continue; }

    const optedOut = truthy(pick(row, "do not text"));
    const consented = !optedOut && truthy(pick(row, "sms opt-in status", "opt-in", "consent"));
    const method = pick(row, "opt-in method", "consent source") || "imported list";

    const existing = await prisma.contact.findFirst({ where: { phoneNormalized: phone } });
    const tags = new Set(existing?.tags ?? []);
    tags.add(MEMBER_TAG);
    if (optedOut) { tags.add(OPT_OUT_TAG); tags.delete(OPT_IN_TAG); }
    else if (consented && !tags.has(OPT_OUT_TAG)) tags.add(OPT_IN_TAG);
    if (consented) summary.consented += 1;
    if (optedOut) summary.optedOut += 1;

    const data = {
      firstName: existing?.firstName ?? firstName,
      lastName: existing?.lastName ?? lastName,
      phone: pick(row, "cell phone number", "phone", "mobile"),
      phoneNormalized: phone,
      source: existing?.source ?? "Sunday Seeds",
      tags: Array.from(tags),
      notes: consented ? [existing?.notes, `SMS consent: ${method}`].filter(Boolean).join("\n") : existing?.notes ?? null
    };

    if (apply) {
      if (existing) await prisma.contact.update({ where: { id: existing.id }, data });
      else await prisma.contact.create({ data: { ...data, email: null } });
    }
    if (existing) summary.updated += 1; else summary.created += 1;
  }

  console.log(JSON.stringify({ mode: apply ? "APPLIED" : "DRY RUN", ...summary }, null, 2));
  if (!apply) console.log("\nRe-run with --apply to write these changes.");
  console.log("\nOnly contacts tagged \"SMS Opt-In\" are ever texted. Campaign Studio picks them up on its next sync.");
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
