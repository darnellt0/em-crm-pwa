"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
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

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewShared, setNewViewShared] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Fetch saved views for contacts
  const { data: viewsData, refetch: refetchViews } = useApi<any>(
    "/api/views?entity=contacts",
    []
  );
  const savedViews: SavedView[] = viewsData?.views || [];

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (stageFilter && stageFilter !== "all") params.set("stage", stageFilter);

  const { data, loading, refetch } = useApi<any>(
    `/api/contacts?${params.toString()}`,
    [search, stageFilter]
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
  }, []);

  // Clear active view
  const clearView = useCallback(() => {
    setActiveViewId(null);
    setSearch("");
    setStageFilter("");
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
    } catch (err: any) {
      toast.error(err.message || "Bulk action failed");
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
                    {!search && (!stageFilter || stageFilter === "all") && (
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

        {/* Search + Stage Filter */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
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
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <span className="text-sm font-medium">
              {selected.size} selected
            </span>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const stage = prompt("Enter stage (lead, prospect, opportunity, customer, subscriber, evangelist):");
                  if (stage) handleBulkAction("set_stage", { lifecycleStage: stage });
                }}
              >
                <ArrowUpDown className="h-3 w-3 mr-1" />
                Set Stage
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const tags = prompt("Enter tags (comma-separated):");
                  if (tags) handleBulkAction("add_tags", { tags: tags.split(",").map((t) => t.trim()) });
                }}
              >
                <Tag className="h-3 w-3 mr-1" />
                Add Tags
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const date = prompt("Enter follow-up date (YYYY-MM-DD):");
                  if (date) handleBulkAction("set_follow_up", { nextFollowUpAt: new Date(date).toISOString() });
                }}
              >
                <Calendar className="h-3 w-3 mr-1" />
                Set Follow-up
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const title = prompt("Enter task title:");
                  if (title) handleBulkAction("create_task", { task: { title } });
                }}
              >
                <CheckSquare className="h-3 w-3 mr-1" />
                Create Task
              </Button>
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

      {/* Contact Table */}
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-10 p-3">
                <Checkbox
                  checked={contacts.length > 0 && selected.size === contacts.length}
                  onCheckedChange={toggleAll}
                />
              </th>
              <th className="p-3 text-left text-sm font-medium">Name</th>
              <th className="p-3 text-left text-sm font-medium hidden md:table-cell">Email</th>
              <th className="p-3 text-left text-sm font-medium hidden lg:table-cell">Phone</th>
              <th className="p-3 text-left text-sm font-medium">Stage</th>
              <th className="p-3 text-left text-sm font-medium hidden lg:table-cell">Tags</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b">
                  <td colSpan={6} className="p-3">
                    <div className="h-8 animate-pulse bg-muted rounded" />
                  </td>
                </tr>
              ))
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No contacts found</p>
                </td>
              </tr>
            ) : (
              contacts.map((c: any) => (
                <tr key={c.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="p-3">
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={() => toggleSelect(c.id)}
                    />
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
                  <td className="p-3 hidden lg:table-cell">
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
