import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { Workflow } from "@shared/schema";
import { AiTracePanel, type AiTraceRow } from "@/components/ai-trace-panel";
import { queryClient } from "@/lib/queryClient";

function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          Coming soon.
        </div>
      </CardContent>
    </Card>
  );
}

export default function AIStudio() {
  const { data: workflows = [], isLoading: workflowsLoading } = useQuery<Workflow[]>({
    queryKey: ["/api/workflows"],
  });

  const [workflowId, setWorkflowId] = useState<string>("");
  const [selectedTraceId, setSelectedTraceId] = useState<number | null>(null);

  const effectiveWorkflowId = workflowId || (workflows[0]?.id ? String(workflows[0].id) : "");

  const { data: traces = [], isLoading: tracesLoading } = useQuery<AiTraceRow[]>({
    queryKey: [`/api/workflows/${effectiveWorkflowId}/ai-traces`],
    enabled: Boolean(effectiveWorkflowId),
  });

  const selectedTrace = traces.find((t) => t.id === selectedTraceId) ?? traces[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Studio</h1>
        <p className="text-muted-foreground">Control panel for your AI Agent.</p>
      </div>

      <Tabs defaultValue="traces">
        <TabsList>
          <TabsTrigger value="traces">Traces</TabsTrigger>
          <TabsTrigger value="instructions">Instructions</TabsTrigger>
          <TabsTrigger value="persona">Persona</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
        </TabsList>

        {/* ── Traces (functional) ─────────────────────────────────────── */}
        <TabsContent value="traces" className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div className="w-full max-w-xs">
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Workflow
              </label>
              {workflowsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading workflows…
                </div>
              ) : (
                <Select
                  value={effectiveWorkflowId}
                  onValueChange={(v) => {
                    setWorkflowId(v);
                    setSelectedTraceId(null);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a workflow" />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: [`/api/workflows/${effectiveWorkflowId}/ai-traces`],
                })
              }
              disabled={!effectiveWorkflowId}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>

          {tracesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading traces…
            </div>
          ) : traces.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No AI traces yet for this workflow. Run a conversation through your AI
                Agent (WhatsApp or web chat) and refresh.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              {/* Left: trace list */}
              <Card className="self-start">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Executions ({traces.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[560px]">
                    <div className="flex flex-col gap-1 p-2">
                      {traces.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setSelectedTraceId(t.id)}
                          className={`flex flex-col gap-1 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                            selectedTrace?.id === t.id
                              ? "bg-muted"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs">
                              {format(new Date(t.executedAt), "PPpp")}
                            </span>
                            <Badge variant="outline" className="capitalize">
                              {t.channel === "web_chat" ? "Web Chat" : t.channel}
                            </Badge>
                          </div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground">
                            {t.phone}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {t.aiTrace?.userMessage || "(no message)"}
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Right: trace panel */}
              <div>
                {selectedTrace ? (
                  <AiTracePanel trace={selectedTrace} />
                ) : (
                  <Card>
                    <CardContent className="p-6 text-sm text-muted-foreground">
                      Select an execution to inspect its AI trace.
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Placeholders ─────────────────────────────────────────────── */}
        <TabsContent value="instructions">
          <ComingSoon
            title="Instructions"
            description="The system prompt for your AI Agent, persisted to the database."
          />
        </TabsContent>
        <TabsContent value="persona">
          <ComingSoon
            title="Persona"
            description="Alias, position title, and a short description for your AI Agent."
          />
        </TabsContent>
        <TabsContent value="knowledge">
          <ComingSoon
            title="Knowledge"
            description="A read-only view of your connected Google Sheets (Intents, Workflow_Steps)."
          />
        </TabsContent>
        <TabsContent value="scenarios">
          <ComingSoon
            title="Scenarios"
            description="A visual list of intents and their workflow steps."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
