import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireInternalToken } from "@/lib/auth/requireInternalToken";
import { normalizePhone } from "@/lib/phone/normalize";

export async function GET(req: NextRequest) {
  const authError = requireInternalToken(req);
  if (authError) return authError;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100) {
    return NextResponse.json(
      { ok: false, error: "q must contain 2 to 100 characters" },
      { status: 400 }
    );
  }

  const normalizedPhone = normalizePhone(q);
  const terms = q.split(/\s+/).filter(Boolean);
  const termFilters: Prisma.ContactWhereInput[] = terms.map((term) => ({
    OR: [
      { firstName: { contains: term, mode: "insensitive" } },
      { lastName: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
    ],
  }));

  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { AND: termFilters },
        ...(normalizedPhone ? [{ phoneNormalized: { contains: normalizedPhone } }] : []),
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      lifecycleStage: true,
      nextFollowUpAt: true,
      tags: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 10,
  });

  return NextResponse.json({ ok: true, contacts });
}
