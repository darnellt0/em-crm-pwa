/**
 * crm-import-service.ts
 *
 * Cleaned-master CRM import logic.
 *
 * Schema facts (from prisma/schema.prisma):
 *   Contact: id, firstName, lastName, email (unique), phone, phoneNormalized (unique),
 *            persona, source, lifecycleStage, leadScore, tags (String[]), lastTouchAt,
 *            nextFollowUpAt, ownerUserId, organizationId
 *   Organization: id, name (NOT unique — use findFirst + create)
 *   ImportJob: id, createdByUserId, entity, filename, status, mapping, stats
 *   ImportRow: id, jobId, rowIndex, raw, normalized, status, action, matchType,
 *              matchedContactId, error
 *
 * Rules:
 *   - Dedupe by email first, then by normalized phone.
 *   - Phone-only contacts (no email) are allowed.
 *   - Bounced/unsubscribed contacts: add tags only, never enroll in marketing.
 *   - "Needs Review" tag is preserved.
 *   - persona field is used for notes (append, never overwrite).
 *   - Owner mapped to existing user by email; unmatched owners ignored.
 *   - Organization: findFirst by name, create if not found.
 *   - dryRun=true previews without writing.
 */

import { normalizePhone } from "@/lib/phone/normalize";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrmContactRow {
  firstName?: string;
  lastName?: string;
  preferredName?: string;
  email?: string;
  secondaryEmail?: string;
  phone?: string;
  city?: string;
  state?: string;
  organization?: string;
  title?: string;
  source?: string;
  sourceMemberships?: string;
  tags?: string;
  relationshipType?: string;
  contactType?: string;
  owner?: string;           // email of the owner user
  priority?: string;        // high | medium | low
  lifecycleStage?: string;
  preferredChannel?: string;
  notes?: string;           // stored in persona field
  nextFollowUpAt?: string;  // ISO date string
  lastContactedAt?: string; // ISO date string
  canonicalId?: string;
  reviewStatus?: string;    // Needs Review | Ready | etc.
}

export interface CrmImportRowResult {
  rowIndex: number;
  email: string;
  phone: string;
  action: "created" | "updated" | "skipped" | "error";
  matchType?: "email" | "phone";
  matchedContactId?: string;
  reason?: string;
}

export interface CrmImportSummary {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errored: number;
  rows: CrmImportRowResult[];
  dryRun: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_TO_LEAD_SCORE: Record<string, number> = {
  high: 80,
  medium: 50,
  low: 20,
};

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizeEmailStr(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().toLowerCase();
}

function appendPersona(
  existing: string | null | undefined,
  incoming: string | undefined
): string | null {
  const base = existing?.trim() ?? "";
  const next = incoming?.trim() ?? "";
  if (!next) return base || null;
  if (base.includes(next)) return base;
  return base ? `${base}\n${next}` : next;
}

// ─── Main import function ─────────────────────────────────────────────────────

export async function runCrmContactImport(
  prisma: any,
  rows: CrmContactRow[],
  opts: { dryRun?: boolean; importJobId?: string; createdByUserId?: string } = {}
): Promise<CrmImportSummary> {
  const { dryRun = false } = opts;
  const results: CrmImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errored = 0;

  // Pre-load all users for owner mapping (email → userId)
  const allUsers: Array<{ id: string; email: string }> = await prisma.user.findMany({
    select: { id: true, email: true },
  });
  const userByEmail = new Map<string, string>(
    allUsers.map((u) => [u.email.toLowerCase(), u.id])
  );

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const emailNorm = normalizeEmailStr(row.email);
    const phoneNorm = normalizePhone(row.phone);

    // Skip rows with no identity anchor
    if (!emailNorm && !phoneNorm && !row.firstName && !row.lastName) {
      results.push({
        rowIndex,
        email: row.email ?? "",
        phone: row.phone ?? "",
        action: "skipped",
        reason: "no identity anchor (no email, phone, or name)",
      });
      skipped++;
      continue;
    }

    try {
      // ── Dedupe ──────────────────────────────────────────────────────────────
      let existingContact: any = null;
      let matchType: "email" | "phone" | undefined;

      if (emailNorm) {
        existingContact = await prisma.contact.findUnique({ where: { email: emailNorm } });
        if (existingContact) matchType = "email";
      }
      if (!existingContact && phoneNorm) {
        existingContact = await prisma.contact.findUnique({ where: { phoneNormalized: phoneNorm } });
        if (existingContact) matchType = "phone";
      }

      // ── Parse incoming tags ─────────────────────────────────────────────────
      const incomingTags = parseTags(row.tags);

      // Preserve "Needs Review" tag if reviewStatus indicates it
      if (
        row.reviewStatus?.toLowerCase().includes("review") &&
        !incomingTags.includes("Needs Review")
      ) {
        incomingTags.push("Needs Review");
      }

      // Add suppression tags (CRM-safe metadata only — no marketing enrollment)
      if (row.tags?.includes("Email Bounce") && !incomingTags.includes("Email Bounce")) {
        incomingTags.push("Email Bounce");
      }
      if (row.tags?.includes("Unsubscribed") && !incomingTags.includes("Unsubscribed")) {
        incomingTags.push("Unsubscribed");
      }

      // Add context tags from metadata fields
      if (row.preferredName) incomingTags.push(`preferred:${row.preferredName}`);
      if (row.preferredChannel) incomingTags.push(`channel:${row.preferredChannel}`);
      if (row.contactType) incomingTags.push(`type:${row.contactType}`);
      if (row.relationshipType) incomingTags.push(`rel:${row.relationshipType}`);
      if (row.canonicalId) incomingTags.push(`cid:${row.canonicalId}`);
      if (row.sourceMemberships) incomingTags.push(`src:${row.sourceMemberships}`);

      // Owner mapping
      const ownerEmail = row.owner?.trim().toLowerCase();
      const ownerUserId = ownerEmail ? (userByEmail.get(ownerEmail) ?? null) : null;

      // Lead score from priority
      const leadScore = row.priority
        ? (PRIORITY_TO_LEAD_SCORE[row.priority.toLowerCase()] ?? undefined)
        : undefined;

      // Dates
      const nextFollowUpAt = row.nextFollowUpAt ? new Date(row.nextFollowUpAt) : null;
      const lastTouchAt = row.lastContactedAt ? new Date(row.lastContactedAt) : null;

      // Organization — findFirst by name, create if not found
      let organizationId: string | null = null;
      if (row.organization?.trim() && !dryRun) {
        const orgName = row.organization.trim();
        const existingOrg = await prisma.organization.findFirst({ where: { name: orgName } });
        if (existingOrg) {
          organizationId = existingOrg.id;
        } else {
          const newOrg = await prisma.organization.create({ data: { name: orgName } });
          organizationId = newOrg.id;
        }
      }

      if (existingContact) {
        // ── Update existing contact ────────────────────────────────────────────
        const existingTags: string[] = existingContact.tags ?? [];
        const mergedTags = Array.from(new Set([...existingTags, ...incomingTags]));

        const finalPersona = appendPersona(existingContact.persona, row.notes);

        // Preserve existing nextFollowUpAt if import value is blank
        const finalNextFollowUpAt = nextFollowUpAt ?? existingContact.nextFollowUpAt ?? null;

        if (!dryRun) {
          await prisma.contact.update({
            where: { id: existingContact.id },
            data: {
              firstName: row.firstName || existingContact.firstName || undefined,
              lastName: row.lastName || existingContact.lastName || undefined,
              email: emailNorm ?? existingContact.email ?? undefined,
              phone: row.phone || existingContact.phone || undefined,
              phoneNormalized: phoneNorm ?? existingContact.phoneNormalized ?? undefined,
              source: row.source || existingContact.source || undefined,
              lifecycleStage: row.lifecycleStage || existingContact.lifecycleStage || "lead",
              leadScore: leadScore ?? existingContact.leadScore,
              tags: mergedTags,
              persona: finalPersona ?? undefined,
              ownerUserId: ownerUserId ?? existingContact.ownerUserId ?? undefined,
              organizationId: organizationId ?? existingContact.organizationId ?? undefined,
              nextFollowUpAt: finalNextFollowUpAt,
              lastTouchAt: lastTouchAt ?? existingContact.lastTouchAt ?? undefined,
            },
          });

          if (opts.importJobId) {
            await prisma.importRow.create({
              data: {
                jobId: opts.importJobId,
                rowIndex,
                raw: row as any,
                normalized: { email: emailNorm, phone: phoneNorm, tags: mergedTags } as any,
                status: "success",
                action: "updated",
                matchType,
                matchedContactId: existingContact.id,
              },
            });
          }
        }

        updated++;
        results.push({
          rowIndex,
          email: emailNorm ?? "",
          phone: phoneNorm ?? "",
          action: "updated",
          matchType,
          matchedContactId: existingContact.id,
        });
      } else {
        // ── Create new contact ─────────────────────────────────────────────────
        if (!dryRun) {
          const newContact = await prisma.contact.create({
            data: {
              firstName: row.firstName || undefined,
              lastName: row.lastName || undefined,
              email: emailNorm ?? undefined,
              phone: row.phone || undefined,
              phoneNormalized: phoneNorm ?? undefined,
              source: row.source || "cleaned-master-import",
              lifecycleStage: row.lifecycleStage || "lead",
              leadScore: leadScore ?? 0,
              tags: incomingTags,
              persona: row.notes || undefined,
              ownerUserId: ownerUserId ?? undefined,
              organizationId: organizationId ?? undefined,
              nextFollowUpAt: nextFollowUpAt ?? undefined,
              lastTouchAt: lastTouchAt ?? undefined,
            },
          });

          if (opts.importJobId) {
            await prisma.importRow.create({
              data: {
                jobId: opts.importJobId,
                rowIndex,
                raw: row as any,
                normalized: { email: emailNorm, phone: phoneNorm, tags: incomingTags } as any,
                status: "success",
                action: "created",
                matchedContactId: newContact.id,
              },
            });
          }
        }

        created++;
        results.push({
          rowIndex,
          email: emailNorm ?? "",
          phone: phoneNorm ?? "",
          action: "created",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      results.push({
        rowIndex,
        email: row.email ?? "",
        phone: row.phone ?? "",
        action: "error",
        reason: msg,
      });
      errored++;

      if (!dryRun && opts.importJobId) {
        await prisma.importRow.create({
          data: {
            jobId: opts.importJobId,
            rowIndex,
            raw: row as any,
            status: "error",
            error: msg,
          },
        }).catch(() => {});
      }
    }
  }

  // Finalize ImportJob
  if (!dryRun && opts.importJobId) {
    await prisma.importJob.update({
      where: { id: opts.importJobId },
      data: {
        status: "completed",
        stats: { total: rows.length, created, updated, skipped, errored } as any,
      },
    });
  }

  return { totalRows: rows.length, created, updated, skipped, errored, rows: results, dryRun };
}
