export type ContactMatchType = "canonicalId" | "email" | "phoneName" | "phone";

export interface ContactIdentity {
  canonicalId?: string | null;
  email?: string | null;
  phoneNormalized?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface ExistingContactIdentity extends ContactIdentity {
  id: string;
}

export interface ContactMatchPlan {
  contactId: string | null;
  matchType: ContactMatchType | null;
  conflict: string | null;
}

export function normalizeCanonicalId(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function normalizeIdentityEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function normalizeIdentityName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const normalized = `${firstName ?? ""} ${lastName ?? ""}`
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  return normalized || null;
}

export function canonicalIdFromTags(tags: string[]): string | null {
  for (const tag of tags) {
    const match = /^cid:(.+)$/i.exec(tag.trim());
    if (match) return normalizeCanonicalId(match[1]);
  }
  return null;
}

/**
 * Plans an entire import before any writes happen.
 *
 * Priority is canonical ID, email, exact name + phone, then phone alone only
 * when that phone appears once in the incoming batch. An existing contact can
 * be claimed by only one incoming row. This prevents a shared household phone
 * from collapsing multiple people into a single contact and can split legacy
 * records whose email and name came from different people.
 */
export function planContactIdentityMatches(
  incoming: ContactIdentity[],
  existing: ExistingContactIdentity[],
): ContactMatchPlan[] {
  const plans: ContactMatchPlan[] = incoming.map(() => ({
    contactId: null,
    matchType: null,
    conflict: null,
  }));
  const claimedContactIds = new Map<string, number>();

  const seenCanonicalIds = new Map<string, number>();
  incoming.forEach((row, rowIndex) => {
    const canonicalId = normalizeCanonicalId(row.canonicalId);
    if (canonicalId) {
      const firstRow = seenCanonicalIds.get(canonicalId);
      if (firstRow !== undefined) {
        plans[rowIndex].conflict = `Canonical ID duplicates row ${firstRow + 1}`;
      } else {
        seenCanonicalIds.set(canonicalId, rowIndex);
      }
    }
  });

  const canonicalMap = new Map<string, ExistingContactIdentity>();
  const emailMap = new Map<string, ExistingContactIdentity>();
  const phoneMap = new Map<string, ExistingContactIdentity[]>();

  for (const contact of existing) {
    const canonicalId = normalizeCanonicalId(contact.canonicalId);
    const email = normalizeIdentityEmail(contact.email);
    if (canonicalId) canonicalMap.set(canonicalId, contact);
    if (email) emailMap.set(email, contact);
    if (contact.phoneNormalized) {
      const contacts = phoneMap.get(contact.phoneNormalized) ?? [];
      contacts.push(contact);
      phoneMap.set(contact.phoneNormalized, contacts);
    }
  }

  const assign = (rowIndex: number, contact: ExistingContactIdentity, matchType: ContactMatchType) => {
    const claimedBy = claimedContactIds.get(contact.id);
    if (claimedBy !== undefined && claimedBy !== rowIndex) {
      plans[rowIndex].conflict =
        `Identity ${matchType} points to a contact already claimed by row ${claimedBy + 1}`;
      return false;
    }
    plans[rowIndex] = { contactId: contact.id, matchType, conflict: null };
    claimedContactIds.set(contact.id, rowIndex);
    return true;
  };

  // Stable master-list identity always wins.
  incoming.forEach((row, rowIndex) => {
    const canonicalId = normalizeCanonicalId(row.canonicalId);
    const contact = canonicalId ? canonicalMap.get(canonicalId) : null;
    if (contact) assign(rowIndex, contact, "canonicalId");
  });

  // Email remains the strongest fallback for records not yet anchored.
  incoming.forEach((row, rowIndex) => {
    if (plans[rowIndex].contactId || plans[rowIndex].conflict) return;
    const email = normalizeIdentityEmail(row.email);
    const contact = email ? emailMap.get(email) : null;
    if (contact) assign(rowIndex, contact, "email");
  });

  // Shared phones are safe only when the person's name identifies one
  // unclaimed existing record with that number.
  incoming.forEach((row, rowIndex) => {
    if (plans[rowIndex].contactId || plans[rowIndex].conflict || !row.phoneNormalized) return;
    const incomingName = normalizeIdentityName(row.firstName, row.lastName);
    if (!incomingName) return;
    const candidates = (phoneMap.get(row.phoneNormalized) ?? []).filter(
      (contact) => !claimedContactIds.has(contact.id),
    );
    const nameMatches = candidates.filter(
      (contact) => normalizeIdentityName(contact.firstName, contact.lastName) === incomingName,
    );
    if (nameMatches.length === 1) assign(rowIndex, nameMatches[0], "phoneName");
  });

  // Phone-only matching is allowed only when the incoming batch itself says
  // that the number belongs to one row and one unclaimed existing contact.
  const incomingPhoneCounts = new Map<string, number>();
  for (const row of incoming) {
    if (!row.phoneNormalized) continue;
    incomingPhoneCounts.set(row.phoneNormalized, (incomingPhoneCounts.get(row.phoneNormalized) ?? 0) + 1);
  }
  incoming.forEach((row, rowIndex) => {
    if (plans[rowIndex].contactId || plans[rowIndex].conflict || !row.phoneNormalized) return;
    if (incomingPhoneCounts.get(row.phoneNormalized) !== 1) return;
    const candidates = (phoneMap.get(row.phoneNormalized) ?? []).filter(
      (contact) => !claimedContactIds.has(contact.id),
    );
    if (candidates.length === 1) assign(rowIndex, candidates[0], "phone");
  });

  return plans;
}
