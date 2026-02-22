"use client";

import { useApi } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  CheckSquare,
  Brain,
  TrendingUp,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";

interface DashboardData {
  ok: boolean;
  stats: {
    totalContacts: number;
    totalTasks: number;
    pendingMemories: number;
    totalOpportunities: number;
    recentInteractions: number;
    overdueTasks: number;
    stageBreakdown: Array<{ stage: string; count: number }>;
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

export default function DashboardPage() {
  const { data, loading } = useApi<DashboardData>("/api/dashboard");
  const stats = data?.stats;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-20 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to Elevated Movements CRM
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalContacts ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Tasks</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalTasks ?? 0}</div>
            {(stats?.overdueTasks ?? 0) > 0 && (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertTriangle className="h-3 w-3" />
                {stats?.overdueTasks} overdue
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Memories</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingMemories ?? 0}</div>
            <p className="text-xs text-muted-foreground">AI proposals awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Opportunities</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalOpportunities ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Interactions</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.recentInteractions ?? 0}</div>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Stages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats?.stageBreakdown?.map((s) => (
                <Badge
                  key={s.stage}
                  className={stageColors[s.stage] || stageColors.other}
                >
                  {s.stage}: {s.count}
                </Badge>
              ))}
              {(!stats?.stageBreakdown || stats.stageBreakdown.length === 0) && (
                <p className="text-sm text-muted-foreground">No contacts yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
