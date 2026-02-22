import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { CreateTaskSchema } from "@/lib/validations/task";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const url = req.nextUrl;
    const ownerFilter = url.searchParams.get("owner");
    const statusFilter = url.searchParams.get("status");
    const dueFilter = url.searchParams.get("due");

    const where: Prisma.TaskWhereInput = {};

    if (ownerFilter === "me") {
      where.ownerUserId = userId;
    } else if (ownerFilter) {
      where.ownerUserId = ownerFilter;
    }

    if (statusFilter) where.status = statusFilter;

    if (dueFilter === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      where.dueAt = { gte: start, lte: end };
    } else if (dueFilter === "7days") {
      const end = new Date();
      end.setDate(end.getDate() + 7);
      where.dueAt = { lte: end, gte: new Date() };
    } else if (dueFilter === "overdue") {
      where.dueAt = { lt: new Date() };
      where.status = { not: "done" };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ dueAt: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ ok: true, tasks });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = CreateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const task = await prisma.task.create({
      data: {
        contactId: data.contactId,
        ownerUserId: userId,
        title: data.title,
        description: data.description,
        priority: data.priority || "medium",
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        source: data.source || "manual",
      },
    });

    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
