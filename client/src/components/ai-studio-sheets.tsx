import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AI_SHEET_TAB_SCHEMA, matchSheetHeaders } from "@shared/ai-defaults";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, ArrowRight } from "lucide-react";
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

// ── Scenarios Tab ──────────────────────────────────────────────────────────

export function ScenariosTab({ workflowId }: { workflowId: string }) {
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

  const { intentHeader, stepHeader, questionHeader, slotHeader, expectedHeader, optionsHeader } =
    useMemo(() => {
      const t = stepsTab;
      return {
        intentHeader: headerFor(googleSheets, t, "intent_id"),
        stepHeader: headerFor(googleSheets, t, "step_id"),
        questionHeader: headerFor(googleSheets, t, "ai_question"),
        slotHeader: headerFor(googleSheets, t, "slot_name"),
        expectedHeader: headerFor(googleSheets, t, "expected_input"),
        optionsHeader: headerFor(googleSheets, t, "options"),
      };
    }, [googleSheets, stepsTab]);

  const groups = useMemo(() => {
    const map = new Map<string, Record<string, any>[]>();
    for (const row of rows) {
      const intentId = String(row[intentHeader] ?? "").trim() || "(no intent)";
      if (!map.has(intentId)) map.set(intentId, []);
      map.get(intentId)!.push(row);
    }
    for (const list of Array.from(map.values())) {
      list.sort((a, b) => stepNumber(a, stepHeader) - stepNumber(b, stepHeader));
    }
    return Array.from(map.entries());
  }, [rows, intentHeader, stepHeader]);

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

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No rows found in the "{stepsTab}" tab.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(([intentId, steps]) => (
        <Card key={intentId}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{intentId}</CardTitle>
              <Badge variant="outline">{steps.length} steps</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {steps.map((step, i) => {
                const opts = optionsList(step[optionsHeader]);
                return (
                  <div key={`${intentId}-${i}`} className="flex items-stretch gap-2">
                    <div className="min-w-[180px] flex-1 rounded-md border bg-muted/30 p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold">
                          {String(step[stepHeader] ?? `Step ${i + 1}`)}
                        </span>
                        {step[slotHeader] ? (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            slot: {String(step[slotHeader])}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-sm">{String(step[questionHeader] ?? "")}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium">expected_input:</span>{" "}
                        <span className="font-mono">{String(step[expectedHeader] ?? "text")}</span>
                      </div>
                      {opts.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {opts.map((o) => (
                            <Badge key={o} variant="outline" className="font-mono text-[10px]">
                              {o}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {i < steps.length - 1 && (
                      <div className="flex items-center text-muted-foreground">
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
