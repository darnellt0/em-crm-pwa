import { NextRequest } from "next/server";
import { requireRole, type Role } from "./requireRole";

/**
 * Accept either a valid session (via requireRole) or a valid internal service
 * token (x-internal-token header matching INTERNAL_SERVICE_TOKEN env var).
 *
 * When authenticated via token, returns a synthetic user context with
 * userId "internal-service" and role "staff". This grants the same write
 * access as a logged-in staff member but never escalates to admin-tier
 * operations (partner_admin, admin).
 *
 * When authenticated via session, behaves identically to requireRole().
 */
export async function requireUserOrInternalToken(
  req: NextRequest,
  minimumRole: Role
): Promise<{ userId: string; role: Role; name: string; email: string }> {
  const token = req.headers.get("x-internal-token")?.trim();
  const expected = process.env.INTERNAL_SERVICE_TOKEN?.trim();

  if (token && expected && token === expected) {
    return {
      userId: "internal-service",
      role: "staff",
      name: "Internal Service",
      email: "internal@system",
    };
  }

  return requireRole(minimumRole);
}
