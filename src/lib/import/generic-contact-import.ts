import { normalizePhone } from "@/lib/phone/normalize";
import {
  canonicalIdFromTags,
  normalizeCanonicalId,
  normalizeIdentityEmail,
} from "@/lib/import/contact-match-planner";

export interface GenericImportContact {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  canonicalId: string | null;
  persona: string | null;
  source: string;
  lifecycleStage: string;
  tags: string[];
}

export function applyImportMapping(
  raw: Record<string, string>,
  mapping: Record<string, string | null>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [csvColumn, crmField] of Object.entries(mapping)) {
    if (crmField && crmField !== "skip" && raw[csvColumn] !== undefined) {
      normalized[crmField] = raw[csvColumn];
    }
  }
  return normalized;
}

export function buildGenericImportContact(normalized: Record<string, string>): GenericImportContact {
  const tags = normalized.tags
    ? normalized.tags.split(/[,;]/).map((tag) => tag.trim()).filter(Boolean)
    : [];
  const phone = normalized.phone?.trim() || null;

  return {
    firstName: normalized.firstName?.trim() || null,
    lastName: normalized.lastName?.trim() || null,
    email: normalizeIdentityEmail(normalized.email),
    phone,
    phoneNormalized: normalizePhone(phone),
    canonicalId:
      normalizeCanonicalId(normalized.canonicalId) ?? canonicalIdFromTags(tags),
    persona: normalized.persona?.trim() || null,
    source: normalized.source?.trim() || "import",
    lifecycleStage: normalized.lifecycleStage?.trim() || "lead",
    tags,
  };
}

export function hasGenericImportIdentity(contact: GenericImportContact): boolean {
  return Boolean(
    contact.canonicalId ||
      contact.email ||
      contact.phoneNormalized ||
      contact.firstName ||
      contact.lastName,
  );
}
