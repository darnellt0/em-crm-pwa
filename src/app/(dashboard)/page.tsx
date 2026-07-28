"use client";

import Link from "next/link";
import { format } from "date-fns";
import {
  Users,
  CheckSquare,
  Brain,
  TrendingUp,
  MessageSquare,
  AlertTriangle,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  DollarSign,
  UserPlus,
  Flame,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
} from "recharts";
import { useApi } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PriorityAction {
  id: string;
  type: "task" | "opportunity" | "invoice" | "followup";
  title: string;
  score: number;
  reason: string;
  link: string;
}

interface DashboardData {
  ok: boolean;
  stats: {
    totalContacts: number;
    newContactsThisWeek: number;
    newContactsChange: number | null;
    stageBreakdown: Array<{ stage: string; count: number }>;
    totalTasks: number;
    overdueTasks: number;
    tasksDueToday: number;
    pendingMemories: number;
    totalOpportunities: number;
    pipelineValue: number;
    opportunityStageBreakdown: Array<{ stage: string; count: number; value: number }>;
    recentInteractions: number;
    interactionSparkline: Array<{ date: string; count: number }>;
    overdueFollowUps: number;
    followUpsDueToday: number;
  };
}

const stageColors: Record<string, string> = {
  lead: "bg-blue-100 text-blue-800",
  prospect: "bg-cyan-100 text-cyan-800",
  opportunity: "bg-amber-100 text-amber-800",
  customer: "bg-green-100 text-green-800",
  subscriber: "bg-purple-100 text-purple-800",
  evangelist: "bg-pink-100 text-pink-800",
  other: "bg-gray-100 text-gray-800",
};

function scoreBadgeClass(score: number) {
  if (score >= 80) return "bg-red-100 text-red-800 border-red-200";
  if (score >= 60) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  href,
  alert,
  change,
}: {
  title: string;
  value: string | number;
  sub?: React.ReactNode;
  icon: React.ElementType;
  href?: string;
  alert?: boolean;
  change?: number | null;
}) {
  const inner = (
    <Card className={cn("transition-shadow hover:shadow-md", alert && "border-destructive/40")}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", alert ? "text-destructive" : "text-muted-foreground")} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && change !== null && (
          <p className={cn("text-xs flex items-center gap-1 mt-1", change >= 0 ? "text-green-600" : "text-red-600")}>
            {change > 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : change < 0 ? (
              <ArrowDownRight className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {Math.abs(change)}% vs last week
          </p>
        )}
        {sub && <div className="mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function PriorityActionRow({ action }: { action: PriorityAction }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={action.link}>
          <div className="flex items-start gap-3 rounded-lg border border-transparent px-3 py-3 transition-colors hover:border-border hover:bg-muted/40">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{action.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{action.reason}</p>
            </div>
            <Badge className={cn("shrink-0 border text-xs font-semibold", scoreBadgeClass(action.score))}>
              {action.score}
            </Badge>
          </div>
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        This action is prioritized due to {action.reason}
      </TooltipContent>
    </Tooltip>
  );
}

export default function DashboardPage() {
  const { data, loading } = useApi<DashboardData>("/api/dashboard");
  const { data: focusData, loading: focusLoading } = useApi<{ ok: boolean; actions: PriorityAction[] }>("/api/actions/focus");
  const stats = data?.stats;
  const priorityActions = focusData?.actions ?? [];

  const todayLabel = format(new Date(), "EEEE, MMMM d");

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{todayLabel}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{todayLabel}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/contacts">
            <UserPlus className="h-4 w-4 mr-1" />
            Add Contact
          </Link>
        </Button>
      </div>

      {/* Stat Cards Row 1 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Contacts"
          value={stats?.totalContacts ?? 0}
          icon={Users}
          href="/contacts"
          sub={<p className="text-xs text-muted-foreground">+{stats?.newContactsThisWeek ?? 0} this week</p>}
          change={stats?.newContactsChange}
        />
        <StatCard
          title="Open Tasks"
          value={stats?.totalTasks ?? 0}
          icon={CheckSquare}
          href="/tasks"
          alert={(stats?.overdueTasks ?? 0) > 0}
          sub={
            (stats?.overdueTasks ?? 0) > 0 ? (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {stats?.overdueTasks} overdue &middot; {stats?.tasksDueToday} due today
              </p>
            ) : stats?.tasksDueToday ? (
              <p className="text-xs text-muted-foreground">{stats.tasksDueToday} due today</p>
            ) : null
          }
        />
        <StatCard
          title="Pipeline Value"
          value={
            stats?.pipelineValue
              ? `$${stats.pipelineValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : "$0"
          }
          icon={DollarSign}
          href="/pipeline"
          sub={<p className="text-xs text-muted-foreground">{stats?.totalOpportunities ?? 0} open opportunities</p>}
        />
        <StatCard
          title="Pending Memories"
          value={stats?.pendingMemories ?? 0}
          icon={Brain}
          href="/memory-inbox"
          sub={<p className="text-xs text-muted-foreground">AI proposals awaiting review</p>}
        />
      </div>

      {/* Stat Cards Row 2 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Interactions (7d)"
          value={stats?.recentInteractions ?? 0}
          icon={MessageSquare}
          sub={<p className="text-xs text-muted-foreground">Last 7 days</p>}
        />
        <StatCard
          title="Overdue Follow-ups"
          value={stats?.overdueFollowUps ?? 0}
          icon={Bell}
          href="/contacts?followUp=overdue"
          alert={(stats?.overdueFollowUps ?? 0) > 0}
          sub={
            (stats?.followUpsDueToday ?? 0) > 0 ? (
              <p className="text-xs text-muted-foreground">{stats?.followUpsDueToday} due today</p>
            ) : null
          }
        />
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Interaction Activity (7 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {stats?.interactionSparkline && stats.interactionSparkline.length > 0 ? (
              <ResponsiveContainer width="100%" height={60}>
                <AreaChart
                  data={stats.interactionSparkline}
                  margin={{ top: 0, right: 0, left: -30, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="interactionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => format(new Date(v + "T12:00:00"), "EEE")}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide allowDecimals={false} />
                  <ChartTooltip
                    formatter={(v: number) => [v, "Interactions"]}
                    labelFormatter={(l) => format(new Date(l + "T12:00:00"), "MMM d")}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#interactionGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No interactions logged yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Priority Actions + Contact Stage Breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-primary" />
              Priority Actions
              {priorityActions.length > 0 && (
                <Badge className="ml-auto bg-primary/10 text-primary text-xs">
                  {Math.min(priorityActions.length, 5)} item{priorityActions.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {focusLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : priorityActions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                You&apos;re all caught up! Nothing urgent right now.
              </p>
            ) : (
              <TooltipProvider>
                <div className="space-y-2">
                  {priorityActions.slice(0, 5).map((action) => (
                    <PriorityActionRow key={`${action.type}-${action.id}`} action={action} />
                  ))}
                </div>
                <div className="flex gap-2 pt-4">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/tasks?due=overdue">View Tasks</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/pipeline">View Pipeline</Link>
                  </Button>
                </div>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Contacts by Stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!stats?.stageBreakdown || stats.stageBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No contacts yet</p>
            ) : (
              <div className="space-y-2">
                {stats.stageBreakdown
                  .sort((a, b) => b.count - a.count)
                  .map((s) => {
                    const pct =
                      stats.totalContacts > 0
                        ? Math.round((s.count / stats.totalContacts) * 100)
                        : 0;
                    return (
                      <Link key={s.stage} href={`/contacts?stage=${s.stage}`}>
                        <div className="group flex items-center gap-2 py-1 hover:bg-muted/40 rounded px-1 -mx-1 transition-colors">
                          <Badge
                            className={cn(
                              "text-xs w-24 justify-center shrink-0",
                              stageColors[s.stage] || stageColors.other
                            )}
                          >
                            {s.stage}
                          </Badge>
                          <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-primary/60 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right shrink-0">
                            {s.count}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Stage Breakdown */}
      {(stats?.opportunityStageBreakdown?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Pipeline by Stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {stats!.opportunityStageBreakdown.map((s) => (
                <div key={s.stage} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground capitalize mb-1">
                    {s.stage.replace(/_/g, " ")}
                  </p>
                  <p className="text-lg font-bold">
                    {s.value > 0
                      ? `$${s.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      : s.count}
                  </p>
                  {s.value > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {s.count} deal{s.count !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
