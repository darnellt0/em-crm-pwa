import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizePhone } from "@/lib/phone/normalize";

type NormalizedCrmContact = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  persona: string | null;
  source: string;
  lifecycleStage: string;
  tags: string[];
  nextFollowUpAt: Date | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  reviewStatus: string | null;
};

type CrmImportResult = {
  dryRun: boolean;
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  erroredRows: number;
  phoneOnlyRows: number;
  needsReviewRows: number;
  warnings: string[];
};

type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

export async function previewCleanedMasterImport(input: {
  prisma: PrismaClient;
  csvText: string;
}): Promise<CrmImportResult> {
  return processCleanedMasterImport({ ...input, dryRun: true });
}

export async function applyCleanedMasterImport(input: {
  prisma: PrismaClient;
  csvText: string;
  userId: string;
}): Promise<CrmImportResult & { importJobId: string }> {
  const result = await processCleanedMasterImport({ ...input, dryRun: false });
  const parsed = parseCsv(input.csvText);
  const importJob = await input.prisma.importJob.create({
    data: {
      createdByUserId: input.userId,
      entity: "contacts",
      filename: "cleaned-master-import.csv",
      status: result.erroredRows > 0 ? "completed_with_errors" : "completed",
      mapping: { source: "cleaned-master" },
      stats: {
        totalRows: result.totalRows,
        createdRows: result.createdRows,
        updatedRows: result.updatedRows,
        skippedRows: result.skippedRows,
        erroredRows: result.erroredRows
      } as Prisma.InputJsonValue,
      rows: {
        create: parsed.rows.map((row, index) => ({
          rowIndex: index,
          raw: rowToObject(parsed.headers, row) as Prisma.InputJsonValue,
          status: "processed"
        }))
      }
    }
  });
  return { ...result, importJobId: importJob.id };
}

async function processCleanedMasterImport(input: {
  prisma: PrismaClient;
  csvText: string;
  dryRun: boolean;
}): Promise<CrmImportResult> {
  const parsed = parseCsv(input.csvText);

  if (!hasHeader(parsed.headers, "email") && !hasHeader(parsed.headers, "phone")) {
    throw new Error("CSV must include an email or phone header.");
  }

  const contacts = parsed.rows.map((row) => normalizeContact(parsed.headers, row));
  let createdRows = 0;
  let updatedRows = 0;
  let skippedRows = 0;
  let erroredRows = 0;
  let phoneOnlyRows = 0;
  let needsReviewRows = 0;
  const warnings: string[] = [];

  for (const contact of contacts) {
    if (!contact.email && contact.phoneNormalized) {
      phoneOnlyRows += 1;
    }
    if (contact.tags.some((tag) => tag.toLowerCase() === "needs review")) {
      needsReviewRows += 1;
    }

    if (shouldSkip(contact)) {
      skippedRows += 1;
      continue;
    }

    try {
      const existing = await findExistingContact(input.prisma, contact);
      if (existing) {
        updatedRows += 1;
        if (!input.dryRun) {
          const mergedTags = Array.from(new Set([...(existing.tags ?? []), ...contact.tags]));
          await input.prisma.contact.update({
            where: { id: existing.id },
            data: {
              firstName: contact.firstName ?? existing.firstName,
              lastName: contact.lastName ?? existing.lastName,
              email: contact.email ?? existing.email,
              phone: contact.phone ?? existing.phone,
              phoneNormalized: contact.phoneNormalized ?? existing.phoneNormalized,
              persona: contact.persona ?? existing.persona,
              source: contact.source || existing.source,
              lifecycleStage: contact.lifecycleStage || existing.lifecycleStage,
              tags: mergedTags,
              nextFollowUpAt: contact.nextFollowUpAt ?? existing.nextFollowUpAt
            }
          });
          await appendImportNote(input.prisma, existing.id, contact.notes);
        }
      } else {
        createdRows += 1;
        if (!input.dryRun) {
          const created = await input.prisma.contact.create({
            data: {
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.email,
              phone: contact.phone,
              phoneNormalized: contact.phoneNormalized,
              persona: contact.persona,
              source: contact.source,
              lifecycleStage: contact.lifecycleStage,
              tags: contact.tags,
              nextFollowUpAt: contact.nextFollowUpAt
            }
          });
          await appendImportNote(input.prisma, created.id, contact.notes);
        }
      }
    } catch (error) {
      erroredRows += 1;
      warnings.push(rowWarning(contact, error));
    }
  }

  return {
    dryRun: input.dryRun,
    totalRows: parsed.rows.length,
    createdRows,
    updatedRows,
    skippedRows,
    erroredRows,
    phoneOnlyRows,
    needsReviewRows,
    warnings
  };
}

async function findExistingContact(prisma: PrismaClient, contact: NormalizedCrmContact) {
  if (contact.email) {
    const byEmail = await prisma.contact.findUnique({
      where: { email: contact.email },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        phoneNormalized: true,
        persona: true,
        source: true,
        lifecycleStage: true,
        tags: true,
        nextFollowUpAt: true
      }
    });
    if (byEmail) {
      return byEmail;
    }
  }

  if (contact.phoneNormalized) {
    return prisma.contact.findUnique({
      where: { phoneNormalized: contact.phoneNormalized },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        phoneNormalized: true,
        persona: true,
        source: true,
        lifecycleStage: true,
        tags: true,
        nextFollowUpAt: true
      }
    });
  }

  return null;
}

async function appendImportNote(prisma: PrismaClient, contactId: string, note: string | null) {
  if (!note) {
    return;
  }
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

function normalizeContact(headers: string[], row: string[]): NormalizedCrmContact {
  const email = cell(headers, row, ["email"])?.toLowerCase() ?? null;
  const phone = cell(headers, row, ["phone", "mobile", "telephone"]);
  const reviewStatus = cell(headers, row, ["reviewstatus"]);
  const statusTags = crmSafeStatusTags(cell(headers, row, ["status"]), reviewStatus);
  const baseTags = parseTags(cell(headers, row, ["tags"]));
  const metadata = parseMetadata(cell(headers, row, ["metadatajson"]));
  const canonicalId = cell(headers, row, ["canonicalid"]);

  if (canonicalId) {
    metadata.canonicalId = canonicalId;
  }

  return {
    firstName: cell(headers, row, ["firstname", "first"]),
    lastName: cell(headers, row, ["lastname", "last"]),
    email,
    phone,
    phoneNormalized: normalizePhone(phone),
    persona: cell(headers, row, ["persona", "contacttype", "relationshiptype"]),
    source: cell(headers, row, ["source"]) ?? "cleaned-master",
    lifecycleStage: cell(headers, row, ["lifecyclestage", "stage"]) ?? "lead",
    tags: Array.from(new Set([...baseTags, ...statusTags])),
    nextFollowUpAt: parseDate(cell(headers, row, ["nextfollowupat"])),
    notes: cell(headers, row, ["notes"]),
    metadata,
    reviewStatus
  };
}

function crmSafeStatusTags(status: string | null, reviewStatus: string | null) {
  const tags: string[] = [];
  const normalizedStatus = status?.trim().toLowerCase();
  const normalizedReview = reviewStatus?.trim().toLowerCase();

  if (normalizedReview === "needs review") {
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

function shouldSkip(contact: NormalizedCrmContact) {
  return !contact.email && !contact.phoneNormalized && !contact.firstName && !contact.lastName;
}

function hasHeader(headers: string[], header: string) {
  return headers.some((value) => normalizeHeader(value) === normalizeHeader(header));
}

function cell(headers: string[], row: string[], aliases: string[]) {
  for (const alias of aliases) {
    const index = headers.findIndex((header) => normalizeHeader(header) === alias);
    if (index >= 0) {
      const value = row[index]?.trim();
      if (value) {
        return value;
      }
    }
  }
  return null;
}

function parseTags(value: string | null) {
  return (value ?? "")
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return { importMetadataRaw: value };
  }
}

function rowToObject(headers: string[], row: string[]) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
}

function rowWarning(contact: NormalizedCrmContact, error: unknown) {
  const identifier = contact.email ?? contact.phoneNormalized ?? "row";
  const message = error instanceof Error ? error.message : "Unknown row error";
  return `${identifier}: ${message}`;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsv(csvText: string): ParsedCsv {
  const records: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      if (row.some((cellValue) => cellValue.trim())) {
        records.push(row);
      }
      row = [];
      current = "";
      continue;
    }
    current += char;
  }

  row.push(current);
  if (row.some((cellValue) => cellValue.trim())) {
    records.push(row);
  }

  const headers = records.shift() ?? [];
  return { headers, rows: records };
}
