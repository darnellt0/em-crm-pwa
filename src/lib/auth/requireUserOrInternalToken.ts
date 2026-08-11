import { NextRequest } from "next/server";
import { requireRole, type Role } from "./requireRole";
import { isConfiguredToken, tokensMatch } from "@/lib/auth/tokens";

const ROLE_RANK: Record<Role, number> = {
  admin: 40,
  partner_admin: 30,
  staff: 20,
  read_only: 10,
};

/**
 * Accept either a valid session (via requireRole) or a valid internal service
 * token (x-internal-token header matching INTERNAL_SERVICE_TOKEN env var).
 *
 * When authenticated via token, returns a synthetic user context with
 * userId "internal-service" and role "staff". The token path is capped at
 * staff: a call site requiring partner_admin or admin rejects token auth,
 * so the internal token can never reach admin-tier operations.
 *
 * When authenticated via session, behaves identically to requireRole().
 */
export async function requireUserOrInternalToken(
  req: NextRequest,
  minimumRole: Role
): Promise<{ userId: string; role: Role; name: string | null; email: string }> {
  const token = req.headers.get("x-internal-token")?.trim();
  const expected = process.env.INTERNAL_SERVICE_TOKEN;

  if (token && isConfiguredToken(expected) && tokensMatch(token, expected.trim())) {
    if (ROLE_RANK.staff < ROLE_RANK[minimumRole]) {
      throw new Error("FORBIDDEN_ROLE");
    }
    return {
      userId: "internal-service",
      role: "staff",
      name: "Internal Service",
      email: "internal@system",
    };
  }

  return requireRole(minimumRole);
}
