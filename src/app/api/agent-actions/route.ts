import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { expirePendingAgentActions, summarizeAgentAction } from "@/lib/agentActions";
import { handleAuthError, requireRole } from "@/lib/auth/requireRole";

const ALLOWED_STATUSES = new Set(["pending", "executed", "rejected", "failed", "expired", "all"]);

export async function GET(req: NextRequest) {
  try {
    await requireRole("read_only");
    await expirePendingAgentActions();

    const requestedStatus = req.nextUrl.searchParams.get("status") || "pending";
    const status = ALLOWED_STATUSES.has(requestedStatus) ? requestedStatus : "pending";
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50));

    const actions = await prisma.agentActionRequest.findMany({
      where: status === "all" ? {} : { status },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      ok: true,
      actions: actions.map((action) => ({
        ...action,
        summary: summarizeAgentAction(action.payload),
      })),
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
