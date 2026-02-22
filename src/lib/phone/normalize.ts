/**
 * Basic E.164-ish phone normalization.
 * Strips all non-digit characters, prepends +1 if no country code.
 * Returns null for empty or invalid inputs.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Strip everything except digits and leading +
  let digits = raw.replace(/[^\d+]/g, "");

  // Remove leading + for processing
  const hasPlus = digits.startsWith("+");
  if (hasPlus) digits = digits.slice(1);

  // Must have at least 7 digits
  if (digits.length < 7) return null;

  // If 10 digits, assume US and prepend 1
  if (digits.length === 10) {
    digits = "1" + digits;
  }

  // If 11 digits starting with 1, it's US format
  // Otherwise keep as-is (international)

  return "+" + digits;
}
