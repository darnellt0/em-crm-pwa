"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  Check,
  AlertTriangle,
  RefreshCw,
  Eye,
  Play,
  ArrowLeft,
  Loader2,
} from "lucide-react";

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

type Step = "upload" | "map" | "validate" | "run" | "done";

const STEP_LABELS: { step: Step; label: string }[] = [
  { step: "upload", label: "Upload" },
  { step: "map", label: "Map Columns" },
  { step: "validate", label: "Review" },
  { step: "run", label: "Import" },
  { step: "done", label: "Done" },
];

interface ValidationSummary {
  total: number;
  willCreate: number;
  willUpdate: number;
  willSkip: number;
}

interface RowPreview {
  rowIndex: number;
  action: "create" | "update" | "skip";
  matchType: string | null;
  matchedContactName: string | null;
  normalized: Record<string, any>;
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [jobId, setJobId] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<ValidationSummary | null>(null);
  const [rowPreviews, setRowPreviews] = useState<RowPreview[]>([]);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 1: Upload CSV
  const handleFileUpload = async (file: File) => {
    setLoading(true);
    try {
      // Create import job
      const createRes = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      const createData = await createRes.json();
      if (!createData.ok) throw new Error(createData.error);
      const jid = createData.job.id;
      setJobId(jid);

      // Upload CSV file
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch(`/api/imports/${jid}/upload`, {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.ok) throw new Error(uploadData.error);

      setColumns(uploadData.headers || []);
      setPreview(uploadData.preview || []);

      // Auto-map columns
      const autoMap: Record<string, string> = {};
      (uploadData.headers || []).forEach((col: string) => {
        const lower = col.toLowerCase().replace(/[_\s-]+/g, "");
        if (lower.includes("first") && lower.includes("name")) autoMap[col] = "firstName";
        else if (lower.includes("last") && lower.includes("name")) autoMap[col] = "lastName";
        else if (lower.includes("email")) autoMap[col] = "email";
        else if (lower.includes("phone") || lower.includes("mobile")) autoMap[col] = "phone";
        else if (lower.includes("persona") || lower.includes("type")) autoMap[col] = "persona";
        else if (lower.includes("stage") || lower.includes("lifecycle")) autoMap[col] = "lifecycleStage";
        else if (lower.includes("source") || lower.includes("origin")) autoMap[col] = "source";
        else if (lower.includes("tag")) autoMap[col] = "tags";
        else autoMap[col] = "skip";
      });
      setMapping(autoMap);
      setStep("map");
      toast.success(`Parsed ${uploadData.rowCount} rows from "${file.name}"`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Save mapping and validate (dedupe preview)
  const handleValidate = async () => {
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

      // Validate (dedupe preview)
      const valRes = await fetch(`/api/imports/${jobId}/validate`, {
        method: "POST",
      });
      const valData = await valRes.json();
      if (!valData.ok) throw new Error(valData.error);

      setValidation(valData.summary);
      setRowPreviews(valData.rows || []);
      setStep("validate");
    } catch (err: any) {
      toast.error(err.message || "Validation failed");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Execute the import
  const handleRun = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const execRes = await fetch(`/api/imports/${jobId}/run`, {
        method: "POST",
      });
      const execData = await execRes.json();
      if (!execData.ok) throw new Error(execData.error);

      setResult(execData.stats);
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

  const resetWizard = () => {
    setStep("upload");
    setJobId(null);
    setColumns([]);
    setPreview([]);
    setMapping({});
    setValidation(null);
    setRowPreviews([]);
    setResult(null);
  };

  const currentStepIndex = STEP_LABELS.findIndex((s) => s.step === step);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import Contacts</h1>
        <p className="text-muted-foreground">
          Upload a CSV file to bulk-import contacts with deduplication
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 text-sm">
        {STEP_LABELS.map(({ step: s, label }, idx) => {
          const isActive = currentStepIndex >= idx;
          const isCurrent = currentStepIndex === idx;
          return (
            <div key={s} className="flex items-center gap-1">
              {idx > 0 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground mx-1" />
              )}
              <Badge
                variant={isCurrent ? "default" : isActive ? "secondary" : "outline"}
                className={isCurrent ? "" : isActive ? "bg-primary/10 text-primary" : ""}
              >
                {idx + 1}. {label}
              </Badge>
            </div>
          );
        })}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <Card>
          <CardContent className="pt-6">
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              {loading ? (
                <Loader2 className="h-12 w-12 mx-auto mb-4 text-primary animate-spin" />
              ) : (
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              )}
              <p className="text-lg font-medium mb-1">
                {loading ? "Processing CSV..." : "Drop CSV file here or click to browse"}
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

      {/* Step 2: Map Columns */}
      {step === "map" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Column Mapping</CardTitle>
              <CardDescription>
                Map each CSV column to a CRM field. Columns mapped to &quot;Skip&quot; will be ignored.
              </CardDescription>
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
                <CardTitle className="text-base">Data Preview (first 5 rows)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        {columns.map((col) => (
                          <th key={col} className="p-2 text-left font-medium text-xs">
                            <div>{col}</div>
                            <div className="text-muted-foreground font-normal">
                              → {mapping[col] === "skip" ? "Skip" : mapping[col] || "Skip"}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b">
                          {columns.map((col) => (
                            <td
                              key={col}
                              className={`p-2 text-xs ${
                                mapping[col] === "skip"
                                  ? "text-muted-foreground/40 line-through"
                                  : "text-foreground"
                              }`}
                            >
                              {row[col] || "—"}
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
            <Button variant="outline" onClick={resetWizard}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Start Over
            </Button>
            <Button onClick={handleValidate} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Validate &amp; Preview
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Validate / Dedupe Preview */}
      {step === "validate" && validation && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deduplication Preview</CardTitle>
              <CardDescription>
                Review what will happen when you run the import. Existing contacts
                matched by email or phone will be updated instead of duplicated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{validation.total}</p>
                  <p className="text-sm text-muted-foreground">Total Rows</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-2xl font-bold text-green-700">{validation.willCreate}</p>
                  <p className="text-sm text-green-600">Will Create</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-2xl font-bold text-blue-700">{validation.willUpdate}</p>
                  <p className="text-sm text-blue-600">Will Update</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-2xl font-bold text-amber-700">{validation.willSkip}</p>
                  <p className="text-sm text-amber-600">Will Skip</p>
                </div>
              </div>

              {/* Row-level preview table */}
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="p-2 text-left font-medium w-16">Row</th>
                      <th className="p-2 text-left font-medium w-24">Action</th>
                      <th className="p-2 text-left font-medium">Name</th>
                      <th className="p-2 text-left font-medium">Email</th>
                      <th className="p-2 text-left font-medium hidden md:table-cell">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowPreviews.map((row) => (
                      <tr key={row.rowIndex} className="border-b">
                        <td className="p-2 text-muted-foreground">{row.rowIndex + 1}</td>
                        <td className="p-2">
                          <Badge
                            variant={
                              row.action === "create"
                                ? "default"
                                : row.action === "update"
                                ? "secondary"
                                : "outline"
                            }
                            className={
                              row.action === "create"
                                ? "bg-green-100 text-green-800"
                                : row.action === "update"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-amber-100 text-amber-800"
                            }
                          >
                            {row.action}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {[row.normalized.firstName, row.normalized.lastName]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {row.normalized.email || "—"}
                        </td>
                        <td className="p-2 text-muted-foreground hidden md:table-cell">
                          {row.matchType ? (
                            <span>
                              Matched by {row.matchType}
                              {row.matchedContactName && (
                                <> → {row.matchedContactName}</>
                              )}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("map")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Mapping
            </Button>
            <Button onClick={handleRun} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Import ({validation.willCreate} new, {validation.willUpdate} updates)
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && result && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <Check className="h-14 w-14 mx-auto mb-4 text-green-600" />
            <h2 className="text-xl font-semibold mb-4">Import Complete</h2>
            <div className="flex justify-center gap-8 text-sm mb-6">
              <div>
                <p className="text-3xl font-bold text-green-600">{result.created || 0}</p>
                <p className="text-muted-foreground">Created</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-blue-600">{result.updated || 0}</p>
                <p className="text-muted-foreground">Updated</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-amber-600">{result.skipped || 0}</p>
                <p className="text-muted-foreground">Skipped</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-destructive">{result.errored || 0}</p>
                <p className="text-muted-foreground">Errors</p>
              </div>
            </div>
            {result.errored > 0 && (
              <p className="text-sm text-muted-foreground mb-4">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Some rows had errors. Check the import job details for specifics.
              </p>
            )}
            <div className="flex justify-center gap-3">
              <Button onClick={resetWizard}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Import Another File
              </Button>
              <Button variant="outline" asChild>
                <a href="/contacts">View Contacts</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
