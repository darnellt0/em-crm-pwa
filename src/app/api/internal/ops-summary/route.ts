import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireInternalToken } from "@/lib/auth/requireInternalToken";

export const dynamic = "force-dynamic";

const CLOSED_OPPORTUNITY_STAGES = ["closed_won", "closed_lost"];
const CLOSED_TASK_STATUSES = ["done", "completed", "closed", "cancelled"];

function startOfToday(now: Date) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return today;
}

function endOfToday(now: Date) {
  const today = new Date(now);
  today.setHours(23, 59, 59, 999);
  return today;
}

function daysAgo(now: Date, days: number) {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date;
}

function contactName(contact: { firstName: string | null; lastName: string | null; email: string | null }) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return name || contact.email || "Unnamed contact";
}

export async function GET(req: NextRequest) {
  const authError = requireInternalToken(req);
  if (authError) return authError;

  try {
    const now = new Date();
    const todayStart = startOfToday(now);
    const todayEnd = endOfToday(now);
    const weekAgo = daysAgo(now, 7);
    const thirtyDaysAgo = daysAgo(now, 30);

    const openOpportunityWhere = {
      stage: { notIn: CLOSED_OPPORTUNITY_STAGES },
    };

    const openTaskWhere = {
      status: { notIn: CLOSED_TASK_STATUSES },
    };

    const [
      totalContacts,
      newContactsThisWeek,
      lifecycleStageBreakdown,
      openOpportunities,
      pipelineValueResult,
      opportunityStageBreakdown,
      staleOpportunities,
      openTasks,
      overdueTasks,
      tasksDueToday,
      followUpsDueToday,
      overdueFollowUps,
      pendingMemories,
      recentInteractions,
    ] = await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.contact.groupBy({ by: ["lifecycleStage"], _count: { id: true } }),
      prisma.opportunity.count({ where: openOpportunityWhere }),
      prisma.opportunity.aggregate({
        _sum: { value: true },
        where: openOpportunityWhere,
      }),
      prisma.opportunity.groupBy({
        by: ["stage"],
        _count: { id: true },
        _sum: { value: true },
        where: openOpportunityWhere,
      }),
      prisma.opportunity.findMany({
        where: {
          ...openOpportunityWhere,
          OR: [
            { closeDate: { lt: todayStart } },
            { createdAt: { lt: thirtyDaysAgo } },
          ],
        },
        select: {
          id: true,
          name: true,
          stage: true,
          value: true,
          closeDate: true,
          createdAt: true,
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              lifecycleStage: true,
            },
          },
        },
        orderBy: [{ closeDate: "asc" }, { createdAt: "asc" }],
        take: 10,
      }),
      prisma.task.count({ where: openTaskWhere }),
      prisma.task.findMany({
        where: { ...openTaskWhere, dueAt: { lt: todayStart } },
        select: {
          id: true,
          title: true,
          priority: true,
          status: true,
          dueAt: true,
          contact: { select: { id: true, firstName: true, lastName: true, email: true } },
          owner: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ dueAt: "asc" }, { priority: "desc" }],
        take: 10,
      }),
      prisma.task.findMany({
        where: { ...openTaskWhere, dueAt: { gte: todayStart, lte: todayEnd } },
        select: {
          id: true,
          title: true,
          priority: true,
          status: true,
          dueAt: true,
          contact: { select: { id: true, firstName: true, lastName: true, email: true } },
          owner: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
        take: 10,
      }),
      prisma.contact.findMany({
        where: { nextFollowUpAt: { gte: todayStart, lte: todayEnd } },
        select: { id: true, firstName: true, lastName: true, email: true, lifecycleStage: true, nextFollowUpAt: true },
        orderBy: { nextFollowUpAt: "asc" },
        take: 10,
      }),
      prisma.contact.findMany({
        where: { nextFollowUpAt: { lt: todayStart } },
        select: { id: true, firstName: true, lastName: true, email: true, lifecycleStage: true, nextFollowUpAt: true },
        orderBy: { nextFollowUpAt: "asc" },
        take: 10,
      }),
      prisma.aiMemoryItem.count({ where: { status: "proposed" } }),
      prisma.interaction.count({ where: { occurredAt: { gte: weekAgo } } }),
    ]);

    const overdueTaskCount = overdueTasks.length;
    const tasksDueTodayCount = tasksDueToday.length;
    const overdueFollowUpCount = overdueFollowUps.length;
    const followUpsDueTodayCount = followUpsDueToday.length;

    return NextResponse.json({
      ok: true,
      source: "em-crm-pwa",
      generatedAt: now.toISOString(),
      stats: {
        totalContacts,
        newContactsThisWeek,
        openOpportunities,
        pipelineValue: Number(pipelineValueResult._sum.value ?? 0),
        openTasks,
        overdueTaskCount,
        tasksDueTodayCount,
        overdueFollowUpCount,
        followUpsDueTodayCount,
        pendingMemories,
        recentInteractions,
        lifecycleStageBreakdown: lifecycleStageBreakdown.map((item) => ({
          stage: item.lifecycleStage,
          count: item._count.id,
        })),
        opportunityStageBreakdown: opportunityStageBreakdown.map((item) => ({
          stage: item.stage,
          count: item._count.id,
          value: Number(item._sum.value ?? 0),
        })),
      },
      focus: {
        staleOpportunities: staleOpportunities.map((item) => ({
          id: item.id,
          name: item.name,
          stage: item.stage,
          value: Number(item.value ?? 0),
          closeDate: item.closeDate?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
          contact: {
            id: item.contact.id,
            name: contactName(item.contact),
            email: item.contact.email,
            lifecycleStage: item.contact.lifecycleStage,
          },
        })),
        overdueTasks: overdueTasks.map((item) => ({
          id: item.id,
          title: item.title,
          priority: item.priority,
          status: item.status,
          dueAt: item.dueAt?.toISOString() ?? null,
          owner: item.owner.name || item.owner.email,
          contact: item.contact ? { id: item.contact.id, name: contactName(item.contact), email: item.contact.email } : null,
        })),
        tasksDueToday: tasksDueToday.map((item) => ({
          id: item.id,
          title: item.title,
          priority: item.priority,
          status: item.status,
          dueAt: item.dueAt?.toISOString() ?? null,
          owner: item.owner.name || item.owner.email,
          contact: item.contact ? { id: item.contact.id, name: contactName(item.contact), email: item.contact.email } : null,
        })),
        overdueFollowUps: overdueFollowUps.map((item) => ({
          id: item.id,
          name: contactName(item),
          email: item.email,
          lifecycleStage: item.lifecycleStage,
          nextFollowUpAt: item.nextFollowUpAt?.toISOString() ?? null,
        })),
        followUpsDueToday: followUpsDueToday.map((item) => ({
          id: item.id,
          name: contactName(item),
          email: item.email,
          lifecycleStage: item.lifecycleStage,
          nextFollowUpAt: item.nextFollowUpAt?.toISOString() ?? null,
        })),
      },
    });
  } catch (error) {
    console.error("Internal ops summary error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal ops summary failed" },
      { status: 500 }
    );
  }
}
