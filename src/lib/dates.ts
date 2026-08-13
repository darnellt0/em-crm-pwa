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

/**
 * Stored ISO datetime → "YYYY-MM-DD" for input defaults.
 *
 * Records created before local-midnight storage hold exactly UTC midnight
 * (…T00:00:00.000Z). For those, the UTC calendar date is the intended date —
 * reading it with local getters would prefill the form one day early, and
 * saving any unrelated edit would then silently shift the stored date back
 * a day. Everything else reads in local time.
 */
export function isoToDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const isLegacyUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  const year = isLegacyUtcMidnight ? date.getUTCFullYear() : date.getFullYear();
  const month = (isLegacyUtcMidnight ? date.getUTCMonth() : date.getMonth()) + 1;
  const day = isLegacyUtcMidnight ? date.getUTCDate() : date.getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
