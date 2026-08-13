/**
 * Helpers for date-only form fields (<input type="date">).
 *
 * `new Date("2026-08-14")` parses as UTC midnight, so in any timezone west
 * of UTC it displays as August 13 — the classic off-by-one-day bug. These
 * helpers round-trip date-only values through LOCAL midnight instead, so a
 * date entered as August 14 always renders as August 14.
 */

/** "YYYY-MM-DD" from a date input → ISO string at local midnight. */
export function dateInputToIso(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toISOString();
}

/** Stored ISO datetime → "YYYY-MM-DD" in local time, for input defaults. */
export function isoToDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
