"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, ArrowRight, Check, AlertTriangle } from "lucide-react";

const CRM_FIELDS = [
  { value: "skip", label: "-- Skip --" },
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "persona", label: "Persona" },
  { value: "lifecycleStage", label: "Lifecycle Stage" },
  { value: "source", label: "Source" },
  { value: "tags", label: "Tags (comma-separated)" },
];

type Step = "upload" | "map" | "execute" | "done";

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [jobId, setJobId] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [preview, setPreview] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    setLoading(true);
    try {
      // Step 1: Create import job
      const createRes = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      const createData = await createRes.json();
      if (!createData.ok) throw new Error(createData.error);
      const jid = createData.job.id;
      setJobId(jid);

      // Step 2: Upload CSV
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch(`/api/imports/${jid}/upload`, {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.ok) throw new Error(uploadData.error);

      setColumns(uploadData.columns);
      setPreview(uploadData.preview || []);

      // Auto-map columns
      const autoMap: Record<string, string> = {};
      uploadData.columns.forEach((col: string) => {
        const lower = col.toLowerCase().replace(/[_\s-]+/g, "");
        if (lower.includes("first") && lower.includes("name")) autoMap[col] = "firstName";
        else if (lower.includes("last") && lower.includes("name")) autoMap[col] = "lastName";
        else if (lower.includes("email")) autoMap[col] = "email";
        else if (lower.includes("phone")) autoMap[col] = "phone";
        else if (lower.includes("persona")) autoMap[col] = "persona";
        else if (lower.includes("stage") || lower.includes("lifecycle")) autoMap[col] = "lifecycleStage";
        else if (lower.includes("source")) autoMap[col] = "source";
        else if (lower.includes("tag")) autoMap[col] = "tags";
        else autoMap[col] = "skip";
      });
      setMapping(autoMap);
      setStep("map");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      // Save mapping
      const mapRes = await fetch(`/api/imports/${jobId}/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping }),
      });
      const mapData = await mapRes.json();
      if (!mapData.ok) throw new Error(mapData.error);

      // Execute import
      const execRes = await fetch(`/api/imports/${jobId}/execute`, {
        method: "POST",
      });
      const execData = await execRes.json();
      if (!execData.ok) throw new Error(execData.error);

      setResult(execData);
      setStep("done");
      toast.success("Import completed!");
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
      handleFileUpload(file);
    } else {
      toast.error("Please upload a CSV file");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import Contacts</h1>
        <p className="text-muted-foreground">
          Upload a CSV file to bulk-import contacts into the CRM
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {["Upload", "Map Columns", "Execute", "Done"].map((label, idx) => {
          const steps: Step[] = ["upload", "map", "execute", "done"];
          const isActive = steps.indexOf(step) >= idx;
          return (
            <div key={label} className="flex items-center gap-2">
              {idx > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
              <Badge variant={isActive ? "default" : "secondary"}>{label}</Badge>
            </div>
          );
        })}
      </div>

      {/* Upload Step */}
      {step === "upload" && (
        <Card>
          <CardContent className="pt-6">
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">
                {loading ? "Processing..." : "Drop CSV file here or click to browse"}
              </p>
              <p className="text-sm text-muted-foreground">
                Supports .csv files with headers in the first row
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Map Step */}
      {step === "map" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Column Mapping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {columns.map((col) => (
                <div key={col} className="flex items-center gap-4">
                  <div className="w-48 text-sm font-medium flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    {col}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={mapping[col] || "skip"}
                    onValueChange={(val) =>
                      setMapping((prev) => ({ ...prev, [col]: val }))
                    }
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CRM_FIELDS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>

          {preview.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preview (first 3 rows)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        {columns.map((col) => (
                          <th key={col} className="p-2 text-left font-medium">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-b">
                          {row.map((cell, j) => (
                            <td key={j} className="p-2 text-muted-foreground">
                              {cell || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setStep("upload"); setJobId(null); }}>
              Back
            </Button>
            <Button onClick={handleExecute} disabled={loading}>
              {loading ? "Importing..." : "Start Import"}
            </Button>
          </div>
        </div>
      )}

      {/* Done Step */}
      {step === "done" && result && (
        <Card>
          <CardContent className="pt-6 text-center">
            <Check className="h-12 w-12 mx-auto mb-4 text-green-600" />
            <h2 className="text-lg font-semibold mb-2">Import Complete</h2>
            <div className="flex justify-center gap-6 text-sm">
              <div>
                <p className="text-2xl font-bold text-green-600">{result.created || 0}</p>
                <p className="text-muted-foreground">Created</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{result.skipped || 0}</p>
                <p className="text-muted-foreground">Skipped</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">{result.errors || 0}</p>
                <p className="text-muted-foreground">Errors</p>
              </div>
            </div>
            <Button
              className="mt-6"
              onClick={() => {
                setStep("upload");
                setJobId(null);
                setResult(null);
              }}
            >
              Import Another File
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
