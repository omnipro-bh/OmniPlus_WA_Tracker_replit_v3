import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AI_SHEET_TAB_SCHEMA, matchSheetHeaders } from "@shared/ai-defaults";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Save, Plus, X, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Types (mirror server/routes.ts) ────────────────────────────────────────

interface AiSheetsConfig {
  spreadsheetId?: string;
  tabs?: string[];
  columns?: Record<string, Record<string, string>>;
  detected?: Record<string, string[]>;
}

interface AiSheetsResponse {
  workflowId: number;
  aiNodeId: string | null;
  googleSheets: AiSheetsConfig | null;
}

interface AiSheetsRowsResponse {
  tab: string;
  rows: Record<string, any>[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Resolve the actual header for a canonical key (columns override → schema default). */
function headerFor(config: AiSheetsConfig | null | undefined, tab: string, key: string): string {
  const override = config?.columns?.[tab]?.[key];
  if (typeof override === "string" && override.trim()) return override.trim();
  const schema = AI_SHEET_TAB_SCHEMA.find((t) => t.tab === tab);
  return schema?.columns.find((c) => c.key === key)?.column ?? key;
}

function stepsTabName(config: AiSheetsConfig | null | undefined): string {
  const tabs = Array.isArray(config?.tabs) && config.tabs.length > 0
    ? config.tabs
    : AI_SHEET_TAB_SCHEMA.map((t) => t.tab);
  return tabs.find((t) => /step/i.test(t)) ?? "Workflow_Steps";
}

function optionsList(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function stepNumber(row: Record<string, any>, stepHeader: string): number {
  return Number(String(row[stepHeader] ?? "").replace(/\D/g, "")) || 0;
}

/** Map a sheet row (keyed by actual header) to canonical schema keys. */
function rowToCanonical(
  row: Record<string, any>,
  config: AiSheetsConfig | null | undefined,
  tab: string
): Record<string, any> {
  const schema = AI_SHEET_TAB_SCHEMA.find((t) => t.tab === tab);
  if (!schema) return { ...row };
  const out: Record<string, any> = {};
  for (const col of schema.columns) {
    const header = headerFor(config, tab, col.key);
    out[col.key] = row[header] ?? "";
  }
  return out;
}

interface FilterClause {
  column: string;
  slot: string;
}

/** Parse a `lookup_filter` string into column/slot clauses for the visual builder. */
function parseFilterClauses(filter: string): FilterClause[] {
  return String(filter ?? "")
    .split(/\s+AND\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      const column = eq === -1 ? part : part.slice(0, eq).trim();
      const rawValue = eq === -1 ? "" : part.slice(eq + 1).trim();
      const m = rawValue.match(/^\{(\w+)\}$/);
      return { column, slot: m ? m[1] : rawValue };
    });
}

/** Rebuild a `lookup_filter` string from column/slot clauses. */
function buildFilterString(clauses: FilterClause[]): string {
  return clauses
    .filter((c) => c.column.trim() !== "")
    .map((c) => `${c.column.trim()}={${c.slot.trim()}}`)
    .join(" AND ");
}

// ── Knowledge Tab ──────────────────────────────────────────────────────────

export function KnowledgeTab({ workflowId }: { workflowId: string }) {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<AiSheetsResponse>({
    queryKey: [`/api/ai-studio/sheets?workflowId=${workflowId}`],
    enabled: Boolean(workflowId),
  });

  const syncHeaders = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/ai-studio/sheets/sync", {
        workflowId: Number(workflowId),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/ai-studio/sheets?workflowId=${workflowId}`] });
      toast({ title: "Synced", description: "Sheet headers refreshed." });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error?.message || "Could not read the sheet headers.",
        variant: "destructive",
      });
    },
  });

  const googleSheets = data?.googleSheets ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading sheet config…
      </div>
    );
  }

  if (!googleSheets?.spreadsheetId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          This workflow's AI Agent has no Google Sheets connected. Connect a sheet in the
          workflow builder, then come back here.
        </CardContent>
      </Card>
    );
  }

  const tabs = Array.isArray(googleSheets.tabs) && googleSheets.tabs.length > 0
    ? googleSheets.tabs
    : AI_SHEET_TAB_SCHEMA.map((t) => t.tab);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected Sheet</CardTitle>
          <CardDescription className="break-all font-mono text-xs">
            {googleSheets.spreadsheetId}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncHeaders.mutate()}
            disabled={syncHeaders.isPending}
          >
            {syncHeaders.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync Headers
          </Button>
          <span className="text-xs text-muted-foreground">
            Reads each tab's header row and updates the AI node's detected columns.
          </span>
        </CardContent>
      </Card>

      {tabs.map((tab) => {
        const schema = AI_SHEET_TAB_SCHEMA.find((t) => t.tab === tab) ?? {
          tab,
          columns: [],
        };
        const detected = Array.isArray(googleSheets.detected?.[tab])
          ? googleSheets.detected![tab]
          : [];
        const match = matchSheetHeaders(detected, schema);
        const connected = detected.length > 0;

        return (
          <Card key={tab}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{tab}</CardTitle>
                {connected ? (
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                    Needs Sync
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {detected.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No headers detected yet. Click "Sync Headers".
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Expected header</TableHead>
                      <TableHead>Detected header</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schema.columns.map((col) => {
                      const actual = match.mapping[col.key];
                      return (
                        <TableRow key={col.key}>
                          <TableCell className="font-medium">{col.label}</TableCell>
                          <TableCell className="font-mono text-xs">{col.column}</TableCell>
                          <TableCell>
                            {actual ? (
                              <span className="font-mono text-xs text-green-500">{actual}</span>
                            ) : (
                              <span className="text-xs text-red-500">missing</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Scenarios Tab (editable builder) ───────────────────────────────────────

const EXPECTED_INPUTS = ["text", "list", "buttons", "datetime"];

export function ScenariosTab({ workflowId }: { workflowId: string }) {
  const { toast } = useToast();

  const { data: configData, isLoading: configLoading } = useQuery<AiSheetsResponse>({
    queryKey: [`/api/ai-studio/sheets?workflowId=${workflowId}`],
    enabled: Boolean(workflowId),
  });

  const googleSheets = configData?.googleSheets ?? null;
  const stepsTab = stepsTabName(googleSheets);
  const connected = Boolean(googleSheets?.spreadsheetId);

  const { data: rowsData, isLoading: rowsLoading } = useQuery<AiSheetsRowsResponse>({
    queryKey: [`/api/ai-studio/sheets/${encodeURIComponent(stepsTab)}/rows?workflowId=${workflowId}`],
    enabled: connected && Boolean(workflowId),
  });

  const rows = rowsData?.rows ?? [];

  const [steps, setSteps] = useState<Record<string, any>[]>([]);

  useEffect(() => {
    if (rows.length > 0) {
      const canonical = rows
        .map((r) => rowToCanonical(r, googleSheets, stepsTab))
        .sort((a, b) => stepNumber(a, "step_id") - stepNumber(b, "step_id"));
      setSteps(canonical);
    }
  }, [rows, googleSheets, stepsTab]);

  const tabs = Array.isArray(googleSheets?.tabs) && googleSheets.tabs.length > 0
    ? googleSheets.tabs
    : AI_SHEET_TAB_SCHEMA.map((t) => t.tab);
  const stepIds = steps.map((s) => String(s.step_id ?? "")).filter(Boolean);

  const updateStep = (index: number, field: string, value: any) =>
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      {
        intent_id: prev[0]?.intent_id ?? "",
        step_id: `Step_${prev.length + 1}`,
        step_type: "ask",
        ai_question: "",
        slot_name: "",
        expected_input: "text",
        options: "",
        next_step_logic: "→ done",
      },
    ]);

  const removeStep = (index: number) => setSteps((prev) => prev.filter((_, i) => i !== index));

  const saveSteps = useMutation({
    mutationFn: async () => {
      // Recompute step_id + next_step_logic linearly so the flow stays consistent.
      const normalized = steps.map((s, i) => ({
        ...s,
        step_id: `Step_${i + 1}`,
        next_step_logic: i < steps.length - 1 ? `→ Step_${i + 2}` : "→ done",
      }));
      await apiRequest("POST", `/api/ai-studio/scenarios/${workflowId}/steps`, { steps: normalized });
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Workflow steps updated in Google Sheets." });
      queryClient.invalidateQueries({
        queryKey: [`/api/ai-studio/sheets/${encodeURIComponent(stepsTab)}/rows?workflowId=${workflowId}`],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Save failed",
        description: error?.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  if (configLoading || rowsLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading scenarios…
      </div>
    );
  }

  if (!connected) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          This workflow's AI Agent has no Google Sheets connected. Connect a sheet in the
          workflow builder, then come back here.
        </CardContent>
      </Card>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No steps found in the "{stepsTab}" tab.
          </CardContent>
        </Card>
        <Button variant="outline" size="sm" onClick={addStep}>
          <Plus className="mr-2 h-4 w-4" /> Add First Step
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={addStep}>
          <Plus className="mr-2 h-4 w-4" /> Add Step
        </Button>
        <Button onClick={() => saveSteps.mutate()} disabled={saveSteps.isPending}>
          {saveSteps.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <StepEditor
            key={i}
            step={step}
            index={i}
            tabs={tabs}
            stepIds={stepIds.filter((id) => id !== String(step.step_id ?? ""))}
            onChange={updateStep}
            onRemove={removeStep}
          />
        ))}
      </div>
    </div>
  );
}

function StepEditor({
  step,
  index,
  tabs,
  stepIds,
  onChange,
  onRemove,
}: {
  step: Record<string, any>;
  index: number;
  tabs: string[];
  stepIds: string[];
  onChange: (index: number, field: string, value: any) => void;
  onRemove: (index: number) => void;
}) {
  const isLookup = String(step.step_type ?? "ask").trim().toLowerCase() === "lookup";
  const clauses = parseFilterClauses(String(step.lookup_filter ?? ""));

  const setFilter = (next: FilterClause[]) => onChange(index, "lookup_filter", buildFilterString(next));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Step {String(step.step_id ?? index + 1)}</CardTitle>
            <Select value={String(step.step_type ?? "ask")} onValueChange={(v) => onChange(index, "step_type", v)}>
              <SelectTrigger className="h-7 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ask">ask</SelectItem>
                <SelectItem value="lookup">lookup</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground"
            onClick={() => onRemove(index)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Question</Label>
          <Textarea
            value={String(step.ai_question ?? "")}
            onChange={(e) => onChange(index, "ai_question", e.target.value)}
            rows={2}
            placeholder="Which department do you need?"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Slot name</Label>
            <Input
              value={String(step.slot_name ?? "")}
              onChange={(e) => onChange(index, "slot_name", e.target.value)}
              placeholder="department"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Expected input</Label>
            <Select value={String(step.expected_input ?? "text")} onValueChange={(v) => onChange(index, "expected_input", v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPECTED_INPUTS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Options (comma-separated)</Label>
          <Input
            value={String(step.options ?? "")}
            onChange={(e) => onChange(index, "options", e.target.value)}
            placeholder="Dental, ENT"
          />
        </div>

        {isLookup && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="text-xs font-semibold text-muted-foreground">Lookup configuration</div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Source tab</Label>
                <Select value={String(step.lookup_source ?? "")} onValueChange={(v) => onChange(index, "lookup_source", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a tab" />
                  </SelectTrigger>
                  <SelectContent>
                    {tabs.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Extract column</Label>
                <Input
                  value={String(step.lookup_extract ?? "")}
                  onChange={(e) => onChange(index, "lookup_extract", e.target.value)}
                  placeholder="available_times"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Filter (column = slot)</Label>
              <div className="space-y-2">
                {clauses.map((c, ci) => (
                  <div key={ci} className="flex items-center gap-2">
                    <Input
                      className="flex-1"
                      value={c.column}
                      onChange={(e) =>
                        setFilter(clauses.map((x, xi) => (xi === ci ? { ...x, column: e.target.value } : x)))
                      }
                      placeholder="column (e.g. doctor)"
                    />
                    <span className="text-sm text-muted-foreground">=</span>
                    <Input
                      className="flex-1"
                      value={c.slot}
                      onChange={(e) =>
                        setFilter(clauses.map((x, xi) => (xi === ci ? { ...x, slot: e.target.value } : x)))
                      }
                      placeholder="slot (e.g. specialist)"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setFilter(clauses.filter((_, xi) => xi !== ci))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilter([...clauses, { column: "", slot: "" }])}
                >
                  <Plus className="mr-1 h-3 w-3" /> Add condition
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Alternate step (no match)</Label>
              <Select value={String(step.alternate_step ?? "")} onValueChange={(v) => onChange(index, "alternate_step", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None (complete)" />
                </SelectTrigger>
                <SelectContent>
                  {stepIds.map((id) => (
                    <SelectItem key={id} value={`→ ${id}`}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
