/**
 * Normalizes a phone number to E.164, or returns null when the input is not a
 * usable number.
 *
 * Returning null matters: a stored value is treated downstream as a number we
 * may text, so anything that is not dialable has to be rejected rather than
 * passed through in a mangled form.
 *
 * Two real-world shapes drove this:
 *   - Some contact fields hold two numbers, e.g. "5102056168:::5108603846".
 *     Concatenating those digits produced a 20-digit value; the first number is
 *     taken instead.
 *   - Spreadsheet debris such as "()209-5651" or "#ERROR!" previously survived
 *     as short, invalid values like "+2095651".
 */

/** Separators seen where a single field holds more than one number. */
const MULTI_VALUE = /:::|[,;/]|\bor\b|\band\b/i;

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Take the first number when the field holds several.
  const first = String(raw).split(MULTI_VALUE)[0] ?? "";
  const digits = first.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  // US: ten digits, or eleven already carrying the country code.
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  // Otherwise treat it as international, but only within the length E.164
  // allows. Length is what separates a real foreign number from corrupt data:
  // the concatenated pairs ran to 20 digits and the spreadsheet debris to 7.
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}
