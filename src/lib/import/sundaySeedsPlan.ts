export type SourceIdentityPlan = {
  sheetRow: number;
  action: "create" | "update" | "conflict";
  contactId?: string;
  fields: Record<string, string>;
  conflicts: string[];
};

/** Mark every source row that resolves to the same stable identity for review. */
export function rejectDuplicateSourceIdentities<T extends SourceIdentityPlan>(plans: T[]): void {
  const seen = new Map<string, T>();
  for (const plan of plans) {
    const identities = [
      plan.contactId ? `contact:${plan.contactId}` : "",
      plan.fields.email ? `email:${plan.fields.email.trim().toLowerCase()}` : "",
      plan.fields.phoneNormalized ? `phone:${plan.fields.phoneNormalized}` : "",
    ].filter(Boolean);

    for (const identity of identities) {
      const previous = seen.get(identity);
      if (!previous) {
        seen.set(identity, plan);
        continue;
      }

      const message = `duplicate source identity ${identity} also appears on row ${previous.sheetRow}`;
      if (!plan.conflicts.includes(message)) plan.conflicts.push(message);
      const reverse = `duplicate source identity ${identity} also appears on row ${plan.sheetRow}`;
      if (!previous.conflicts.includes(reverse)) previous.conflicts.push(reverse);
      plan.action = "conflict";
      previous.action = "conflict";
    }
  }
}
