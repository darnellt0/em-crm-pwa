/**
 * crm-import-service.ts
 *
 * Cleaned-master CRM import logic.
 *
 * Rules:
 * - Dedupe by email first, then by normalized phone.
 * - Phone-only contacts are allowed.
 * - Bounced/unsubscribed/suppressed contacts are imported as CRM-safe metadata only.
 * - Needs Review is preserved.
 * - Notes append to persona instead of overwriting.
 * - Owner is mapped by user email.
 * - Organization is found by name or created if missing.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizePhone } from "@/lib/phone/normalize";

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
  status?: string;
  sourceMemberships?: string;
  tags?: string;
  relationshipType?: string;
  contactType?: string;
  owner?: string;
  priority?: string;
  lifecycleStage?: string;
  preferredChannel?: string;
  notes?: string;
  nextFollowUpAt?: string;
  lastContactedAt?: string;
  canonicalId?: string;
  reviewStatus?: string;
  metadataJson?: string;
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
  phoneOnlyRows: number;
  needsReviewRows: number;
  warnings: string[];
}

type NormalizedCrmContact = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  persona: string | null;
  source: string | null;
  lifecycleStage: string | null;
  leadScore: number | null;
  tags: string[];
  nextFollowUpAt: Date | null;
  lastTouchAt: Date | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  reviewStatus: string | null;
  ownerEmail: string | null;
  organization: string | null;
};

const PRIORITY_TO_LEAD_SCORE: Record<string, number> = {
  high: 80,
  medium: 50,
  low: 20
};

function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().toLowerCase();
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return { importMetadataRaw: value };
  }
}

function appendPersona(existing: string | null | undefined, incoming: string | null | undefined): string | null {
  const base = existing?.trim() ?? "";
  const next = incoming?.trim() ?? "";
  if (!next) return base || null;
  if (base.includes(next)) return base;
  return base ? `${base}\n${next}` : next;
}

function crmSafeStatusTags(status: string | null, reviewStatus: string | null) {
  const tags: string[] = [];
  const normalizedStatus = status?.trim().toLowerCase();
  const normalizedReview = reviewStatus?.trim().toLowerCase();

  if (normalizedReview === "needs review" || normalizedReview?.includes("review")) {
    tags.push("Needs Review");
  }
  if (normalizedStatus === "bounced") {
    tags.push("Email Bounce", "Do Not Market");
  }
  if (normalizedStatus === "unsubscribed") {
    tags.push("Unsubscribed", "Do Not Market");
  }
  if (normalizedStatus === "complained" || normalizedStatus === "suppressed") {
    tags.push("Do Not Market");
  }
  return tags;
}

function leadScoreFromPriority(priority: string | null) {
  if (!priority) return null;
  return PRIORITY_TO_LEAD_SCORE[priority.trim().toLowerCase()] ?? null;
}

function shouldSkip(contact: NormalizedCrmContact) {
  return !contact.email && !contact.phoneNormalized && !contact.firstName && !contact.lastName;
}

function rowWarning(contact: NormalizedCrmContact, error: unknown) {
  const identifier = contact.email ?? contact.phoneNormalized ?? "row";
  const message = error instanceof Error ? error.message : "Unknown row error";
  return `${identifier}: ${message}`;
}

type ImportDbClient = PrismaClient | Prisma.TransactionClient;

const existingContactSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  phoneNormalized: true,
  persona: true,
  source: true,
  lifecycleStage: true,
  leadScore: true,
  tags: true,
  ownerUserId: true,
  organizationId: true,
  nextFollowUpAt: true,
  lastTouchAt: true,
} as const;

type ExistingContact = Prisma.ContactGetPayload<{ select: typeof existingContactSelect }>;
type ContactMatch = {
  contact: ExistingContact;
  matchType: "email" | "phone";
};

async function findExistingContact(
  prisma: ImportDbClient,
  contact: NormalizedCrmContact
): Promise<ContactMatch | null> {
  if (contact.email) {
    const byEmail = await prisma.contact.findUnique({
      where: { email: contact.email },
      select: existingContactSelect,
    });
    if (byEmail) return { contact: byEmail, matchType: "email" };
  }

  if (contact.phoneNormalized) {
    const byPhone = await prisma.contact.findUnique({
      where: { phoneNormalized: contact.phoneNormalized },
      select: existingContactSelect,
    });
    if (byPhone) return { contact: byPhone, matchType: "phone" };
  }

  return null;
}

async function appendImportNote(prisma: ImportDbClient, contactId: string, note: string | null) {
  if (!note) return;
  await prisma.interaction.create({
    data: {
      contactId,
      type: "note",
      summary: note,
      outcome: "Imported from cleaned master",
      occurredAt: new Date()
    }
  });
}

export async function runCrmContactImport(
  prisma: PrismaClient,
  rows: CrmContactRow[],
  opts: { dryRun?: boolean; importJobId?: string } = {}
): Promise<CrmImportSummary> {
  const dryRun = opts.dryRun === true;
  const results: CrmImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errored = 0;
  let phoneOnlyRows = 0;
  let needsReviewRows = 0;
  const warnings: string[] = [];
  const previewByEmail = new Map<string, ExistingContact>();
  const previewByPhone = new Map<string, ExistingContact>();

  const rememberPreviewContact = (contact: ExistingContact) => {
    if (contact.email) previewByEmail.set(contact.email, contact);
    if (contact.phoneNormalized) previewByPhone.set(contact.phoneNormalized, contact);
  };

  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true }
  });
  const userByEmail = new Map(allUsers.map((user) => [user.email.toLowerCase(), user.id] as const));

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const normalizedContact = normalizeIncomingRow(row);

    if (!normalizedContact.email && normalizedContact.phoneNormalized) {
      phoneOnlyRows += 1;
    }
    if (normalizedContact.tags.some((tag) => tag.toLowerCase() === "needs review")) {
      needsReviewRows += 1;
    }

    if (shouldSkip(normalizedContact)) {
      skipped += 1;
      results.push({
        rowIndex,
        email: row.email ?? "",
        phone: row.phone ?? "",
        action: "skipped",
        reason: "no identity anchor (no email, phone, or name)"
      });
      continue;
    }

    try {
      let match = await findExistingContact(prisma, normalizedContact);
      if (!match && dryRun && normalizedContact.email) {
        const previewContact = previewByEmail.get(normalizedContact.email);
        if (previewContact) match = { contact: previewContact, matchType: "email" };
      }
      if (!match && dryRun && normalizedContact.phoneNormalized) {
        const previewContact = previewByPhone.get(normalizedContact.phoneNormalized);
        if (previewContact) match = { contact: previewContact, matchType: "phone" };
      }

      const incomingTags = [...normalizedContact.tags];
      addContextTags(incomingTags, row);

      const ownerUserId = normalizedContact.ownerEmail
        ? (userByEmail.get(normalizedContact.ownerEmail) ?? null)
        : null;

      if (match) {
        const { contact: existingContact, matchType } = match;
        const mergedTags = Array.from(new Set([...(existingContact.tags ?? []), ...incomingTags]));
        const finalPersona = appendPersona(existingContact.persona, normalizedContact.notes);
        const finalNextFollowUpAt = normalizedContact.nextFollowUpAt ?? existingContact.nextFollowUpAt ?? null;
        const finalLastTouchAt = normalizedContact.lastTouchAt ?? existingContact.lastTouchAt ?? null;

        if (dryRun) {
          rememberPreviewContact({
            ...existingContact,
            firstName: normalizedContact.firstName ?? existingContact.firstName,
            lastName: normalizedContact.lastName ?? existingContact.lastName,
            email: normalizedContact.email ?? existingContact.email,
            phone: normalizedContact.phone ?? existingContact.phone,
            phoneNormalized: normalizedContact.phoneNormalized ?? existingContact.phoneNormalized,
            persona: finalPersona,
            source: normalizedContact.source ?? existingContact.source,
            lifecycleStage: normalizedContact.lifecycleStage ?? existingContact.lifecycleStage ?? "lead",
            leadScore: normalizedContact.leadScore ?? existingContact.leadScore,
            tags: mergedTags,
            ownerUserId: ownerUserId ?? existingContact.ownerUserId,
            nextFollowUpAt: finalNextFollowUpAt,
            lastTouchAt: finalLastTouchAt,
          });
        } else {
          await prisma.$transaction(async (tx) => {
            const organizationId = await resolveOrganizationId(tx, normalizedContact.organization);
            await tx.contact.update({
              where: { id: existingContact.id },
              data: {
                firstName: normalizedContact.firstName ?? existingContact.firstName ?? undefined,
                lastName: normalizedContact.lastName ?? existingContact.lastName ?? undefined,
                email: normalizedContact.email ?? existingContact.email ?? undefined,
                phone: normalizedContact.phone ?? existingContact.phone ?? undefined,
                phoneNormalized: normalizedContact.phoneNormalized ?? existingContact.phoneNormalized ?? undefined,
                persona: finalPersona ?? undefined,
                source: normalizedContact.source ?? existingContact.source ?? undefined,
                lifecycleStage: normalizedContact.lifecycleStage ?? existingContact.lifecycleStage ?? "lead",
                leadScore: normalizedContact.leadScore ?? existingContact.leadScore,
                tags: mergedTags,
                ownerUserId: ownerUserId ?? existingContact.ownerUserId ?? undefined,
                organizationId: organizationId ?? existingContact.organizationId ?? undefined,
                nextFollowUpAt: finalNextFollowUpAt,
                lastTouchAt: finalLastTouchAt,
              },
            });

            await appendImportNote(tx, existingContact.id, normalizedContact.notes);

            if (opts.importJobId) {
              await tx.importRow.create({
                data: {
                  jobId: opts.importJobId,
                  rowIndex,
                  raw: row as any,
                  normalized: buildNormalizedPayload(normalizedContact, mergedTags) as any,
                  status: "success",
                  action: "updated",
                  matchType,
                  matchedContactId: existingContact.id,
                },
              });
            }
          });
        }

        updated += 1;
        results.push({
          rowIndex,
          email: normalizedContact.email ?? "",
          phone: normalizedContact.phoneNormalized ?? normalizedContact.phone ?? "",
          action: "updated",
          matchType,
          matchedContactId: existingContact.id
        });
      } else {
        if (dryRun) {
          rememberPreviewContact({
            id: `preview-${rowIndex}`,
            firstName: normalizedContact.firstName,
            lastName: normalizedContact.lastName,
            email: normalizedContact.email,
            phone: normalizedContact.phone,
            phoneNormalized: normalizedContact.phoneNormalized,
            persona: normalizedContact.notes,
            source: normalizedContact.source ?? "cleaned-master",
            lifecycleStage: normalizedContact.lifecycleStage ?? "lead",
            leadScore: normalizedContact.leadScore ?? 0,
            tags: incomingTags,
            ownerUserId,
            organizationId: null,
            nextFollowUpAt: normalizedContact.nextFollowUpAt,
            lastTouchAt: normalizedContact.lastTouchAt,
          });
        } else {
          await prisma.$transaction(async (tx) => {
            const organizationId = await resolveOrganizationId(tx, normalizedContact.organization);
            const newContact = await tx.contact.create({
              data: {
                firstName: normalizedContact.firstName ?? undefined,
                lastName: normalizedContact.lastName ?? undefined,
                email: normalizedContact.email ?? undefined,
                phone: normalizedContact.phone ?? undefined,
                phoneNormalized: normalizedContact.phoneNormalized ?? undefined,
                persona: normalizedContact.notes ?? undefined,
                source: normalizedContact.source ?? "cleaned-master",
                lifecycleStage: normalizedContact.lifecycleStage ?? "lead",
                leadScore: normalizedContact.leadScore ?? 0,
                tags: incomingTags,
                ownerUserId: ownerUserId ?? undefined,
                organizationId: organizationId ?? undefined,
                nextFollowUpAt: normalizedContact.nextFollowUpAt ?? undefined,
                lastTouchAt: normalizedContact.lastTouchAt ?? undefined,
              },
            });

            await appendImportNote(tx, newContact.id, normalizedContact.notes);

            if (opts.importJobId) {
              await tx.importRow.create({
                data: {
                  jobId: opts.importJobId,
                  rowIndex,
                  raw: row as any,
                  normalized: buildNormalizedPayload(normalizedContact, incomingTags) as any,
                  status: "success",
                  action: "created",
                  matchedContactId: newContact.id,
                },
              });
            }
          });
        }

        created += 1;
        results.push({
          rowIndex,
          email: normalizedContact.email ?? "",
          phone: normalizedContact.phoneNormalized ?? normalizedContact.phone ?? "",
          action: "created"
        });
      }
    } catch (error) {
      errored += 1;
      const message = error instanceof Error ? error.message : "unknown error";
      warnings.push(rowWarning(normalizedContact, error));
      results.push({
        rowIndex,
        email: normalizedContact.email ?? "",
        phone: normalizedContact.phoneNormalized ?? normalizedContact.phone ?? "",
        action: "error",
        reason: message
      });

      if (!dryRun && opts.importJobId) {
        await prisma.importRow
          .create({
            data: {
              jobId: opts.importJobId,
              rowIndex,
              raw: row as any,
              normalized: buildNormalizedPayload(normalizedContact, normalizedContact.tags) as any,
              status: "error",
              error: message
            }
          })
          .catch(() => {});
      }
    }
  }

  if (!dryRun && opts.importJobId) {
    await prisma.importJob.update({
      where: { id: opts.importJobId },
      data: {
        status: errored > 0 ? "completed_with_errors" : "completed",
        stats: {
          totalRows: rows.length,
          created,
          updated,
          skipped,
          errored,
          phoneOnlyRows,
          needsReviewRows
        } as any
      }
    });
  }

  return {
    totalRows: rows.length,
    created,
    updated,
    skipped,
    errored,
    rows: results,
    dryRun,
    phoneOnlyRows,
    needsReviewRows,
    warnings
  };
}

function normalizeIncomingRow(row: CrmContactRow): NormalizedCrmContact {
  const metadata = parseMetadata(row.metadataJson ?? null);
  const canonicalId = row.canonicalId?.trim();
  if (canonicalId) {
    metadata.canonicalId = canonicalId;
  }

  return {
    firstName: row.firstName?.trim() || null,
    lastName: row.lastName?.trim() || null,
    email: normalizeEmail(row.email),
    phone: row.phone?.trim() || null,
    phoneNormalized: normalizePhone(row.phone),
    persona: row.preferredName?.trim() || row.contactType?.trim() || row.relationshipType?.trim() || null,
    source: row.source?.trim() || null,
    lifecycleStage: row.lifecycleStage?.trim() || null,
    leadScore: leadScoreFromPriority(row.priority ?? null),
    tags: Array.from(new Set([
      ...parseTags(row.tags),
      ...crmSafeStatusTags(row.status ?? null, row.reviewStatus ?? null)
    ])),
    nextFollowUpAt: parseDate(row.nextFollowUpAt ?? null),
    lastTouchAt: parseDate(row.lastContactedAt ?? null),
    notes: row.notes?.trim() || null,
    metadata,
    reviewStatus: row.reviewStatus?.trim() || null,
    ownerEmail: normalizeEmail(row.owner),
    organization: row.organization?.trim() || null
  };
}

function addContextTags(tags: string[], row: CrmContactRow) {
  if (row.preferredName) tags.push(`preferred:${row.preferredName}`);
  if (row.preferredChannel) tags.push(`channel:${row.preferredChannel}`);
  if (row.contactType) tags.push(`type:${row.contactType}`);
  if (row.relationshipType) tags.push(`rel:${row.relationshipType}`);
  if (row.canonicalId) tags.push(`cid:${row.canonicalId}`);
  if (row.sourceMemberships) tags.push(`src:${row.sourceMemberships}`);
}

async function resolveOrganizationId(
  prisma: ImportDbClient,
  organization: string | null
) {
  if (!organization) return null;

  const existing = await prisma.organization.findFirst({ where: { name: organization } });
  if (existing) return existing.id;

  const created = await prisma.organization.create({ data: { name: organization } });
  return created.id;
}

function buildNormalizedPayload(contact: NormalizedCrmContact, tags: string[]) {
  return {
    email: contact.email,
    phone: contact.phone,
    phoneNormalized: contact.phoneNormalized,
    tags,
    reviewStatus: contact.reviewStatus,
    canonicalId: contact.metadata.canonicalId ?? null,
    metadataJson: contact.metadata,
    source: contact.source,
    lifecycleStage: contact.lifecycleStage
  };
}
