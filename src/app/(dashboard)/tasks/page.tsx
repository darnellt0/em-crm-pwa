"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi, apiPost, apiPatch } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, CheckSquare, AlertTriangle } from "lucide-react";

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-800",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-red-100 text-red-800",
};

export default function TasksPage() {
  const [statusFilter, setStatusFilter] = useState("open");
  const [createOpen, setCreateOpen] = useState(false);

  const params = new URLSearchParams();
  if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);

  const { data, loading, refetch } = useApi<any>(
    `/api/tasks?${params.toString()}`,
    [statusFilter]
  );

  const tasks = data?.tasks || [];

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await apiPost("/api/tasks", {
        title: form.get("title"),
        description: form.get("description") || undefined,
        priority: form.get("priority") || "medium",
        dueAt: form.get("dueAt") ? new Date(form.get("dueAt") as string).toISOString() : undefined,
      });
      toast.success("Task created");
      setCreateOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggle = async (taskId: string, currentStatus: string) => {
    try {
      await apiPatch(`/api/tasks/${taskId}`, {
        status: currentStatus === "done" ? "todo" : "done",
      });
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground">{tasks.length} tasks</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" required />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <select
                    id="priority"
                    name="priority"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    defaultValue="medium"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="dueAt">Due Date</Label>
                  <Input id="dueAt" name="dueAt" type="date" />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit">Create</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Filter status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="done">Done</SelectItem>
        </SelectContent>
      </Select>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse bg-muted rounded" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No tasks found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t: any) => {
            const isOverdue =
              t.dueAt && new Date(t.dueAt) < new Date() && t.status !== "done";
            return (
              <Card key={t.id} className={isOverdue ? "border-destructive/30" : ""}>
                <CardContent className="flex items-center gap-3 py-3">
                  <Checkbox
                    checked={t.status === "done"}
                    onCheckedChange={() => handleToggle(t.id, t.status)}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        t.status === "done" ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {t.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.contact && (
                        <Link
                          href={`/contacts/${t.contact.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {[t.contact.firstName, t.contact.lastName].filter(Boolean).join(" ")}
                        </Link>
                      )}
                      {t.dueAt && (
                        <span className={`text-xs ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                          {isOverdue && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                          Due: {new Date(t.dueAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge className={priorityColors[t.priority] || priorityColors.medium}>
                    {t.priority}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
