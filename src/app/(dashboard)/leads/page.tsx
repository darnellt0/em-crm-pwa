"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi, apiPatch } from "@/hooks/useApi";
import { LEAD_LABELS, LEAD_STATUSES, type LEAD_QUEUES } from "@/lib/leads";
import { dateInputToIso, isoToDateInput } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

type Queue = typeof LEAD_QUEUES[number];
type Person = { id: string; name: string | null; email: string };
type Lead = {
  id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null;
  lifecycleStage: string; leadStatus: string; leadNextAction: string | null; leadReviewedAt: string | null;
  ownerUserId: string | null; nextFollowUpAt: string | null; lastTouchAt: string | null; updatedAt: string;
  source: string | null; owner: Pick<Person, "name" | "email"> | null; organization: { name: string } | null;
  tasks: { id: string; title: string; dueAt: string | null }[]; _count: { opportunities: number };
};
type LeadResponse = { contacts: Lead[]; users: Person[]; total: number; pageSize: number; counts: Record<Queue, number>; canEdit: boolean };
const QUEUES: { key: Queue; label: string }[] = [
  { key: "active", label: "Active leads" }, { key: "unreviewed", label: "Needs review" },
  { key: "overdue", label: "Overdue" }, { key: "missing_next_step", label: "Missing next step" },
  { key: "unassigned", label: "Unassigned" }, { key: "nurture", label: "Nurture" },
  { key: "disqualified", label: "Not a fit" }, { key: "all", label: "All contacts" },
];
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const nameOf = (lead: Lead) => [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email || "Unnamed contact";
const dateOf = (value: string | null) => value ? new Date(value).toLocaleDateString() : "Not set";

export default function LeadsPage() {
  const [queue, setQueue] = useState<Queue>("active");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);
  const params = new URLSearchParams({ queue, q: query, owner, page: String(page) });
  const { data, loading, error, refetch } = useApi<LeadResponse>(`/api/leads?${params}`);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    const form = new FormData(event.currentTarget);
    const followUp = String(form.get("nextFollowUpAt") || "");
    setSaving(true);
    try {
      await apiPatch(`/api/leads/${selected.id}`, {
        expectedUpdatedAt: selected.updatedAt, leadStatus: form.get("leadStatus"),
        ownerUserId: form.get("ownerUserId") || null,
        leadNextAction: String(form.get("leadNextAction") || "").trim() || null,
        nextFollowUpAt: followUp ? dateInputToIso(followUp) : null,
        reviewNote: form.get("reviewNote"), createTask: form.get("createTask") === "on",
      });
      toast.success("Lead review saved. Contact history updated.");
      setSelected(null); await refetch();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save lead"); }
    finally { setSaving(false); }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Lead tracking</h1><p className="text-muted-foreground">Turn relationships into clear, owned next steps.</p></div>
      <Button asChild variant="outline"><Link href="/pipeline">View sales pipeline</Link></Button>
    </div>
    <div className="rounded-lg border bg-muted/30 p-4 text-sm">
      Imported contacts start in <strong>Needs review</strong>, not Active leads. Qualifying a lead does not change their lifecycle stage or marketing consent.
      Active leads require an owner, next action, and follow-up date. No messages are sent from this page.
    </div>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); setQuery(search); setPage(1); }}>
      <div className="min-w-52 flex-1"><Label htmlFor="lead-search">Find a contact</Label><Input id="lead-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, email, organization, or source" /></div>
      <div><Label htmlFor="owner-filter">Owner</Label><select id="owner-filter" className={selectClass} value={owner} onChange={e => { setOwner(e.target.value); setPage(1); }}>
        <option value="">All owners</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option>
        {data?.users.map(user => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}
      </select></div><Button type="submit">Search</Button>
    </form>
    <div className="flex flex-wrap gap-2" aria-label="Lead queues">
      {QUEUES.map(item => <Button key={item.key} variant={queue === item.key ? "default" : "outline"} aria-pressed={queue === item.key} onClick={() => { setQueue(item.key); setPage(1); }}>
        {item.label} {data && !loading && <span className="ml-2 opacity-80">{data.counts[item.key]}</span>}
      </Button>)}
    </div>
    {error ? <div role="alert" className="rounded-lg border border-destructive p-4">Could not load leads: {error} <Button variant="outline" onClick={refetch}>Retry</Button></div>
      : loading ? <p role="status">Loading leads…</p>
      : !data?.contacts.length ? <div className="rounded-lg border p-8 text-center"><h2 className="font-semibold">No contacts in this queue</h2><p className="mt-2 text-sm text-muted-foreground">Review existing contacts to decide which relationships need an active next step.</p><Button className="mt-4" variant="outline" onClick={() => { setQueue("unreviewed"); setQuery(""); setSearch(""); setOwner(""); setPage(1); }}>Review contacts</Button></div>
      : <div className="space-y-3">{data.contacts.map(lead => <article key={lead.id} className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><Link href={`/contacts/${lead.id}`} className="font-semibold text-primary hover:underline">{nameOf(lead)}</Link><p className="text-sm text-muted-foreground">{lead.organization?.name || lead.email || lead.phone || "Contact details needed"}</p></div>
          <div className="flex items-center gap-2"><Badge variant="secondary">{LEAD_LABELS[lead.leadStatus] || lead.leadStatus}</Badge>{data.canEdit && <Button variant="outline" size="sm" onClick={() => setSelected(lead)}>Review lead</Button>}</div>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-muted-foreground">Owner</dt><dd>{lead.owner?.name || lead.owner?.email || "Unassigned"}</dd></div>
          <div><dt className="text-muted-foreground">Next follow-up</dt><dd>{dateOf(lead.nextFollowUpAt)}</dd></div>
          <div><dt className="text-muted-foreground">Last contact</dt><dd>{dateOf(lead.lastTouchAt)}</dd></div>
          <div><dt className="text-muted-foreground">Lifecycle / source</dt><dd>{lead.lifecycleStage} · {lead.source || "Source unknown"}</dd></div>
        </dl>
        <p className="mt-3 text-sm"><strong>Next action:</strong> {lead.leadNextAction || "Not set"}</p>
        {lead.tasks[0] && <p className="mt-1 text-sm text-muted-foreground">Open task: {lead.tasks[0].title} · {dateOf(lead.tasks[0].dueAt)}</p>}
        <p className="mt-2 text-xs text-muted-foreground">Reviewed: {dateOf(lead.leadReviewedAt)} · {lead._count.opportunities} opportunities</p>
      </article>)}</div>}
    {data && !error && <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{data.total} contacts · Page {page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</p><div className="flex gap-2"><Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" disabled={page * data.pageSize >= data.total || loading} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !saving) setSelected(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Review {selected ? nameOf(selected) : "lead"}</DialogTitle><DialogDescription>Record the evidence and next step. This adds an internal note, not a contact event.</DialogDescription></DialogHeader>
        {selected && <form key={selected.id} onSubmit={save} className="space-y-4">
          <div><Label htmlFor="lead-status">Lead status</Label><select id="lead-status" name="leadStatus" className={selectClass} defaultValue={selected.leadStatus}>{LEAD_STATUSES.map(status => <option key={status} value={status}>{LEAD_LABELS[status]}</option>)}</select></div>
          <div><Label htmlFor="lead-owner">Relationship owner</Label><select id="lead-owner" name="ownerUserId" className={selectClass} defaultValue={selected.ownerUserId || ""}><option value="">Unassigned</option>{data?.users.map(user => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}</select></div>
          <div><Label htmlFor="lead-action">Next action</Label><Input id="lead-action" name="leadNextAction" maxLength={200} defaultValue={selected.leadNextAction || ""} placeholder="e.g. Confirm the meeting outcome with Shria" /></div>
          <div><Label htmlFor="lead-follow-up">Next follow-up date</Label><Input id="lead-follow-up" name="nextFollowUpAt" type="date" defaultValue={isoToDateInput(selected.nextFollowUpAt)} /></div>
          <div><Label htmlFor="lead-evidence">Evidence / reason for this review</Label><Textarea id="lead-evidence" name="reviewNote" required minLength={5} maxLength={2000} placeholder="What is confirmed? Include a source/date and distinguish any assumptions." /></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="createTask" className="mt-1" />Create or update the lead follow-up task with this owner, action, and date. Other tasks are unchanged.</label>
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setSelected(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save lead review"}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  </div>;
}
