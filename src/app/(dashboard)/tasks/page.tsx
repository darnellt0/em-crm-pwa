"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi, apiPost, apiPatch } from "@/hooks/useApi";
import { dateInputToIso } from "@/lib/dates";
import { ContactPicker } from "@/components/crm/ContactPicker";
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
  const [completing, setCompleting] = useState<any>(null);
  const [followChoice, setFollowChoice] = useState("keep");
  const [saving, setSaving] = useState(false);

  const params = new URLSearchParams();
  if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);

  const { data, loading, error, refetch } = useApi<any>(`/api/tasks?${params.toString()}`);

  const tasks = data?.tasks || [];

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await apiPost("/api/tasks", {
        contactId: form.get("contactId") || null,
        ownerUserId: form.get("ownerUserId") || undefined,
        title: form.get("title"),
        description: form.get("description") || undefined,
        priority: form.get("priority") || "medium",
        dueAt: form.get("dueAt") ? dateInputToIso(form.get("dueAt") as string) : undefined,
      });
      toast.success("Task created");
      setCreateOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  const handleComplete = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await apiPatch(`/api/tasks/${completing.id}`, { status: "done", followThrough: {
        choice: followChoice, expectedContactUpdatedAt: completing.contact.updatedAt,
        note: form.get("note"),
        ...(followChoice === "schedule" ? { nextAction: form.get("nextAction"), nextFollowUpAt: dateInputToIso(String(form.get("nextFollowUpAt"))) } : {}),
        ...(followChoice === "clear" ? { leadStatus: form.get("leadStatus") } : {}),
      } });
      toast.success("Task completed and follow-up reviewed"); setCompleting(null); refetch();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const handleToggle = async (taskId: string, currentStatus: string) => {
    const task = tasks.find((t: any) => t.id === taskId);
    if (currentStatus !== "done" && task?.contact) { setFollowChoice("keep"); setCompleting(task); return; }
    setSaving(true);
    try {
      await apiPatch(`/api/tasks/${taskId}`, {
        status: currentStatus === "done" ? "todo" : "done",
      });
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
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
            <Button disabled={!data?.canEdit}>
              <Plus className="h-4 w-4 mr-2" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div><Label htmlFor="task-contact">Contact (optional)</Label>{createOpen && <ContactPicker id="task-contact" name="contactId" />}</div>
              <div><Label htmlFor="task-owner">Assigned to</Label><select id="task-owner" name="ownerUserId" className="w-full rounded border p-2" defaultValue=""><option value="">Me</option>{(data?.users || []).map((user: any) => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}</select></div>
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
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!completing} onOpenChange={open => { if (!open && !saving) setCompleting(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Complete task and review follow-up</DialogTitle></DialogHeader>
          <form onSubmit={handleComplete} className="space-y-4">
            <p>{completing?.title}</p>
            <p className="text-sm text-muted-foreground">Current next step: {completing?.contact?.leadNextAction || "Not set"}. This review is an internal note, not evidence that a meeting occurred.</p>
            <div><Label htmlFor="completion-note">Outcome or reason</Label><Textarea id="completion-note" name="note" required minLength={5} maxLength={1500} /></div>
            <div><Label htmlFor="follow-choice">What happens next?</Label><select id="follow-choice" value={followChoice} onChange={e => setFollowChoice(e.target.value)} className="w-full rounded border p-2"><option value="keep">Keep the existing follow-up unchanged</option><option value="schedule">Set the next step and create its task</option><option value="clear">Clear follow-up and review lead status</option></select></div>
            {followChoice === "schedule" && <><div><Label htmlFor="next-action">Next action</Label><Input id="next-action" name="nextAction" required maxLength={200} /></div><div><Label htmlFor="next-date">Internal follow-up date</Label><Input id="next-date" name="nextFollowUpAt" type="date" required /></div><p className="text-sm">Assigned to the contact’s owner. No message will be sent.</p></>}
            {followChoice === "clear" && <div><Label htmlFor="completion-lead-status">Lead status</Label><select id="completion-lead-status" name="leadStatus" required className="w-full rounded border p-2" defaultValue=""><option value="" disabled>Choose a status</option><option value="unreviewed">Needs review</option><option value="nurture">Nurture</option><option value="disqualified">Not a fit</option></select></div>}
            <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setCompleting(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Complete and save"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

      {error ? <p role="alert" className="text-destructive">Could not load tasks. {error}</p> : loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse bg-muted rounded" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/20">
          <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="font-medium">No tasks found</p>
          <p className="text-sm mt-1">
            {statusFilter === "open"
              ? "You're all caught up! Click \"New Task\" to add one."
              : "No tasks match this filter."}
          </p>
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
                    aria-label={`Complete ${t.title}`}
                    disabled={saving || !data?.canEdit}
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
                    {t.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{t.description}</p>}
                    <p className="text-sm text-muted-foreground">Owner: {t.owner?.name || t.owner?.email || "Unassigned"}</p>
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
