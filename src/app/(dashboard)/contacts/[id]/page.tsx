"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useApi, apiPost, apiPatch } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Phone,
  Mail,
  Calendar,
  Brain,
  Pin,
  MessageSquare,
  CheckSquare,
} from "lucide-react";

const stageColors: Record<string, string> = {
  lead: "bg-blue-100 text-blue-800",
  prospect: "bg-cyan-100 text-cyan-800",
  opportunity: "bg-amber-100 text-amber-800",
  customer: "bg-green-100 text-green-800",
  subscriber: "bg-purple-100 text-purple-800",
  evangelist: "bg-pink-100 text-pink-800",
  other: "bg-gray-100 text-gray-800",
};

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: contactData, loading, refetch } = useApi<any>(`/api/contacts/${id}`);
  const { data: interactionsData, refetch: refetchInteractions } = useApi<any>(
    `/api/contacts/${id}/interactions`
  );
  const { data: tasksData, refetch: refetchTasks } = useApi<any>(
    `/api/contacts/${id}/tasks`
  );
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const contact = contactData?.contact;
  const interactions = interactionsData?.interactions || [];
  const tasks = tasksData?.tasks || [];

  const handleAddInteraction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await apiPost("/api/interactions", {
        contactId: id,
        type: form.get("type"),
        summary: form.get("summary"),
        outcome: form.get("outcome") || undefined,
      });
      toast.success("Interaction logged. AI memory extraction triggered.");
      setInteractionOpen(false);
      refetchInteractions();
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await apiPost("/api/tasks", {
        contactId: id,
        title: form.get("title"),
        description: form.get("description") || undefined,
        priority: form.get("priority") || "medium",
        dueAt: form.get("dueAt") ? new Date(form.get("dueAt") as string).toISOString() : undefined,
      });
      toast.success("Task created");
      setTaskOpen(false);
      refetchTasks();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await apiPatch(`/api/tasks/${taskId}`, { status: "done" });
      toast.success("Task completed");
      refetchTasks();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse bg-muted rounded" />
        <div className="h-64 animate-pulse bg-muted rounded" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Contact not found</p>
        <Link href="/contacts">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Contacts
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/contacts">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed Contact"}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={stageColors[contact.lifecycleStage] || stageColors.other}>
              {contact.lifecycleStage}
            </Badge>
            {contact.tags?.map((t: string) => (
              <Badge key={t} variant="outline" className="text-xs">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Contact Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6 space-y-3">
            {contact.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                  {contact.email}
                </a>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {contact.phone}
              </div>
            )}
            {contact.nextFollowUpAt && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Follow-up: {new Date(contact.nextFollowUpAt).toLocaleDateString()}
              </div>
            )}
            {contact.owner && (
              <div className="text-sm text-muted-foreground">
                Owner: {contact.owner.name || contact.owner.email}
              </div>
            )}
            {contact.organization && (
              <div className="text-sm text-muted-foreground">
                Org: {contact.organization.name}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{contact._count?.interactions || 0} interactions</p>
            <p>{contact._count?.tasks || 0} tasks</p>
            <p>{contact._count?.opportunities || 0} opportunities</p>
            <p>{contact._count?.memories || 0} memories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4" />
              AI Memories
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contact.memories?.length > 0 ? (
              <ul className="space-y-2">
                {contact.memories.slice(0, 5).map((m: any) => (
                  <li key={m.id} className="text-sm flex items-start gap-2">
                    {m.isPinned && <Pin className="h-3 w-3 text-primary mt-0.5 shrink-0" />}
                    <span>{m.content}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No approved memories yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Interactions, Tasks */}
      <Tabs defaultValue="interactions">
        <TabsList>
          <TabsTrigger value="interactions" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Interactions
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2">
            <CheckSquare className="h-4 w-4" />
            Tasks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="interactions" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={interactionOpen} onOpenChange={setInteractionOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Log Interaction
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Log Interaction</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddInteraction} className="space-y-4">
                  <div>
                    <Label htmlFor="type">Type</Label>
                    <select
                      id="type"
                      name="type"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      defaultValue="note"
                    >
                      <option value="call">Call</option>
                      <option value="email">Email</option>
                      <option value="meeting">Meeting</option>
                      <option value="note">Note</option>
                      <option value="sms">SMS</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="summary">Summary</Label>
                    <Textarea id="summary" name="summary" rows={4} placeholder="Describe the interaction..." />
                  </div>
                  <div>
                    <Label htmlFor="outcome">Outcome (optional)</Label>
                    <Input id="outcome" name="outcome" />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button type="submit">Log</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {interactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No interactions logged yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {interactions.map((i: any) => (
                <Card key={i.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">{i.type}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(i.occurredAt).toLocaleString()}
                      </span>
                      {i.creator && (
                        <span className="text-xs text-muted-foreground">
                          by {i.creator.name || i.creator.email}
                        </span>
                      )}
                    </div>
                    {i.summary && <p className="text-sm">{i.summary}</p>}
                    {i.outcome && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Outcome: {i.outcome}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Task</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddTask} className="space-y-4">
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

          {tasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No tasks yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((t: any) => (
                <Card key={t.id}>
                  <CardContent className="flex items-center gap-3 py-3">
                    <Checkbox
                      checked={t.status === "done"}
                      onCheckedChange={() => handleCompleteTask(t.id)}
                    />
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                        {t.title}
                      </p>
                      {t.dueAt && (
                        <p className="text-xs text-muted-foreground">
                          Due: {new Date(t.dueAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Badge variant={t.priority === "urgent" ? "destructive" : "outline"}>
                      {t.priority}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
