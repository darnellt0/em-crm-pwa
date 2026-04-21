import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";

export async function GET() {
  try {
    const { userId } = await requireUser();

    const now = new Date();

    // Time boundaries
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    // Build last 7 days array for sparkline
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });

    const [
      totalContacts,
      newContactsThisWeek,
      newContactsLastWeek,
      totalTasks,
      overdueTasks,
      tasksDueToday,
      pendingMemories,
      totalOpportunities,
      pipelineValueResult,
      opportunityStageBreakdown,
      recentInteractions,
      overdueFollowUps,
      followUpsDueToday,
      stageBreakdown,
      interactionsRaw,
      myTasksDueToday,
      myOverdueTasks,
    ] = await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.contact.count({ where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.task.count({ where: { status: { not: "done" } } }),
      prisma.task.count({ where: { dueAt: { lt: now }, status: { not: "done" } } }),
      prisma.task.count({ where: { dueAt: { gte: todayStart, lte: todayEnd }, status: { not: "done" } } }),
      prisma.aiMemoryItem.count({ where: { status: "proposed" } }),
      prisma.opportunity.count({ where: { stage: { not: "closed_won" } } }),
      prisma.opportunity.aggregate({
        _sum: { value: true },
        where: { stage: { notIn: ["closed_won", "closed_lost"] } },
      }),
      prisma.opportunity.groupBy({
        by: ["stage"],
        _count: { id: true },
        _sum: { value: true },
      }),
      prisma.interaction.count({ where: { occurredAt: { gte: weekAgo } } }),
      prisma.contact.count({ where: { nextFollowUpAt: { lt: now } } }),
      prisma.contact.count({ where: { nextFollowUpAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.contact.groupBy({ by: ["lifecycleStage"], _count: { id: true } }),
      prisma.interaction.findMany({
        where: { occurredAt: { gte: last7Days[0] } },
        select: { occurredAt: true },
      }),
      prisma.task.findMany({
        where: { ownerUserId: userId, dueAt: { gte: todayStart, lte: todayEnd }, status: { not: "done" } },
        include: { contact: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
        take: 10,
      }),
      prisma.task.findMany({
        where: { ownerUserId: userId, dueAt: { lt: todayStart }, status: { not: "done" } },
        include: { contact: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: [{ dueAt: "asc" }, { priority: "desc" }],
        take: 10,
      }),
    ]);

    // Build sparkline: count interactions per day
    const interactionSparkline = last7Days.map((dayStart) => {
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      const count = interactionsRaw.filter((r) => {
        const d = new Date(r.occurredAt);
        return d >= dayStart && d <= dayEnd;
      }).length;
      return { date: dayStart.toISOString().slice(0, 10), count };
    });

    // Overdue follow-up contacts (up to 10 for Today's Focus)
    const overdueFollowUpContacts = await prisma.contact.findMany({
      where: { nextFollowUpAt: { lt: now } },
      select: { id: true, firstName: true, lastName: true, email: true, lifecycleStage: true, nextFollowUpAt: true },
      orderBy: { nextFollowUpAt: "asc" },
      take: 10,
    });

    // Follow-ups due today (up to 10)
    const followUpsTodayContacts = await prisma.contact.findMany({
      where: { nextFollowUpAt: { gte: todayStart, lte: todayEnd } },
      select: { id: true, firstName: true, lastName: true, email: true, lifecycleStage: true, nextFollowUpAt: true },
      orderBy: { nextFollowUpAt: "asc" },
      take: 10,
    });

    const pipelineValue = Number(pipelineValueResult._sum.value ?? 0);
    const newContactsChange =
      newContactsLastWeek === 0
        ? null
        : Math.round(((newContactsThisWeek - newContactsLastWeek) / newContactsLastWeek) * 100);

    return NextResponse.json({
      ok: true,
      stats: {
        totalContacts,
        newContactsThisWeek,
        newContactsChange,
        stageBreakdown: stageBreakdown.map((s) => ({ stage: s.lifecycleStage, count: s._count.id })),
        totalTasks,
        overdueTasks,
        tasksDueToday,
        pendingMemories,
        totalOpportunities,
        pipelineValue,
        opportunityStageBreakdown: opportunityStageBreakdown.map((s) => ({
          stage: s.stage,
          count: s._count.id,
          value: Number(s._sum.value ?? 0),
        })),
        recentInteractions,
        interactionSparkline,
        overdueFollowUps,
        followUpsDueToday,
        focus: {
          myTasksDueToday,
          myOverdueTasks,
          overdueFollowUpContacts,
          followUpsTodayContacts,
        },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
