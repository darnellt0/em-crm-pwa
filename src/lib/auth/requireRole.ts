import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";

export type Role = "admin" | "partner_admin" | "staff" | "read_only";

const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 40,
  partner_admin: 30,
  staff: 20,
  read_only: 10,
};

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("UNAUTHENTICATED");

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, name: true, email: true },
  });
  if (!user) throw new Error("UNAUTHENTICATED");

  return { userId: user.id, role: user.role as Role, name: user.name, email: user.email };
}

export async function requireRole(minimumRole: Role) {
  const user = await requireUser();
  if ((ROLE_HIERARCHY[user.role] || 0) < ROLE_HIERARCHY[minimumRole]) {
    throw new Error("FORBIDDEN_ROLE");
  }
  return user;
}

export function handleAuthError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "UNAUTHENTICATED") {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    if (error.message === "FORBIDDEN_ROLE") {
      return new Response(
        JSON.stringify({ ok: false, error: "Forbidden: Insufficient Permissions" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
  }
  return new Response(
    JSON.stringify({ ok: false, error: "Internal Server Error" }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}
