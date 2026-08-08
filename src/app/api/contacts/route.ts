import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { handleAuthError } from "@/lib/auth/requireRole";
import { requireUserOrInternalToken } from "@/lib/auth/requireUserOrInternalToken";
import { CreateContactSchema } from "@/lib/validations/contact";
import { normalizePhone } from "@/lib/phone/normalize";
import { buildContactWhere } from "@/lib/contacts/filters";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUserOrInternalToken(req, "read_only");
    const url = req.nextUrl;
    const q = url.searchParams.get("q") || "";
    const stage = url.searchParams.get("stage") || "";
    const owner = url.searchParams.get("owner") || "";
    const tag = url.searchParams.get("tag") || "";
    const followUp = url.searchParams.get("followUp") || "";
    const marketing = url.searchParams.get("marketing") || "";
    const contactMethod = url.searchParams.get("contactMethod") || "";
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const skip = (page - 1) * limit;

    const where = buildContactWhere({
      q,
      stage,
      owner,
      tag,
      followUp,
      marketing,
      contactMethod,
      userId,
    });

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
    await requireUserOrInternalToken(req, "staff");
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
