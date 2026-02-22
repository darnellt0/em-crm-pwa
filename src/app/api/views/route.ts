import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { z } from "zod";

const CreateViewSchema = z.object({
  entity: z.string().min(1),
  name: z.string().min(1).max(100),
  isShared: z.boolean().optional().default(false),
  filters: z.record(z.any()).optional().default({}),
  sort: z.array(z.any()).optional().default([]),
  columns: z.array(z.string()).optional().default([]),
});

// GET /api/views?entity=contacts
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const entity = req.nextUrl.searchParams.get("entity") || "contacts";

    const views = await prisma.savedView.findMany({
      where: {
        entity,
        OR: [
          { ownerUserId: user.userId },
          { isShared: true },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ ok: true, views });
  } catch (error) {
    return handleAuthError(error);
  }
}

// POST /api/views
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = CreateViewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const view = await prisma.savedView.create({
      data: {
        ownerUserId: user.userId,
        entity: parsed.data.entity,
        name: parsed.data.name,
        isShared: parsed.data.isShared,
        filters: parsed.data.filters as any,
        sort: parsed.data.sort as any,
        columns: parsed.data.columns as any,
      },
    });

    return NextResponse.json({ ok: true, view }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
