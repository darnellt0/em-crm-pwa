"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi, apiPost } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Brain,
  Check,
  X,
  Pin,
  Inbox,
} from "lucide-react";

export default function MemoryInboxPage() {
  const { data, loading, refetch } = useApi<any>("/api/memory/queue");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectReason, setRejectReason] = useState("");

  const items = data?.items || [];

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i: any) => i.id)));
    }
  };

  const handleBulkAction = async (action: string, extra: any = {}) => {
    if (selected.size === 0) {
      toast.error("Select items first");
      return;
    }
    try {
      await apiPost("/api/memory/bulk", {
        ids: Array.from(selected),
        action,
        ...extra,
      });
      toast.success(`${action} completed for ${selected.size} items`);
      setSelected(new Set());
      setRejectReason("");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSingleAction = async (id: string, action: string, extra: any = {}) => {
    try {
      await apiPost("/api/memory/bulk", {
        ids: [id],
        action,
        ...extra,
      });
      toast.success(`Memory ${action}d`);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6" />
          Memory Inbox
        </h1>
        <p className="text-muted-foreground">
          Review AI-proposed memory items before they become part of the knowledge base
        </p>
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3 px-4 flex-wrap">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction("approve")}
              className="text-green-700 border-green-300 hover:bg-green-50"
            >
              <Check className="h-3 w-3 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction("approve_and_pin")}
              className="text-primary border-primary/30 hover:bg-primary/5"
            >
              <Pin className="h-3 w-3 mr-1" />
              Approve + Pin
            </Button>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Rejection reason..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="h-9 w-48"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkAction("reject", { reason: rejectReason || undefined })}
                className="text-destructive border-destructive/30 hover:bg-destructive/5"
              >
                <X className="h-3 w-3 mr-1" />
                Reject
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

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse bg-muted rounded" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Inbox className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Inbox is empty</p>
          <p className="text-sm">
            AI-proposed memories will appear here when you log interactions with contacts
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              checked={items.length > 0 && selected.size === items.length}
              onCheckedChange={toggleAll}
            />
            <span className="text-sm text-muted-foreground">
              {items.length} pending {items.length === 1 ? "item" : "items"}
            </span>
          </div>

          {items.map((item: any) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-start gap-3 py-4">
                <Checkbox
                  checked={selected.has(item.id)}
                  onCheckedChange={() => toggleSelect(item.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">
                      {item.memoryType || "insight"}
                    </Badge>
                    {item.contact && (
                      <Link
                        href={`/contacts/${item.contact.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        {[item.contact.firstName, item.contact.lastName]
                          .filter(Boolean)
                          .join(" ")}
                      </Link>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm">{item.content}</p>
                  {item.confidence && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Confidence: {(item.confidence * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                    onClick={() => handleSingleAction(item.id, "approve")}
                    title="Approve"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-primary hover:bg-primary/5"
                    onClick={() => handleSingleAction(item.id, "approve_and_pin")}
                    title="Approve + Pin"
                  >
                    <Pin className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/5"
                    onClick={() => handleSingleAction(item.id, "reject")}
                    title="Reject"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
