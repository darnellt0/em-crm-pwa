import { timingSafeEqual } from "node:crypto";

/**
 * A token env var is only usable if it is set AND is not one of the
 * "change_me…" placeholder values shipped in .env.example — those are public
 * in the repo and must never act as real credentials.
 */
export function isConfiguredToken(value: string | undefined): value is string {
  const trimmed = value?.trim();
  return Boolean(trimmed) && !trimmed!.startsWith("change_me");
}

/** Constant-time token comparison with a length pre-check. */
export function tokensMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
