"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bot, Check, Clock3, Inbox, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useApi, apiPost } from "@/hooks/useApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type AgentAction = {
  id: string;
  actionType: string;
  status: string;
  summary: string;
  rationale: string;
  payload: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  expiresAt: string;
  reviewedAt: string | null;
  executedAt: string | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
  reviewer: { name: string | null; email: string } | null;
};

const roleLevel: Record<string, number> = {
  read_only: 10,
  staff: 20,
  partner_admin: 30,
  admin: 40,
};

const statusClasses: Record<string, string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-800",
  executed: "border-green-300 bg-green-50 text-green-800",
  rejected: "border-gray-300 bg-gray-50 text-gray-700",
  failed: "border-red-300 bg-red-50 text-red-800",
  expired: "border-gray-300 bg-gray-50 text-gray-600",
};

const PAYLOAD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  priority: "Priority",
  dueAt: "Due",
  type: "Type",
  summary: "Summary",
  outcome: "Outcome",
  occurredAt: "Occurred",
  nextFollowUpAt: "Follow-up",
  lifecycleStage: "Stage",
  tags: "Tags",
};

// Every payload field the reviewer is approving must be visible on the card.
function payloadDetails(payload: unknown): Array<[string, string]> {
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload as Record<string, unknown>)
    .filter(
      ([key, value]) =>
        key !== "actionType" && key !== "contactId" && value !== null && value !== undefined && value !== ""
    )
    .map(([key, value]) => {
      let text: string;
      if (Array.isArray(value)) text = value.join(", ");
      else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value))
        text = new Date(value).toLocaleString();
      else text = String(value);
      return [PAYLOAD_LABELS[key] || key, text];
    });
}

function actionLabel(actionType: string) {
  return actionType.replaceAll("_", " ");
}

function contactName(contact: AgentAction["contact"]) {
  if (!contact) return null;
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email || "Contact";
}

export default function AgentActionsPage() {
  const { data: session } = useSession();
  const [status, setStatus] = useState("pending");
  const [selection, setSelection] = useState<{
    action: AgentAction;
    decision: "approve" | "reject";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { data, loading, error, refetch } = useApi<{ ok: true; actions: AgentAction[] }>(
    `/api/agent-actions?status=${status}`
  );

  const role = (session?.user as { role?: string } | undefined)?.role || "read_only";
  const canReview = (roleLevel[role] || 0) >= roleLevel.partner_admin;
  const actions = data?.actions || [];

  const submitDecision = async () => {
    if (!selection) return;
    if (selection.decision === "reject" && reason.trim().length < 2) {
      toast.error("Enter a reason for rejecting this proposal");
      return;
    }

    setSubmitting(true);
    try {
      await apiPost(`/api/agent-actions/${selection.action.id}/decision`, {
        decision: selection.decision,
        ...(selection.decision === "reject" ? { reason: reason.trim() } : {}),
      });
      toast.success(
        selection.decision === "approve" ? "Action approved and applied" : "Action rejected"
      );
      setSelection(null);
      setReason("");
      refetch();
    } catch (decisionError) {
      toast.error(decisionError instanceof Error ? decisionError.message : "Decision failed");
      refetch();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bot className="h-6 w-6" />
            Agent Approvals
          </h1>
          <p className="text-muted-foreground">
            Review changes proposed by Nia before they are applied to the CRM
          </p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]" aria-label="Filter proposals by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="executed">Executed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="all">All activity</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!canReview && (
        <div className="flex items-center gap-2 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Partner administrators can approve or reject agent proposals.
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : actions.length === 0 ? (
        <div className="border bg-muted/20 py-12 text-center text-muted-foreground">
          <Inbox className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p className="font-medium">No {status === "all" ? "agent activity" : status + " proposals"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {actions.map((action) => (
            <Card key={action.id} className={action.status === "pending" ? "border-amber-200" : ""}>
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                  <div className="min-w-0 w-full flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {actionLabel(action.actionType)}
                      </Badge>
                      <Badge variant="outline" className={statusClasses[action.status] || ""}>
                        {action.status}
                      </Badge>
                      {action.contact && (
                        <Link
                          href={`/contacts/${action.contact.id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          {contactName(action.contact)}
                        </Link>
                      )}
                    </div>
                    <p className="text-sm font-semibold">{action.summary}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{action.rationale}</p>
                    {payloadDetails(action.payload).length > 0 && (
                      <dl className="mt-2 space-y-0.5 text-sm">
                        {payloadDetails(action.payload).map(([label, value]) => (
                          <div key={label} className="flex gap-2">
                            <dt className="shrink-0 font-medium text-muted-foreground">{label}:</dt>
                            <dd className="min-w-0 break-words">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                  {canReview && action.status === "pending" && (
                    <div className="flex w-full shrink-0 justify-end gap-2 sm:w-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelection({ action, decision: "reject" })}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setSelection({ action, decision: "approve" })}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Approve
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5" />
                    Proposed {new Date(action.createdAt).toLocaleString()}
                  </span>
                  {action.status === "pending" && (
                    <span>Expires {new Date(action.expiresAt).toLocaleString()}</span>
                  )}
                  {action.reviewer && (
                    <span>Reviewed by {action.reviewer.name || action.reviewer.email}</span>
                  )}
                  {action.error && action.status !== "rejected" && (
                    <span className="text-destructive">{action.error}</span>
                  )}
                  {action.error && action.status === "rejected" && <span>Reason: {action.error}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(selection)}
        onOpenChange={(open) => {
          if (!open && !submitting) {
            setSelection(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selection?.decision === "approve" ? "Approve and apply action?" : "Reject proposal?"}
            </DialogTitle>
          </DialogHeader>
          {selection && (
            <div className="space-y-4">
              <div className="border-l-4 border-primary bg-muted/40 px-4 py-3">
                <p className="text-sm font-semibold">{selection.action.summary}</p>
                <p className="mt-1 text-sm text-muted-foreground">{selection.action.rationale}</p>
                {payloadDetails(selection.action.payload).length > 0 && (
                  <dl className="mt-2 space-y-0.5 text-sm">
                    {payloadDetails(selection.action.payload).map(([label, value]) => (
                      <div key={label} className="flex gap-2">
                        <dt className="shrink-0 font-medium text-muted-foreground">{label}:</dt>
                        <dd className="min-w-0 break-words">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              {selection.decision === "approve" ? (
                <p className="text-sm text-muted-foreground">
                  Approval applies this change immediately and records you as the reviewer.
                </p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="rejection-reason">Reason</Label>
                  <Textarea
                    id="rejection-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={500}
                    placeholder="Why should Nia not make this change?"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelection(null);
                setReason("");
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant={selection?.decision === "reject" ? "destructive" : "default"}
              onClick={submitDecision}
              disabled={submitting}
            >
              {submitting
                ? "Working..."
                : selection?.decision === "approve"
                  ? "Approve and apply"
                  : "Reject proposal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
