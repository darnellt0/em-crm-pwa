import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";

export async function GET() {
  try {
    await requireUser();

    const [
      totalContacts,
      totalTasks,
      pendingMemories,
      totalOpportunities,
      stageBreakdown,
      recentInteractions,
      overdueTasks,
    ] = await Promise.all([
      prisma.contact.count(),
      prisma.task.count({ where: { status: { not: "done" } } }),
      prisma.aiMemoryItem.count({ where: { status: "proposed" } }),
      prisma.opportunity.count(),
      prisma.contact.groupBy({
        by: ["lifecycleStage"],
        _count: { id: true },
      }),
      prisma.interaction.count({
        where: {
          occurredAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.task.count({
        where: {
          dueAt: { lt: new Date() },
          status: { not: "done" },
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      stats: {
        totalContacts,
        totalTasks,
        pendingMemories,
        totalOpportunities,
        recentInteractions,
        overdueTasks,
        stageBreakdown: stageBreakdown.map((s) => ({
          stage: s.lifecycleStage,
          count: s._count.id,
        })),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
