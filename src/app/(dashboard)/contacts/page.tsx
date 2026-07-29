"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApi, apiPost } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Plus,
  Search,
  UserPlus,
  Tag,
  Calendar,
  CheckSquare,
  ArrowUpDown,
  Bookmark,
  Save,
  Trash2,
  Share2,
} from "lucide-react";

const STAGES = ["lead", "prospect", "opportunity", "customer", "subscriber", "evangelist", "other"];

const stageColors: Record<string, string> = {
  lead: "bg-blue-100 text-blue-800",
  prospect: "bg-cyan-100 text-cyan-800",
  opportunity: "bg-amber-100 text-amber-800",
  customer: "bg-green-100 text-green-800",
  subscriber: "bg-purple-100 text-purple-800",
  evangelist: "bg-pink-100 text-pink-800",
  other: "bg-gray-100 text-gray-800",
};

interface SavedView {
  id: string;
  name: string;
  entity: string;
  isShared: boolean;
  filters: Record<string, any>;
  sort: any[];
  columns: string[];
  ownerUserId: string;
}

interface CRMUser {
  id: string;
  name: string | null;
  email: string;
}

export default function ContactsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const canEdit = Boolean(role && role !== "read_only");
  const canDelete = role === "admin" || role === "partner_admin";
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [followUpFilter, setFollowUpFilter] = useState("");
  const [marketingFilter, setMarketingFilter] = useState("");
  const [contactMethodFilter, setContactMethodFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewShared, setNewViewShared] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [bulkTag, setBulkTag] = useState("");

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search);
    setSearch(initial.get("q") || "");
    setStageFilter(initial.get("stage") || "");
    setOwnerFilter(initial.get("owner") || "");
    setTagFilter(initial.get("tag") || "");
    setFollowUpFilter(initial.get("followUp") || "");
    setMarketingFilter(initial.get("marketing") || "");
    setContactMethodFilter(initial.get("contactMethod") || "");
  }, []);

  // Fetch saved views for contacts
  const { data: viewsData, refetch: refetchViews } = useApi<any>(
    "/api/views?entity=contacts"
  );
  const savedViews: SavedView[] = viewsData?.views || [];
  const { data: usersData } = useApi<any>(canEdit ? "/api/users" : null);
  const users: CRMUser[] = useMemo(() => usersData?.users || [], [usersData]);

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (stageFilter && stageFilter !== "all") params.set("stage", stageFilter);
  if (ownerFilter && ownerFilter !== "all") params.set("owner", ownerFilter);
  if (tagFilter) params.set("tag", tagFilter);
  if (followUpFilter && followUpFilter !== "all") params.set("followUp", followUpFilter);
  if (marketingFilter && marketingFilter !== "all") params.set("marketing", marketingFilter);
  if (contactMethodFilter && contactMethodFilter !== "all") params.set("contactMethod", contactMethodFilter);
  params.set("page", String(page));
  params.set("limit", String(pageSize));

  const { data, loading, refetch } = useApi<any>(
    `/api/contacts?${params.toString()}`
  );

  const contacts = data?.items || [];
  const total = data?.total || 0;

  // Apply a saved view
  const applyView = useCallback((view: SavedView) => {
    setActiveViewId(view.id);
    const filters = view.filters || {};
    if (filters.search) setSearch(filters.search);
    else setSearch("");
    if (filters.stage) setStageFilter(filters.stage);
    else setStageFilter("");
    if (filters.owner) setOwnerFilter(filters.owner);
    else setOwnerFilter("");
    const legacyTags = Array.isArray(filters.tags) ? filters.tags : [];
    setTagFilter(filters.tag || legacyTags[0] || "");
    if (filters.followUp || filters.nextFollowUpAt) setFollowUpFilter(filters.followUp || filters.nextFollowUpAt);
    else setFollowUpFilter("");
    if (filters.marketing) setMarketingFilter(filters.marketing);
    else if (legacyTags.includes("Do Not Market")) setMarketingFilter("suppressed");
    else if (legacyTags.includes("Email Bounce")) setMarketingFilter("bounced");
    else setMarketingFilter("");
    if (filters.contactMethod || filters.phoneOnly) setContactMethodFilter(filters.contactMethod || "phone_only");
    else setContactMethodFilter("");
    if (!filters.owner && filters.ownerEmail) {
      const matchedOwner = users.find((user) => user.email === filters.ownerEmail);
      setOwnerFilter(matchedOwner?.id || "");
    }
    setPage(1);
  }, [users]);

  // Clear active view
  const clearView = useCallback(() => {
    setActiveViewId(null);
    setSearch("");
    setStageFilter("");
    setOwnerFilter("");
    setTagFilter("");
    setFollowUpFilter("");
    setMarketingFilter("");
    setContactMethodFilter("");
    setPage(1);
  }, []);

  // Save current filters as a new view
  const handleSaveView = async () => {
    if (!newViewName.trim()) {
      toast.error("View name is required");
      return;
    }
    try {
      await apiPost("/api/views", {
        entity: "contacts",
        name: newViewName.trim(),
        isShared: newViewShared,
        filters: {
          ...(search ? { search } : {}),
          ...(stageFilter && stageFilter !== "all" ? { stage: stageFilter } : {}),
          ...(ownerFilter && ownerFilter !== "all" ? { owner: ownerFilter } : {}),
          ...(tagFilter ? { tag: tagFilter } : {}),
          ...(followUpFilter && followUpFilter !== "all" ? { followUp: followUpFilter } : {}),
          ...(marketingFilter && marketingFilter !== "all" ? { marketing: marketingFilter } : {}),
          ...(contactMethodFilter && contactMethodFilter !== "all" ? { contactMethod: contactMethodFilter } : {}),
        },
        sort: [],
        columns: [],
      });
      toast.success(`View "${newViewName}" saved`);
      setNewViewName("");
      setNewViewShared(false);
      setSaveViewOpen(false);
      refetchViews();
    } catch (err: any) {
      toast.error(err.message || "Failed to save view");
    }
  };

  // Delete a saved view
  const handleDeleteView = async (viewId: string, viewName: string) => {
    try {
      const res = await fetch(`/api/views/${viewId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      toast.success(`View "${viewName}" deleted`);
      if (activeViewId === viewId) clearView();
      refetchViews();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete view");
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === contacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map((c: any) => c.id)));
    }
  };

  const handleBulkAction = async (action: string, extra: any = {}) => {
    try {
      await apiPost("/api/contacts/bulk", {
        ids: Array.from(selected),
        action,
        ...extra,
      });
      toast.success(`Bulk action "${action}" completed`);
      setSelected(new Set());
      refetch();
      return true;
    } catch (err: any) {
      toast.error(err.message || "Bulk action failed");
      return false;
    }
  };

  const handleFollowUpSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const date = String(form.get("followUpDate") || "");
    if (!date) return;
    const succeeded = await handleBulkAction("set_follow_up", {
      nextFollowUpAt: new Date(`${date}T12:00:00`).toISOString(),
    });
    if (succeeded) setFollowUpOpen(false);
  };

  const handleTaskSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = String(form.get("taskTitle") || "").trim();
    if (!title) return;
    const dueDate = String(form.get("taskDueDate") || "");
    const succeeded = await handleBulkAction("create_task", {
      task: {
        title,
        priority: String(form.get("taskPriority") || "medium"),
        ...(dueDate ? { dueAt: new Date(`${dueDate}T12:00:00`).toISOString() } : {}),
      },
    });
    if (succeeded) setTaskOpen(false);
  };

  const handleTagAction = async (action: "add_tags" | "remove_tags") => {
    const tag = bulkTag.trim();
    if (!tag) return;
    const succeeded = await handleBulkAction(action, { tags: [tag] });
    if (succeeded) {
      setBulkTag("");
      setTagOpen(false);
    }
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await apiPost("/api/contacts", {
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        email: form.get("email") || undefined,
        phone: form.get("phone") || undefined,
        lifecycleStage: form.get("lifecycleStage") || "lead",
      });
      toast.success("Contact created");
      setCreateOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to create contact");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-muted-foreground">{total} total contacts</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Contact</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" name="firstName" required />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" name="lastName" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" />
                </div>
                <div>
                  <Label htmlFor="lifecycleStage">Stage</Label>
                  <select
                    id="lifecycleStage"
                    name="lifecycleStage"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    defaultValue="lead"
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
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
      </div>

      {/* Saved Views + Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Saved Views Dropdown */}
        <div className="flex items-center gap-2">
          <Select
            value={activeViewId || "none"}
            onValueChange={(val) => {
              if (val === "none") {
                clearView();
              } else {
                const view = savedViews.find((v) => v.id === val);
                if (view) applyView(view);
              }
            }}
          >
            <SelectTrigger className="w-[200px]">
              <div className="flex items-center gap-2">
                <Bookmark className="h-3.5 w-3.5" />
                <SelectValue placeholder="Saved Views" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">All Contacts</SelectItem>
              {savedViews.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  <span className="flex items-center gap-1.5">
                    {v.name}
                    {v.isShared && <Share2 className="h-3 w-3 text-muted-foreground" />}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Save current view */}
          <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" title="Save current filters as a view">
                <Save className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save View</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="viewName">View Name</Label>
                  <Input
                    id="viewName"
                    value={newViewName}
                    onChange={(e) => setNewViewName(e.target.value)}
                    placeholder="e.g., Warm Leads"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="viewShared"
                    checked={newViewShared}
                    onCheckedChange={(v) => setNewViewShared(v === true)}
                  />
                  <Label htmlFor="viewShared" className="text-sm">
                    Share with team
                  </Label>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Current filters that will be saved:</p>
                  <ul className="list-disc list-inside mt-1">
                    {search && <li>Search: &quot;{search}&quot;</li>}
                    {stageFilter && stageFilter !== "all" && (
                      <li>Stage: {stageFilter}</li>
                    )}
                    {ownerFilter && ownerFilter !== "all" && (
                      <li>Owner: {ownerFilter === "unassigned" ? "Unassigned" : ownerFilter === "me" ? "Me" : users.find((user) => user.id === ownerFilter)?.name || "Selected user"}</li>
                    )}
                    {tagFilter && <li>Tag: {tagFilter}</li>}
                    {followUpFilter && followUpFilter !== "all" && (
                      <li>Follow-up: {followUpFilter}</li>
                    )}
                    {marketingFilter && marketingFilter !== "all" && (
                      <li>Marketing: {marketingFilter}</li>
                    )}
                    {contactMethodFilter && contactMethodFilter !== "all" && (
                      <li>Contact method: {contactMethodFilter}</li>
                    )}
                    {!search && (!stageFilter || stageFilter === "all") && (!ownerFilter || ownerFilter === "all") && !tagFilter && (!followUpFilter || followUpFilter === "all") && (!marketingFilter || marketingFilter === "all") && (!contactMethodFilter || contactMethodFilter === "all") && (
                      <li>No filters applied</li>
                    )}
                  </ul>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleSaveView}>Save View</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete active view */}
          {activeViewId && (
            <Button
              variant="outline"
              size="icon"
              title="Delete this saved view"
              onClick={() => {
                const view = savedViews.find((v) => v.id === activeViewId);
                if (view && confirm(`Delete view "${view.name}"?`)) {
                  handleDeleteView(view.id, view.name);
                }
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>

        {/* Search + activation filters */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        <Select value={stageFilter || "all"} onValueChange={(v) => { setStageFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ownerFilter || "all"} onValueChange={(v) => { setOwnerFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Owners" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Owners</SelectItem>
            <SelectItem value="me">My Contacts</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.name || user.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={followUpFilter || "all"} onValueChange={(v) => { setFollowUpFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Follow-ups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Follow-ups</SelectItem>
            <SelectItem value="none">Not Scheduled</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="today">Due Today</SelectItem>
            <SelectItem value="7days">Next 7 Days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tagFilter || "all"} onValueChange={(v) => { setTagFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            <SelectItem value="Needs Review">Needs Review</SelectItem>
            {tagFilter && tagFilter !== "Needs Review" && (
              <SelectItem value={tagFilter}>{tagFilter}</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Select value={marketingFilter || "all"} onValueChange={(v) => { setMarketingFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="All Marketing" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Marketing</SelectItem>
            <SelectItem value="marketable">Marketable</SelectItem>
            <SelectItem value="suppressed">Do Not Market</SelectItem>
            <SelectItem value="bounced">Email Bounces</SelectItem>
            <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={contactMethodFilter || "all"} onValueChange={(v) => { setContactMethodFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Contact Methods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contact Methods</SelectItem>
            <SelectItem value="both">Email and Phone</SelectItem>
            <SelectItem value="email_only">Email Only</SelectItem>
            <SelectItem value="phone_only">Phone Only</SelectItem>
            <SelectItem value="none">No Contact Method</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Action Bar */}
      {canEdit && selected.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <span className="text-sm font-medium">
              {selected.size} selected
            </span>
            <div className="flex gap-2 flex-wrap">
              <Select onValueChange={(ownerUserId) => handleBulkAction("assign_owner", { ownerUserId })}>
                <SelectTrigger className="h-8 w-[170px] bg-background">
                  <UserPlus className="h-3.5 w-3.5" />
                  <SelectValue placeholder="Assign owner" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select onValueChange={(lifecycleStage) => handleBulkAction("set_stage", { lifecycleStage })}>
                <SelectTrigger className="h-8 w-[150px] bg-background">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <SelectValue placeholder="Set stage" />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stage.charAt(0).toUpperCase() + stage.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Dialog open={tagOpen} onOpenChange={setTagOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Tag className="h-3.5 w-3.5 mr-1" />
                    Tag
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update tag for {selected.size} contacts</DialogTitle>
                  </DialogHeader>
                  <div>
                    <Label htmlFor="bulkTag">Tag</Label>
                    <Input
                      id="bulkTag"
                      value={bulkTag}
                      onChange={(event) => setBulkTag(event.target.value)}
                      placeholder="Needs Review"
                    />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button variant="outline" disabled={!bulkTag.trim()} onClick={() => handleTagAction("remove_tags")}>
                      Remove
                    </Button>
                    <Button disabled={!bulkTag.trim()} onClick={() => handleTagAction("add_tags")}>
                      Add
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Calendar className="h-3.5 w-3.5 mr-1" />
                    Follow-up
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Schedule follow-up for {selected.size} contacts</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleFollowUpSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="followUpDate">Follow-up date</Label>
                      <Input id="followUpDate" name="followUpDate" type="date" required />
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button type="submit">Schedule</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <CheckSquare className="h-3.5 w-3.5 mr-1" />
                    Task
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create task for {selected.size} contacts</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleTaskSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="taskTitle">Task title</Label>
                      <Input id="taskTitle" name="taskTitle" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="taskDueDate">Due date</Label>
                        <Input id="taskDueDate" name="taskDueDate" type="date" />
                      </div>
                      <div>
                        <Label htmlFor="taskPriority">Priority</Label>
                        <select
                          id="taskPriority"
                          name="taskPriority"
                          defaultValue="medium"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button type="submit">Create</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              {canDelete && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm(`Permanently delete ${selected.size} contact${selected.size !== 1 ? "s" : ""}? This cannot be undone.`)) {
                      handleBulkAction("delete");
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              className="ml-auto"
            >
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-[80px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Contact Table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-10 p-3">
                {canEdit && (
                  <Checkbox
                    checked={contacts.length > 0 && selected.size === contacts.length}
                    onCheckedChange={toggleAll}
                  />
                )}
              </th>
              <th className="p-3 text-left text-sm font-medium">Name</th>
              <th className="p-3 text-left text-sm font-medium hidden md:table-cell">Email</th>
              <th className="p-3 text-left text-sm font-medium hidden lg:table-cell">Phone</th>
              <th className="p-3 text-left text-sm font-medium">Stage</th>
              <th className="p-3 text-left text-sm font-medium hidden lg:table-cell">Owner</th>
              <th className="p-3 text-left text-sm font-medium hidden lg:table-cell">Follow-up</th>
              <th className="p-3 text-left text-sm font-medium hidden xl:table-cell">Tags</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b">
                  <td colSpan={8} className="p-3">
                    <div className="h-8 animate-pulse bg-muted rounded" />
                  </td>
                </tr>
              ))
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="font-medium">No contacts found</p>
                  <p className="text-sm mt-1">Click &ldquo;Add Contact&rdquo; above to create your first contact, or use Import to upload a CSV file.</p>
                </td>
              </tr>
            ) : (
              contacts.map((c: any) => (
                <tr key={c.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="p-3">
                    {canEdit && (
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={() => toggleSelect(c.id)}
                      />
                    )}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed"}
                    </Link>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground hidden md:table-cell">
                    {c.email || "—"}
                  </td>
                  <td className="p-3 text-sm text-muted-foreground hidden lg:table-cell">
                    {c.phone || "—"}
                  </td>
                  <td className="p-3">
                    <Badge className={stageColors[c.lifecycleStage] || stageColors.other}>
                      {c.lifecycleStage}
                    </Badge>
                  </td>
                  <td className="p-3 text-sm hidden lg:table-cell">
                    {c.owner?.name || c.owner?.email || <span className="text-muted-foreground">Unassigned</span>}
                  </td>
                  <td className="p-3 text-sm hidden lg:table-cell">
                    {c.nextFollowUpAt ? (
                      <span className={new Date(c.nextFollowUpAt) < new Date() ? "text-destructive" : "text-muted-foreground"}>
                        {new Date(c.nextFollowUpAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not scheduled</span>
                    )}
                  </td>
                  <td className="p-3 hidden xl:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {c.tags?.slice(0, 3).map((t: string) => (
                        <Badge key={t} variant="outline" className="text-xs">
                          {t}
                        </Badge>
                      ))}
                      {c.tags?.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{c.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
