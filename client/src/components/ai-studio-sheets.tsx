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

function intentsTabName(config: AiSheetsConfig | null | undefined): string {
  const tabs = Array.isArray(config?.tabs) && config.tabs.length > 0
    ? config.tabs
    : AI_SHEET_TAB_SCHEMA.map((t) => t.tab);
  return tabs.find((t) => /^intents?$/i.test(t)) ?? "Intents";
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

// ── Scenarios Tab (hierarchical builder: Intents → Steps) ──────────────────

const EXPECTED_INPUTS = ["text", "list", "buttons", "datetime"];

/**
 * Owner-facing format gate (`validation` column). `None` writes an empty cell;
 * `Custom regex…` writes the pattern itself, which the server compiles and
 * applies case-insensitively.
 */
const VALIDATION_OPTIONS = [
  { value: "__none__", label: "None" },
  { value: "text", label: "Text" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
];
const NO_VALIDATION = "__none__";
const CUSTOM_VALIDATION = "__custom__";
const NAMED_VALIDATIONS = VALIDATION_OPTIONS.map((o) => o.value).filter(
  (v) => v !== NO_VALIDATION
);
const DEFAULT_CUSTOM_VALIDATION = "^\\d{8}$";

/** A column picker: dropdown when columns are known, else a free-text input. */
function ColumnPicker({
  value,
  columns,
  onChange,
  placeholder,
}: {
  value: string;
  columns: string[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  if (columns.length > 0) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder || "Select column"} />
        </SelectTrigger>
        <SelectContent>
          {columns.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

export function ScenariosTab({ workflowId }: { workflowId: string }) {
  const { toast } = useToast();

  const { data: configData, isLoading: configLoading } = useQuery<AiSheetsResponse>({
    queryKey: [`/api/ai-studio/sheets?workflowId=${workflowId}`],
    enabled: Boolean(workflowId),
  });

  const googleSheets = configData?.googleSheets ?? null;
  const stepsTab = stepsTabName(googleSheets);
  const intentsTab = intentsTabName(googleSheets);
  const connected = Boolean(googleSheets?.spreadsheetId);

  // All tab names in the sheet.
  const { data: tabsData } = useQuery<{ tabs: string[] }>({
    queryKey: [`/api/ai-studio/sheets/${workflowId}/tabs`],
    enabled: connected && Boolean(workflowId),
  });
  const allTabs = useMemo(() => tabsData?.tabs ?? [], [tabsData]);

  // Intents (for the intent dropdown).
  const { data: intentsData } = useQuery<AiSheetsRowsResponse>({
    queryKey: [`/api/ai-studio/sheets/${encodeURIComponent(intentsTab)}/rows?workflowId=${workflowId}`],
    enabled: connected && Boolean(workflowId),
  });
  const intents = useMemo(() => intentsData?.rows ?? [], [intentsData]);

  // All steps across every intent.
  const { data: stepsData, isLoading: stepsLoading } = useQuery<AiSheetsRowsResponse>({
    queryKey: [`/api/ai-studio/sheets/${encodeURIComponent(stepsTab)}/rows?workflowId=${workflowId}`],
    enabled: connected && Boolean(workflowId),
  });
  const allSteps = useMemo(() => stepsData?.rows ?? [], [stepsData]);

  // The Intents tab keys on `id`; the Steps tab keys on `intent_id`.
  const intentIdHeader = headerFor(googleSheets, intentsTab, "id");
  const stepIntentHeader = headerFor(googleSheets, stepsTab, "intent_id");

  const [selectedIntentId, setSelectedIntentId] = useState<string>("");
  const [steps, setSteps] = useState<Record<string, any>[]>([]);

  // Auto-select the first intent.
  useEffect(() => {
    if (!selectedIntentId && intents.length > 0) {
      setSelectedIntentId(String(intents[0][intentIdHeader] ?? "").trim());
    }
  }, [intents, selectedIntentId, intentIdHeader]);

  // Load the selected intent's steps into editable state.
  useEffect(() => {
    if (!selectedIntentId) {
      setSteps([]);
      return;
    }
    const canonical = allSteps
      .filter((r) => String(r[stepIntentHeader] ?? "").trim() === selectedIntentId)
      .map((r) => rowToCanonical(r, googleSheets, stepsTab))
      .sort((a, b) => stepNumber(a, "step_id") - stepNumber(b, "step_id"));
    setSteps(canonical);
  }, [selectedIntentId, allSteps, googleSheets, stepsTab, stepIntentHeader]);

  // Columns (header row) for every tab, for the lookup dropdowns.
  const [columnsMap, setColumnsMap] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!connected || allTabs.length === 0) return;
    let cancelled = false;
    (async () => {
      const map: Record<string, string[]> = {};
      for (const tab of allTabs) {
        try {
          const res = await fetch(
            `/api/ai-studio/sheets/${workflowId}/tabs/${encodeURIComponent(tab)}/columns`,
            { credentials: "include" }
          );
          if (res.ok) {
            const data = await res.json();
            map[tab] = Array.isArray(data.columns) ? data.columns : [];
          }
        } catch {
          /* ignore a single tab's failure */
        }
      }
      if (!cancelled) setColumnsMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, allTabs, workflowId]);

  const stepIds = steps.map((s) => String(s.step_id ?? "")).filter(Boolean);

  const updateStep = (index: number, field: string, value: any) =>
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      {
        intent_id: selectedIntentId,
        step_id: `Step_${prev.length + 1}`,
        step_type: "ask",
        ai_question: "",
        slot_name: "",
        expected_input: "text",
        options: "",
        validation: "",
        fallback: "",
        next_step_logic: "→ done",
      },
    ]);

  const removeStep = (index: number) => setSteps((prev) => prev.filter((_, i) => i !== index));

  const saveSteps = useMutation({
    mutationFn: async () => {
      // Keep every existing step_id (so the owner's `next_step_logic` references
      // stay valid) and only assign a fresh one to newly added steps.
      const used = new Set(
        steps.map((s) => String(s.step_id ?? "").trim()).filter(Boolean)
      );
      let nextNum = 1;
      const normalized = steps.map((s) => {
        let id = String(s.step_id ?? "").trim();
        if (!id) {
          while (used.has(`Step_${nextNum}`)) nextNum += 1;
          id = `Step_${nextNum}`;
          used.add(id);
        }
        return { ...s, step_id: id, intent_id: selectedIntentId };
      });
      await apiRequest("POST", `/api/ai-studio/scenarios/${workflowId}/steps`, {
        intent_id: selectedIntentId,
        steps: normalized,
      });
    },
    onSuccess: () => {
      toast({ title: "Saved", description: `Steps for "${selectedIntentId}" updated in Google Sheets.` });
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

  if (configLoading || stepsLoading) {
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

  if (intents.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No intents found in the "{intentsTab}" tab.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-xs">
          <Label className="mb-1 block text-xs">Intent</Label>
          <Select value={selectedIntentId} onValueChange={setSelectedIntentId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an intent" />
            </SelectTrigger>
            <SelectContent>
              {intents.map((it) => {
                const id = String(it[intentIdHeader] ?? "").trim();
                return (
                  <SelectItem key={id} value={id}>
                    {id}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
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
      </div>

      {steps.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No steps for this intent yet. Click "Add Step" to create one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {steps.map((step, i) => (
            <StepEditor
              key={i}
              step={step}
              index={i}
              tabs={allTabs}
              columnsMap={columnsMap}
              stepIds={stepIds.filter((id) => id !== String(step.step_id ?? ""))}
              onChange={updateStep}
              onRemove={removeStep}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StepEditor({
  step,
  index,
  tabs,
  columnsMap,
  stepIds,
  onChange,
  onRemove,
}: {
  step: Record<string, any>;
  index: number;
  tabs: string[];
  columnsMap: Record<string, string[]>;
  stepIds: string[];
  onChange: (index: number, field: string, value: any) => void;
  onRemove: (index: number) => void;
}) {
  const isLookup = String(step.step_type ?? "ask").trim().toLowerCase() === "lookup";
  const clauses = parseFilterClauses(String(step.lookup_filter ?? ""));
  const sourceColumns = columnsMap[String(step.lookup_source ?? "")] ?? [];

  // `validation` holds a named format or a custom regex. Anything not named is
  // shown in the "Custom regex" input so the owner can edit the pattern.
  const rawValidation = String(step.validation ?? "").trim();
  const isCustomValidation =
    rawValidation !== "" && !NAMED_VALIDATIONS.includes(rawValidation.toLowerCase());
  const validationSelectValue = isCustomValidation
    ? CUSTOM_VALIDATION
    : rawValidation.toLowerCase() || NO_VALIDATION;

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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Options (comma-separated)</Label>
            <Input
              value={String(step.options ?? "")}
              onChange={(e) => onChange(index, "options", e.target.value)}
              placeholder="Dental, ENT"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fallback</Label>
            <Input
              value={String(step.fallback ?? "")}
              onChange={(e) => onChange(index, "fallback", e.target.value)}
              placeholder="Please choose a valid option."
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Validation</Label>
          <Select
            value={validationSelectValue}
            onValueChange={(v) =>
              onChange(
                index,
                "validation",
                v === NO_VALIDATION
                  ? ""
                  : v === CUSTOM_VALIDATION
                    ? isCustomValidation
                      ? rawValidation
                      : DEFAULT_CUSTOM_VALIDATION
                    : v
              )
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VALIDATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_VALIDATION}>Custom regex…</SelectItem>
            </SelectContent>
          </Select>
          {isCustomValidation ? (
            <Input
              className="font-mono text-xs"
              value={rawValidation}
              onChange={(e) => onChange(index, "validation", e.target.value)}
              placeholder={DEFAULT_CUSTOM_VALIDATION}
            />
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Rejects an answer that does not match the format (checked on the whole answer, then on each
              comma-separated field) and asks the question again.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Next step logic</Label>
          <Input
            value={String(step.next_step_logic ?? "")}
            onChange={(e) => onChange(index, "next_step_logic", e.target.value)}
            placeholder="→ Step_2  or  → done"
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
                <ColumnPicker
                  value={String(step.lookup_extract ?? "")}
                  columns={sourceColumns}
                  onChange={(v) => onChange(index, "lookup_extract", v)}
                  placeholder="available_times"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Filter (column = slot)</Label>
              <div className="space-y-2">
                {clauses.map((c, ci) => (
                  <div key={ci} className="flex items-center gap-2">
                    <div className="flex-1">
                      <ColumnPicker
                        value={c.column}
                        columns={sourceColumns}
                        onChange={(v) => setFilter(clauses.map((x, xi) => (xi === ci ? { ...x, column: v } : x)))}
                        placeholder="column"
                      />
                    </div>
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
