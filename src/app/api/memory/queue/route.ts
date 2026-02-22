import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const url = req.nextUrl;
    const status = url.searchParams.get("status") || "proposed";
    const q = url.searchParams.get("q") || "";
    const contactId = url.searchParams.get("contactId") || "";
    const pinnedOnly = url.searchParams.get("pinnedOnly") === "true";
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    const where: Prisma.AiMemoryItemWhereInput = { status };

    if (q) {
      where.content = { contains: q, mode: "insensitive" };
    }
    if (contactId) where.contactId = contactId;
    if (pinnedOnly) where.isPinned = true;

    const [items, total] = await Promise.all([
      prisma.aiMemoryItem.findMany({
        where,
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, email: true } },
          reviewer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.aiMemoryItem.count({ where }),
    ]);

    return NextResponse.json({ ok: true, items, total, limit, offset });
  } catch (error) {
    return handleAuthError(error);
  }
}
