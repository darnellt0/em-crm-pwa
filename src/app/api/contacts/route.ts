import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { CreateContactSchema } from "@/lib/validations/contact";
import { normalizePhone } from "@/lib/phone/normalize";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const url = req.nextUrl;
    const q = url.searchParams.get("q") || "";
    const stage = url.searchParams.get("stage") || "";
    const owner = url.searchParams.get("owner") || "";
    const tag = url.searchParams.get("tag") || "";
    const followUp = url.searchParams.get("followUp") || "";
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25));
    const skip = (page - 1) * limit;

    const where: Prisma.ContactWhereInput = {};

    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ];
    }

    if (stage) where.lifecycleStage = stage;
    if (owner) where.ownerUserId = owner;
    if (tag) where.tags = { has: tag };

    if (followUp === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      where.nextFollowUpAt = { gte: start, lte: end };
    } else if (followUp === "overdue") {
      where.nextFollowUpAt = { lt: new Date() };
    } else if (followUp === "7days") {
      const end = new Date();
      end.setDate(end.getDate() + 7);
      where.nextFollowUpAt = { lte: end, gte: new Date() };
    }

    const [items, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          organization: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.contact.count({ where }),
    ]);

    return NextResponse.json({ ok: true, items, total, page, limit });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = CreateContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const phoneNormalized = normalizePhone(data.phone);

    const contact = await prisma.contact.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || undefined,
        phone: data.phone,
        phoneNormalized,
        persona: data.persona,
        source: data.source,
        lifecycleStage: data.lifecycleStage || "lead",
        tags: data.tags || [],
        ownerUserId: data.ownerUserId,
        organizationId: data.organizationId,
        nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : undefined,
      },
    });

    return NextResponse.json({ ok: true, contact }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "A contact with this email or phone already exists" },
        { status: 409 }
      );
    }
    return handleAuthError(error);
  }
}
