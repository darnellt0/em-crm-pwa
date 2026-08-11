"use client";

import { useState } from "react";
import { useApi, apiPost, apiPatch } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, GraduationCap, Users } from "lucide-react";

export default function ProgramsPage() {
  const { data, loading, refetch } = useApi<any>("/api/programs");
  const [createOpen, setCreateOpen] = useState(false);

  const programs = data?.programs || [];

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await apiPost("/api/programs", {
        name: form.get("name"),
        description: form.get("description") || undefined,
      });
      toast.success("Program created");
      setCreateOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Programs</h1>
          <p className="text-muted-foreground">Manage programs and enrollments</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Program
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Program</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" />
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse bg-muted rounded" />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/20">
          <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="font-medium">No programs yet</p>
          <p className="text-sm mt-1">Create a program (e.g. &ldquo;Leadership Cohort&rdquo;) to track enrollments.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {programs.map((p: any) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {p.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {p.description}
                  </p>
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {p._count?.enrollments || 0} enrolled
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
