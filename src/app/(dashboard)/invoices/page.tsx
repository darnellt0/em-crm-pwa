"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApi, apiPost, apiPatch } from "@/hooks/useApi";
import { ContactPicker } from "@/components/crm/ContactPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Pencil, History, Receipt } from "lucide-react";

const STATUSES = ["draft", "sent", "paid", "void"] as const;

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  void: "bg-red-100 text-red-800",
};

function contactName(contact: any) {
  return (
    [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ||
    contact?.email ||
    "Unknown contact"
  );
}

function formatAmount(amount: string | number) {
  const value = Number(amount);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(value) ? value : 0
  );
}

function toDateInput(value?: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export default function InvoicesPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  // Invoice create/edit requires the staff role server-side; hide the
  // controls from read_only users instead of letting them hit 403s.
  const canEdit = role !== "read_only";
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<any | null>(null);
  const [historyInvoice, setHistoryInvoice] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  const { data, loading, refetch } = useApi<any>(`/api/invoices?${params.toString()}`);
  const invoices = data?.invoices || [];

  const { data: historyData } = useApi<any>(
    historyInvoice ? `/api/invoices/${historyInvoice.id}/history` : null
  );
  const revisions = historyData?.revisions || [];

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await apiPost("/api/invoices", {
        contactId: form.get("contactId"),
        amount: Number(form.get("amount")),
        status: form.get("status") || "draft",
        issueDate: new Date(form.get("issueDate") as string).toISOString(),
        dueDate: new Date(form.get("dueDate") as string).toISOString(),
        notes: form.get("notes") || undefined,
      });
      toast.success("Invoice created");
      setCreateOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editInvoice) return;
    const form = new FormData(e.currentTarget);
    try {
      await apiPatch(`/api/invoices/${editInvoice.id}/edit`, {
        amount: Number(form.get("amount")),
        status: form.get("status"),
        issueDate: new Date(form.get("issueDate") as string).toISOString(),
        dueDate: new Date(form.get("dueDate") as string).toISOString(),
        notes: form.get("notes") || null,
        changeNote: form.get("changeNote") || undefined,
      });
      toast.success("Invoice updated");
      setEditInvoice(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const today = new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-muted-foreground">{invoices.length} invoices</p>
        </div>
        {canEdit && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Invoice
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="inv-contactId">Contact</Label>
                {createOpen && <ContactPicker id="inv-contactId" required />}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="inv-amount">Amount ($)</Label>
                  <Input id="inv-amount" name="amount" type="number" step="0.01" min="0.01" required />
                </div>
                <div>
                  <Label htmlFor="inv-status">Status</Label>
                  <select
                    id="inv-status"
                    name="status"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    defaultValue="draft"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="inv-issueDate">Issue date</Label>
                  <Input
                    id="inv-issueDate"
                    name="issueDate"
                    type="date"
                    required
                    defaultValue={toDateInput(today.toISOString())}
                  />
                </div>
                <div>
                  <Label htmlFor="inv-dueDate">Due date</Label>
                  <Input id="inv-dueDate" name="dueDate" type="date" required />
                </div>
              </div>
              <div>
                <Label htmlFor="inv-notes">Notes</Label>
                <Textarea id="inv-notes" name="notes" />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit">Create</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant={statusFilter === "" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("")}
        >
          All
        </Button>
        {STATUSES.map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse bg-muted rounded-lg" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No invoices{statusFilter ? ` with status "${statusFilter}"` : ""} yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv: any) => {
            const overdue =
              inv.status !== "paid" && inv.status !== "void" && new Date(inv.dueDate) < today;
            return (
              <Card key={inv.id}>
                <CardContent className="py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatAmount(inv.amount)}</span>
                      <Badge className={statusColors[inv.status] || statusColors.draft}>
                        {inv.status}
                      </Badge>
                      {overdue && <Badge className="bg-red-100 text-red-800">overdue</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      <Link href={`/contacts/${inv.contact?.id}`} className="hover:underline">
                        {contactName(inv.contact)}
                      </Link>
                      {" · issued "}
                      {new Date(inv.issueDate).toLocaleDateString()}
                      {" · due "}
                      {new Date(inv.dueDate).toLocaleDateString()}
                    </p>
                    {inv.notes && (
                      <p className="text-sm text-muted-foreground truncate mt-1">{inv.notes}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setHistoryInvoice(inv)}
                    title="View history"
                  >
                    <History className="h-4 w-4" />
                  </Button>
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={inv.status === "paid"}
                      title={inv.status === "paid" ? "Paid invoices cannot be edited" : "Edit invoice"}
                      onClick={() => setEditInvoice(inv)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editInvoice} onOpenChange={(open) => !open && setEditInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Invoice</DialogTitle>
          </DialogHeader>
          {editInvoice && (
            <form onSubmit={handleEdit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {contactName(editInvoice.contact)} — every change is recorded in the invoice history.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-inv-amount">Amount ($)</Label>
                  <Input
                    id="edit-inv-amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    defaultValue={Number(editInvoice.amount)}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-inv-status">Status</Label>
                  <select
                    id="edit-inv-status"
                    name="status"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    defaultValue={editInvoice.status}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-inv-issueDate">Issue date</Label>
                  <Input
                    id="edit-inv-issueDate"
                    name="issueDate"
                    type="date"
                    required
                    defaultValue={toDateInput(editInvoice.issueDate)}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-inv-dueDate">Due date</Label>
                  <Input
                    id="edit-inv-dueDate"
                    name="dueDate"
                    type="date"
                    required
                    defaultValue={toDateInput(editInvoice.dueDate)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-inv-notes">Notes</Label>
                <Textarea id="edit-inv-notes" name="notes" defaultValue={editInvoice.notes || ""} />
              </div>
              <div>
                <Label htmlFor="edit-inv-changeNote">Reason for change (kept in history)</Label>
                <Input id="edit-inv-changeNote" name="changeNote" placeholder="e.g. Corrected amount" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditInvoice(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyInvoice} onOpenChange={(open) => !open && setHistoryInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invoice History</DialogTitle>
          </DialogHeader>
          {historyInvoice && (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              <div className="text-sm">
                <span className="font-semibold">{formatAmount(historyInvoice.amount)}</span>{" "}
                <Badge className={statusColors[historyInvoice.status] || statusColors.draft}>
                  {historyInvoice.status}
                </Badge>{" "}
                <span className="text-muted-foreground">
                  (current, v{historyInvoice.version})
                </span>
              </div>
              {revisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No earlier versions.</p>
              ) : (
                revisions.map((rev: any) => (
                  <div key={rev.id} className="rounded-md border p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">v{rev.version}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(rev.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p>
                      {formatAmount(rev.snapshot?.amount)} · {rev.snapshot?.status} · due{" "}
                      {rev.snapshot?.dueDate
                        ? new Date(rev.snapshot.dueDate).toLocaleDateString()
                        : "—"}
                    </p>
                    {rev.changeNote && (
                      <p className="text-muted-foreground">Note: {rev.changeNote}</p>
                    )}
                    {rev.changedBy && (
                      <p className="text-muted-foreground text-xs">Changed by {rev.changedBy}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
