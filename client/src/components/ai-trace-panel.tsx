import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Bot, Clock, Coins, Zap } from "lucide-react";

/**
 * A single execution row returned by `GET /api/workflows/:id/ai-traces`.
 * `aiTrace` mirrors the server-side `AiTrace` shape (server/workflows/aiAgentExecutor.ts).
 */
export interface AiTraceRow {
  id: number;
  executedAt: string;
  channel: string;
  phone: string;
  messageType: string;
  status: string;
  aiTrace: AiTraceShape;
}

interface AiTraceShape {
  nodeId?: string;
  userMessage?: string;
  text?: string;
  provider?: string;
  model?: string;
  attempts?: number;
  finishReason?: string;
  elapsedMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  nextHandle?: string;
  error?: string;
  reason?: string;
  toolCalls?: Array<{ name?: string; arguments?: unknown }>;
  tokenBreakdown?: Record<string, number>;
  sheetState?: {
    intentId?: string | null;
    stepId?: string | null;
    slots?: Record<string, unknown>;
  };
  extractedSlots?: Record<string, unknown>;
  skippedSteps?: string[];
  slotExtractionAttempts?: number;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  rejectedSlots?: Array<{ slot: string; value: string; reason: string }>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="ml-auto font-mono text-sm">{value}</span>
    </div>
  );
}

function slotLabel(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  return String(value);
}

export function AiTracePanel({ trace }: { trace: AiTraceRow }) {
  const ai = trace.aiTrace;
  const sheet = ai?.sheetState;
  const slots = sheet?.slots ?? {};
  const slotEntries = Object.entries(slots);
  const rejected = Array.isArray(ai?.rejectedSlots) ? ai.rejectedSlots : [];

  const intentId = sheet?.intentId ?? null;
  const stepId = sheet?.stepId ?? null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">AI Turn</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {trace.channel === "web_chat" ? "Web Chat" : trace.channel}
              </Badge>
              <Badge variant="outline">{trace.messageType}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Intent ID</div>
              <div className="font-mono">{intentId ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Step ID</div>
              <div className="font-mono">{stepId ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Timestamp</div>
              <div className="font-mono">{format(new Date(trace.executedAt), "PPpp")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Node</div>
              <div className="font-mono">{ai?.nodeId ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Model</div>
              <div className="font-mono text-xs">{ai?.model ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Next handle</div>
              <div className="font-mono">{ai?.nextHandle ?? "—"}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <div className="mb-1 text-xs text-muted-foreground">User message</div>
            <div className="whitespace-pre-wrap">{ai?.userMessage || "(none)"}</div>
          </div>
          {ai?.text != null && ai.text !== "" && (
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <div className="mb-1 text-xs text-muted-foreground">Reply sent</div>
              <div className="whitespace-pre-wrap">{ai.text}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fallback banner */}
      {ai?.fallbackUsed && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Fallback triggered</div>
            <div>{ai.fallbackReason || "Invalid slot value → re-asked the customer."}</div>
          </div>
        </div>
      )}

      {/* Slots */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Slots</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {slotEntries.length === 0 && rejected.length === 0 ? (
            <p className="text-sm text-muted-foreground">No slot activity this turn.</p>
          ) : (
            <>
              {slotEntries.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Accepted</div>
                  <div className="flex flex-wrap gap-2">
                    {slotEntries.map(([name, value]) => (
                      <Badge
                        key={name}
                        variant="outline"
                        className="bg-green-500/10 text-green-500 border-green-500/20"
                      >
                        {name}: {slotLabel(value)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {rejected.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Rejected</div>
                  <div className="flex flex-col gap-2">
                    {rejected.map((r, i) => (
                      <div
                        key={`${r.slot}-${i}`}
                        className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="bg-red-500/10 text-red-500 border-red-500/20"
                          >
                            {r.slot}: {slotLabel(r.value)}
                          </Badge>
                          <span className="text-xs text-red-400">{r.reason}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {ai?.skippedSteps && ai.skippedSteps.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Skipped steps (already filled):{" "}
                  <span className="font-mono">{ai.skippedSteps.join(", ")}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Metrics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Metrics</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Metric icon={Coins} label="Tokens in" value={String(ai?.tokensIn ?? "—")} />
          <Metric icon={Coins} label="Tokens out" value={String(ai?.tokensOut ?? "—")} />
          <Metric icon={Zap} label="Elapsed" value={`${ai?.elapsedMs ?? "—"} ms`} />
          <Metric icon={Bot} label="Attempts" value={String(ai?.attempts ?? "—")} />
          <Metric icon={Bot} label="Provider" value={ai?.provider ?? "—"} />
          <Metric icon={Clock} label="Finish" value={ai?.finishReason ?? "—"} />
        </CardContent>
      </Card>

      {/* Raw JSON */}
      <details className="group">
        <summary className="cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground">
          View raw JSON
        </summary>
        <ScrollArea className="mt-2 max-h-[400px] rounded-md border">
          <pre className="p-4 text-xs">{JSON.stringify(ai, null, 2)}</pre>
        </ScrollArea>
      </details>
    </div>
  );
}
