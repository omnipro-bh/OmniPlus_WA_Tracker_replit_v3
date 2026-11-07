import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, Save } from "lucide-react";
import type { Workflow } from "@shared/schema";
import { AiTracePanel, type AiTraceRow } from "@/components/ai-trace-panel";
import { KnowledgeTab, ScenariosTab } from "@/components/ai-studio-sheets";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AiStudioPersona {
  alias: string;
  title: string;
  description: string;
}

interface AiStudioConfig {
  instructions: string;
  persona: AiStudioPersona;
}

export default function AIStudio() {
  const { toast } = useToast();

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

  // ── Global AI Studio config (Instructions + Persona) ────────────────
  const { data: studioConfig } = useQuery<AiStudioConfig>({
    queryKey: ["/api/ai-studio/config"],
  });

  const [instructions, setInstructions] = useState("");
  const [persona, setPersona] = useState<AiStudioPersona>({
    alias: "",
    title: "",
    description: "",
  });

  useEffect(() => {
    if (studioConfig) {
      setInstructions(studioConfig.instructions ?? "");
      setPersona(studioConfig.persona ?? { alias: "", title: "", description: "" });
    }
  }, [studioConfig]);

  const saveConfig = useMutation({
    mutationFn: async (payload: Partial<AiStudioConfig>) => {
      await apiRequest("PUT", "/api/ai-studio/config", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-studio/config"] });
      toast({ title: "Saved", description: "AI Studio config updated." });
    },
    onError: (error: any) => {
      toast({
        title: "Save failed",
        description: error?.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">AI Studio</h1>
          <p className="text-muted-foreground">Control panel for your AI Agent.</p>
        </div>

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
          <div className="flex justify-end">
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

        {/* ── Instructions (functional) ───────────────────────────────── */}
        <TabsContent value="instructions">
          <Card>
            <CardHeader>
              <CardTitle>Instructions</CardTitle>
              <CardDescription>
                The system prompt applied to every AI node. Leave blank to fall back
                to the default prompt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="You are a helpful assistant…"
                rows={14}
                className="min-h-[280px] resize-y font-mono text-sm"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {instructions.length} characters
                </span>
                <Button
                  onClick={() => saveConfig.mutate({ instructions })}
                  disabled={saveConfig.isPending}
                >
                  {saveConfig.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Instructions
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Persona (functional) ────────────────────────────────────── */}
        <TabsContent value="persona">
          <Card>
            <CardHeader>
              <CardTitle>Persona</CardTitle>
              <CardDescription>
                How your AI Agent introduces itself. Injected as the assistant's
                identity at the top of the system prompt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="persona-alias">Alias</Label>
                  <Input
                    id="persona-alias"
                    value={persona.alias}
                    onChange={(e) => setPersona({ ...persona, alias: e.target.value })}
                    placeholder="Joy"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="persona-title">Position Title</Label>
                  <Input
                    id="persona-title"
                    value={persona.title}
                    onChange={(e) => setPersona({ ...persona, title: e.target.value })}
                    placeholder="Live Chat Agent"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="persona-description">Short Description</Label>
                <Textarea
                  id="persona-description"
                  value={persona.description}
                  onChange={(e) => setPersona({ ...persona, description: e.target.value })}
                  placeholder="About the business…"
                  rows={4}
                  className="resize-y"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {persona.alias !== (studioConfig?.persona?.alias ?? "") ||
                  persona.title !== (studioConfig?.persona?.title ?? "") ||
                  persona.description !== (studioConfig?.persona?.description ?? "")
                    ? "Unsaved changes"
                    : "Saved"}
                </span>
                <Button
                  onClick={() => saveConfig.mutate({ persona })}
                  disabled={saveConfig.isPending}
                >
                  {saveConfig.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Persona
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Knowledge (functional) ──────────────────────────────────── */}
        <TabsContent value="knowledge">
          <KnowledgeTab workflowId={effectiveWorkflowId} />
        </TabsContent>

        {/* ── Scenarios (functional) ──────────────────────────────────── */}
        <TabsContent value="scenarios">
          <ScenariosTab workflowId={effectiveWorkflowId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
