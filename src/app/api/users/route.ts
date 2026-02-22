import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole, handleAuthError } from "@/lib/auth/requireRole";
import { z } from "zod";

export async function GET() {
  try {
    await requireRole("staff");
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ ok: true, users });
  } catch (error) {
    return handleAuthError(error);
  }
}

const UpdateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "partner_admin", "staff", "read_only"]),
});

export async function PATCH(req: NextRequest) {
  try {
    await requireRole("admin");
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: parsed.data.userId },
      data: { role: parsed.data.role },
      select: { id: true, name: true, email: true, role: true },
    });

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    return handleAuthError(error);
  }
}
