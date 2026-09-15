import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { handleAuthError, requireRole } from "@/lib/auth/requireRole";
import { LeadQuerySchema, LEAD_QUEUES, leadWhere } from "@/lib/leads";

export async function GET(req: NextRequest) {
  try {
    const { userId, role } = await requireRole("read_only");
    const parsed = LeadQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    const query = parsed.data;
    const where = leadWhere(query, userId);
    const [contacts, total, users, counts] = await Promise.all([
      prisma.contact.findMany({
        where, take: 30, skip: (query.page - 1) * 30,
        orderBy: [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }, { id: "asc" }],
        include: {
          owner: { select: { name: true, email: true } }, organization: { select: { name: true } },
          tasks: { where: { status: { not: "done" } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { id: "asc" }], take: 1, select: { id: true, title: true, dueAt: true } },
          _count: { select: { opportunities: true } },
        },
      }),
      prisma.contact.count({ where }),
      prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
      Promise.all(LEAD_QUEUES.map(async queue => [queue, await prisma.contact.count({ where: leadWhere({ ...query, queue }, userId) })])),
    ]);
    return NextResponse.json({ ok: true, contacts, users, total, page: query.page, pageSize: 30, counts: Object.fromEntries(counts), canEdit: role !== "read_only" });
  } catch (error) { return handleAuthError(error); }
}
