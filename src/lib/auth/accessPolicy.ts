import type { Role } from "@/lib/auth/requireRole";

const ROLE_ENV_VARS: ReadonlyArray<readonly [Role, string]> = [
  ["admin", "ADMIN_EMAILS"],
  ["partner_admin", "PARTNER_ADMIN_EMAILS"],
  ["staff", "STAFF_EMAILS"],
  ["read_only", "READ_ONLY_EMAILS"],
];

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function parseEmailList(value: string | undefined) {
  return new Set(
    (value || "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

export function getAllowedEmails(env: NodeJS.ProcessEnv = process.env) {
  const allowed = parseEmailList(env.ALLOWED_EMAILS);
  for (const [, variable] of ROLE_ENV_VARS) {
    for (const email of parseEmailList(env[variable])) allowed.add(email);
  }
  return allowed;
}

export function isEmailAllowed(email: string, env: NodeJS.ProcessEnv = process.env) {
  return getAllowedEmails(env).has(normalizeEmail(email));
}

export function getConfiguredRole(
  email: string,
  env: NodeJS.ProcessEnv = process.env
): Role {
  const normalized = normalizeEmail(email);
  for (const [role, variable] of ROLE_ENV_VARS) {
    if (parseEmailList(env[variable]).has(normalized)) return role;
  }
  return "staff";
}
