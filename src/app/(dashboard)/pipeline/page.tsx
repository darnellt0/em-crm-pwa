"use client";

import { useState } from "react";
import { useApi, apiPost, apiPatch } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Plus, DollarSign, GripVertical } from "lucide-react";
import Link from "next/link";

const STAGES = [
  { key: "discovery", label: "Discovery", color: "bg-blue-500" },
  { key: "qualification", label: "Qualification", color: "bg-cyan-500" },
  { key: "proposal", label: "Proposal", color: "bg-amber-500" },
  { key: "negotiation", label: "Negotiation", color: "bg-orange-500" },
  { key: "closed_won", label: "Closed Won", color: "bg-green-500" },
  { key: "closed_lost", label: "Closed Lost", color: "bg-red-500" },
];

export default function PipelinePage() {
  const { data, loading, refetch } = useApi<any>("/api/opportunities");
  const [createOpen, setCreateOpen] = useState(false);
  const [dragItem, setDragItem] = useState<string | null>(null);

  const opportunities = data?.opportunities || [];

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await apiPost("/api/opportunities", {
        name: form.get("name"),
        contactId: form.get("contactId") || undefined,
        stage: form.get("stage") || "discovery",
        value: form.get("value") ? Number(form.get("value")) : undefined,
      });
      toast.success("Opportunity created");
      setCreateOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDrop = async (stage: string) => {
    if (!dragItem) return;
    try {
      await apiPatch(`/api/opportunities/${dragItem}`, { stage });
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
    setDragItem(null);
  };

  const formatCurrency = (val: number | null) => {
    if (!val) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-muted-foreground">{opportunities.length} opportunities</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Opportunity
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Opportunity</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
              <div>
                <Label htmlFor="value">Value ($)</Label>
                <Input id="value" name="value" type="number" step="0.01" />
              </div>
              <div>
                <Label htmlFor="stage">Stage</Label>
                <select
                  id="stage"
                  name="stage"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  defaultValue="discovery"
                >
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
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

      {loading ? (
        <div className="grid grid-cols-6 gap-4">
          {STAGES.map((s) => (
            <div key={s.key} className="h-64 animate-pulse bg-muted rounded" />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const stageOpps = opportunities.filter(
              (o: any) => o.stage === stage.key
            );
            const total = stageOpps.reduce(
              (sum: number, o: any) => sum + (o.value || 0),
              0
            );

            return (
              <div
                key={stage.key}
                className="flex-shrink-0 w-64"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("ring-2", "ring-primary/30");
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove("ring-2", "ring-primary/30");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("ring-2", "ring-primary/30");
                  handleDrop(stage.key);
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-2 w-2 rounded-full ${stage.color}`} />
                  <h3 className="text-sm font-semibold">{stage.label}</h3>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {stageOpps.length}
                  </Badge>
                </div>
                {total > 0 && (
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {formatCurrency(total)}
                  </p>
                )}
                <div className="space-y-2 min-h-[200px] rounded-lg bg-muted/30 p-2">
                  {stageOpps.map((opp: any) => (
                    <Card
                      key={opp.id}
                      draggable
                      onDragStart={() => setDragItem(opp.id)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{opp.name}</p>
                            {opp.value && (
                              <p className="text-xs text-muted-foreground">
                                {formatCurrency(opp.value)}
                              </p>
                            )}
                            {opp.contact && (
                              <Link
                                href={`/contacts/${opp.contact.id}`}
                                className="text-xs text-primary hover:underline"
                              >
                                {[opp.contact.firstName, opp.contact.lastName]
                                  .filter(Boolean)
                                  .join(" ")}
                              </Link>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
