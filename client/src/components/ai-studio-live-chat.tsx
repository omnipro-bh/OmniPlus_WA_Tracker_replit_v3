import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, Trash2 } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Workflow } from "@shared/schema";
import {
  tick,
  type SandboxAwaiting,
  type SandboxMessage,
  type SandboxTickInput,
} from "@/lib/workflow-sandbox";
import { AiTracePanel, type AiTraceRow } from "@/components/ai-trace-panel";

// ── Types ──────────────────────────────────────────────────────────────────

type ChatItem =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "bot"; message: SandboxMessage };

// ── Helpers ────────────────────────────────────────────────────────────────

function newSessionId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

let traceSeq = 0;
function toTraceRow(aiTrace: Record<string, any>): AiTraceRow {
  return {
    id: ++traceSeq,
    executedAt: new Date().toISOString(),
    channel: "sandbox",
    phone: "sandbox",
    messageType: "text",
    status: "SUCCESS",
    aiTrace: aiTrace as AiTraceRow["aiTrace"],
  };
}

// ── Bubble renderer (AI-agent output: text / buttons / list) ───────────────

function BotBubble({
  message,
  awaiting,
  isLoading,
  onButton,
}: {
  message: SandboxMessage;
  awaiting: SandboxAwaiting | null;
  isLoading: boolean;
  onButton: (id: string) => void;
}) {
  const canClick = awaiting?.kind === "button" && !isLoading;

  let body: React.ReactNode;
  switch (message.type) {
    case "buttons":
    case "call_to_action_buttons":
      body = (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
          <div className="flex flex-wrap gap-1.5">
            {(message.buttons || []).map((b) => (
              <Button
                key={b.id}
                size="sm"
                variant={b.type === "quick_reply" ? "default" : "outline"}
                className="h-7 text-xs"
                disabled={!canClick}
                onClick={() => onButton(b.id)}
              >
                {b.title}
              </Button>
            ))}
          </div>
        </div>
      );
      break;

    case "list":
      body = (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
          {(message.sections || []).map((s, i) => (
            <div key={i} className="overflow-hidden rounded-md border">
              <div className="bg-muted px-2 py-1 text-xs font-medium">{s.title}</div>
              {s.rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={!canClick}
                  onClick={() => onButton(r.id)}
                  className="w-full border-t px-2 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="font-medium">{r.title}</div>
                  {r.description ? (
                    <div className="text-xs text-muted-foreground">{r.description}</div>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      );
      break;

    default:
      body = <p className="whitespace-pre-wrap break-words text-sm">{message.text ?? ""}</p>;
  }

  return (
    <div className="max-w-[85%] rounded-lg border bg-muted/40 p-2.5">
      <div className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Bot className="h-3 w-3" />
        <span className="truncate">{message.nodeType}</span>
      </div>
      {body}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function LiveChatTab({
  workflow,
  active,
}: {
  workflow: Workflow | undefined;
  active: boolean;
}) {
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [awaiting, setAwaiting] = useState<SandboxAwaiting | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "awaiting" | "done">("idle");
  const [aiMode, setAiMode] = useState<"mock" | "live">("live");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traces, setTraces] = useState<AiTraceRow[]>([]);

  const sessionRef = useRef<{ cursor: string | null; context: Record<string, any> }>({
    cursor: null,
    context: {},
  });
  const busyRef = useRef(false);
  const idRef = useRef(0);
  const startedForRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>(newSessionId());

  const nextId = () => `c${idRef.current++}`;

  const runTick = async (input: SandboxTickInput) => {
    if (busyRef.current || !workflow) return;
    busyRef.current = true;
    setIsLoading(true);
    setError(null);
    setStatus("running");
    try {
      const res = await tick({
        workflowId: workflow.id,
        definitionJson: (workflow.definitionJson as any) ?? { nodes: [], edges: [] },
        entryNodeId: workflow.entryNodeId ?? null,
        cursor: sessionRef.current.cursor,
        context: sessionRef.current.context,
        input,
        httpMode: "mock",
        aiMode,
        sessionId: sessionIdRef.current,
        saveExecution: true,
      });

      sessionRef.current.cursor = res.cursor;
      sessionRef.current.context = res.context;

      if (res.messages.length > 0) {
        setChat((c) => [
          ...c,
          ...res.messages.map((m): ChatItem => ({ id: nextId(), role: "bot", message: m })),
        ]);
      }

      const newTraces = (res.aiTraces ?? []).map(toTraceRow);
      if (newTraces.length > 0) setTraces((prev) => [...prev, ...newTraces]);

      setAwaiting(res.awaiting);
      setStatus(
        res.status === "awaiting_input"
          ? "awaiting"
          : res.status === "done"
            ? "done"
            : "idle"
      );
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
      setStatus("idle");
    } finally {
      busyRef.current = false;
      setIsLoading(false);
    }
  };

  const resetAndStart = () => {
    sessionRef.current = { cursor: null, context: {} };
    sessionIdRef.current = newSessionId();
    setChat([]);
    setTraces([]);
    setAwaiting(null);
    setStatus("idle");
    setError(null);
    setInput("");
    if (workflow) startedForRef.current = String(workflow.id);
    runTick({ type: "start" });
  };

  // Start (and reset) only when the tab is first activated for a workflow —
  // never on page load, so an inactive Live Chat tab can't fire a paid AI call.
  useEffect(() => {
    if (!active || !workflow) return;
    if (startedForRef.current !== String(workflow.id)) {
      resetAndStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, workflow?.id]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading || awaiting?.kind !== "text") return;
    setChat((c) => [...c, { id: nextId(), role: "user", text }]);
    setInput("");
    runTick({ type: "text", text });
  };

  const handleButton = (buttonId: string) => {
    if (awaiting?.kind !== "button" || isLoading) return;
    runTick({ type: "button", buttonId });
  };

  const latestTrace = traces.length > 0 ? traces[traces.length - 1] : null;
  const canSendText = awaiting?.kind === "text" && !isLoading;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b p-3">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Test Chat</span>
        <Badge variant="outline" className="capitalize">
          {status}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Select
            value={aiMode}
            onValueChange={(v) => setAiMode(v as "mock" | "live")}
            disabled={isLoading}
          >
            <SelectTrigger className="h-7 w-[96px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="live">live</SelectItem>
              <SelectItem value="mock">mock</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={resetAndStart}
            disabled={isLoading}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Clear Chat
          </Button>
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="h-[560px]">
        {/* Left: chat */}
        <ResizablePanel defaultSize={45} minSize={30}>
          <div className="flex h-full flex-col">
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-3 p-4">
                {chat.length === 0 && !isLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Starting the conversation…
                  </p>
                ) : null}
                {chat.map((item) =>
                  item.role === "user" ? (
                    <div key={item.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                        {item.text}
                      </div>
                    </div>
                  ) : (
                    <div key={item.id} className="flex justify-start">
                      <BotBubble
                        message={item.message}
                        awaiting={awaiting}
                        isLoading={isLoading}
                        onButton={handleButton}
                      />
                    </div>
                  )
                )}
                {isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    AI is thinking…
                  </div>
                ) : null}
                {error ? (
                  <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-500">
                    {error}
                  </p>
                ) : null}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="flex items-center gap-2 border-t p-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  awaiting?.kind === "button"
                    ? "Choose an option above…"
                    : awaiting?.kind === "text"
                      ? "Type your message…"
                      : "Conversation ended"
                }
                disabled={!canSendText}
              />
              <Button size="sm" onClick={handleSend} disabled={!canSendText}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right: trace */}
        <ResizablePanel defaultSize={55} minSize={30}>
          <ScrollArea className="h-full">
            <div className="p-4">
              {latestTrace ? (
                <AiTracePanel trace={latestTrace} />
              ) : (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  <Bot className="h-6 w-6" />
                  Send a message to see the AI trace.
                </div>
              )}
            </div>
          </ScrollArea>
        </ResizablePanel>
      </ResizablePanelGroup>
    </Card>
  );
}
