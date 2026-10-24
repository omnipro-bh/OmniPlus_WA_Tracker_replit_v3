import { useEffect, useRef, useState } from "react";
import {
  TestTube,
  RefreshCw,
  Send,
  X,
  ChevronDown,
  Phone,
  Link as LinkIcon,
  Copy,
  MapPin,
  Paperclip,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  tick,
  SandboxApiError,
  type SandboxMessage,
  type SandboxAwaiting,
  type SandboxTickInput,
  type TraceEntry,
  type TraceOutcome,
  type StopReason,
} from "@/lib/workflow-sandbox";

interface WorkflowTestPanelProps {
  workflowId: number;
  definitionJson: { nodes: any[]; edges: any[] };
  entryNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  onClose?: () => void;
}

/** Reserved context keys surfaced with an "internal" badge in the Variables panel. */
const RESERVED_KEYS = new Set([
  "http",
  "bookingState",
  "captureActive",
  "captureSequenceName",
  "capturedClicks",
  "captureStartNodeId",
  "captureCompleted",
  "lastBookingId",
  "checkBookingsState",
]);

type TranscriptItem =
  | { kind: "bot"; id: string; message: SandboxMessage }
  | { kind: "user"; id: string; text: string };

function retryAfterMessage(retryAfter?: number): string {
  if (retryAfter == null) return "Try again shortly";
  const s = Math.ceil(retryAfter);
  if (s <= 60) return `Try again in ${s} seconds`;
  const m = Math.ceil(s / 60);
  return `Try again in ~${m} ${m === 1 ? "minute" : "minutes"}`;
}

function formatValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/** Flatten a context object into dot-path rows, capped at 3 levels. */
function flattenContext(
  obj: unknown,
  prefix = "",
  depth = 0,
  out: Array<{ path: string; value: unknown }> = []
): Array<{ path: string; value: unknown }> {
  if (depth >= 3 || obj === null || typeof obj !== "object") {
    out.push({ path: prefix, value: obj });
    return out;
  }
  const entries = Object.entries(obj as Record<string, unknown>);
  if (entries.length === 0) {
    out.push({ path: prefix, value: obj });
    return out;
  }
  for (const [k, v] of entries) {
    flattenContext(v, prefix ? `${prefix}.${k}` : k, depth + 1, out);
  }
  return out;
}

function rootSegment(path: string): string {
  const i = path.indexOf(".");
  return i === -1 ? path : path.slice(0, i);
}

/** Mirror of server `resolveSandboxStartNode` — display only. */
function resolveStartNodeId(
  def: { nodes: any[]; edges: any[] },
  entryNodeId?: string | null
): string | null {
  const nodes = Array.isArray(def?.nodes) ? def.nodes : [];
  const edges = Array.isArray(def?.edges) ? def.edges : [];
  if (nodes.length === 0) return null;
  if (entryNodeId && nodes.some((n) => n?.id === entryNodeId)) return entryNodeId;
  const hasIncoming = new Set<string>();
  for (const e of edges) if (e?.target) hasIncoming.add(e.target);
  const first = nodes.find((n) => n?.id && !hasIncoming.has(n.id));
  if (first?.id) return first.id;
  return nodes[0]?.id ?? null;
}

const OUTCOME_STYLE: Record<TraceOutcome, string> = {
  sent: "text-blue-500",
  evaluated: "text-violet-500",
  assigned: "text-amber-500",
  http: "text-cyan-500",
  awaiting: "text-primary",
  stopped: "text-destructive",
  error: "text-destructive",
};

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

/** Image-like media type hints (case-insensitive substring match). */
const IMAGE_MEDIA_HINTS = ["image", "photo", "picture", "png", "jpg", "jpeg", "gif", "webp"];

function isImageMedia(mediaType?: string): boolean {
  if (!mediaType) return false;
  const t = mediaType.toLowerCase();
  return IMAGE_MEDIA_HINTS.some((h) => t.includes(h));
}

/** Carousel card image with a paperclip fallback on load failure. */
function CardImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="h-20 w-full rounded bg-muted flex items-center justify-center overflow-hidden">
        <Paperclip className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-20 w-full object-cover rounded"
      onError={() => setFailed(true)}
    />
  );
}

/** Media-bubble image with a URL-text fallback on load failure. */
function MediaImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <p className="text-xs text-muted-foreground break-all">{src}</p>;
  }
  return (
    <img
      src={src}
      alt=""
      className="max-h-40 w-full object-contain rounded"
      onError={() => setFailed(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  awaiting,
  isLoading,
  onButton,
}: {
  message: SandboxMessage;
  awaiting: SandboxAwaiting | null;
  isLoading: boolean;
  onButton: (buttonId: string) => void;
}) {
  const canClick = awaiting?.kind === "button" && !isLoading;
  const { toast } = useToast();

  const chip = (b: { id: string; title: string; type: string; url?: string; phone_number?: string; copy_code?: string }) => {
    const isQuickReply = b.type === "quick_reply";
    const handleClick = () => {
      if (isQuickReply) {
        onButton(b.id);
        return;
      }
      if (b.type === "call") {
        toast({ title: `📞 In WhatsApp, this would call ${b.phone_number || ""}` });
      } else if (b.type === "url") {
        toast({ title: `🔗 In WhatsApp, this would open ${b.url || ""}` });
      } else if (b.type === "copy") {
        toast({ title: `📋 In WhatsApp, this would copy "${b.copy_code || ""}"` });
      }
    };
    return (
      <Button
        key={b.id}
        size="sm"
        variant={isQuickReply ? "default" : "outline"}
        className="h-7 text-xs"
        disabled={isQuickReply ? !canClick : isLoading}
        onClick={handleClick}
        title={isQuickReply ? undefined : "Sandbox preview — no real action is taken"}
      >
        {b.type === "call" || b.type === "phone_number" ? <Phone className="h-3 w-3 mr-1" /> : null}
        {b.type === "url" ? <LinkIcon className="h-3 w-3 mr-1" /> : null}
        {b.type === "copy" ? <Copy className="h-3 w-3 mr-1" /> : null}
        {b.title}
      </Button>
    );
  };

  const header = message.headerText ? (
    <p className="text-xs font-medium mb-1 break-words">{message.headerText}</p>
  ) : null;
  const footer = message.footerText ? (
    <p className="text-[10px] text-muted-foreground mt-1 break-words">{message.footerText}</p>
  ) : null;

  let body: React.ReactNode = null;

  switch (message.type) {
    case "text":
      body = <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>;
      break;

    case "buttons":
      body = (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
          {(message.buttons || []).map(chip)}
        </div>
      );
      break;

    case "list":
      body = (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
          {(message.sections || []).map((s, i) => (
            <div key={i} className="border rounded-md overflow-hidden">
              <div className="px-2 py-1 bg-muted text-xs font-medium break-words">{s.title}</div>
              {s.rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-sm border-t hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!canClick}
                  onClick={() => onButton(r.id)}
                >
                  <div className="font-medium break-words">{r.title}</div>
                  {r.description ? (
                    <div className="text-xs text-muted-foreground break-words">{r.description}</div>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
          {message.buttonLabel ? (
            <p className="text-[10px] text-muted-foreground break-words">{message.buttonLabel}</p>
          ) : null}
        </div>
      );
      break;

    case "call_to_action_buttons":
      body = (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
          {(message.buttons || []).map(chip)}
        </div>
      );
      break;

    case "carousel":
      body = (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(message.cards || []).map((card, i) => (
              <div key={i} className="min-w-[180px] max-w-[200px] border rounded-md p-2 flex-shrink-0 space-y-1.5">
                {card.media ? (
                  <CardImage src={card.media} />
                ) : (
                  <div className="h-20 w-full rounded bg-muted flex items-center justify-center overflow-hidden">
                    <Paperclip className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                {card.text ? <p className="text-xs whitespace-pre-wrap break-words">{card.text}</p> : null}
                <div className="flex flex-wrap gap-1">
                  {card.buttons.map(chip)}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      break;

    case "media":
      body = (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{message.mediaType || "Media"}</span>
          </div>
          {isImageMedia(message.mediaType) && message.url ? (
            <MediaImage src={message.url} />
          ) : message.url ? (
            <p className="text-xs text-muted-foreground break-all">{message.url}</p>
          ) : null}
          {message.caption ? (
            <p className="text-xs text-muted-foreground break-words">{message.caption}</p>
          ) : null}
        </div>
      );
      break;

    case "location":
      body = (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>
              {message.lat}, {message.lng}
            </span>
          </div>
          {message.name ? <p className="font-medium break-words">{message.name}</p> : null}
          {message.address ? <p className="text-xs text-muted-foreground break-words">{message.address}</p> : null}
          {typeof message.lat === "number" && typeof message.lng === "number" ? (
            <a
              className="text-xs text-primary underline"
              href={`https://maps.google.com/?q=${message.lat},${message.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              Open in maps
            </a>
          ) : null}
        </div>
      );
      break;

    default:
      body = <p className="whitespace-pre-wrap break-words text-sm">{message.text ?? ""}</p>;
  }

  return (
    <div className="rounded-lg border bg-muted/40 p-2.5 space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground truncate">{message.nodeType}</span>
        <Badge variant="secondary" className="shrink-0 text-[10px] h-4 px-1.5">
          Preview
        </Badge>
      </div>
      {header}
      {body}
      {footer}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function WorkflowTestPanel({
  workflowId,
  definitionJson,
  entryNodeId,
  onSelectNode,
  onClose,
}: WorkflowTestPanelProps) {
  const { toast } = useToast();

  const [cursor, setCursor] = useState<string | null>(null);
  const [context, setContext] = useState<Record<string, any>>({});
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [tickMarkers, setTickMarkers] = useState<number[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "awaiting" | "done" | "stopped">("idle");
  const [awaiting, setAwaiting] = useState<SandboxAwaiting | null>(null);
  const [stopReason, setStopReason] = useState<StopReason | undefined>(undefined);
  const [httpMode, setHttpMode] = useState<"mock" | "live">("mock");
  const [textInput, setTextInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickStartedAt, setTickStartedAt] = useState<number | null>(null);
  const [slowHint, setSlowHint] = useState(false);

  // Session values read by runTick (refs avoid stale-closure on restart).
  const sessionRef = useRef<{
    cursor: string | null;
    context: Record<string, any>;
    httpMode: "mock" | "live";
    trace: TraceEntry[];
  }>({ cursor: null, context: {}, httpMode: "mock", trace: [] });
  const busyRef = useRef(false);
  const idRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const nextId = () => `i${idRef.current++}`;

  const runTick = async (input: SandboxTickInput) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsLoading(true);
    setError(null);
    setStatus("running");
    setTickStartedAt(Date.now());
    setSlowHint(false);
    try {
      const res = await tick({
        workflowId,
        definitionJson,
        entryNodeId: entryNodeId ?? null,
        cursor: sessionRef.current.cursor,
        context: sessionRef.current.context,
        input,
        httpMode: sessionRef.current.httpMode,
      });

      sessionRef.current.cursor = res.cursor;
      sessionRef.current.context = res.context;

      const prevTraceLen = sessionRef.current.trace.length;
      sessionRef.current.trace = [...sessionRef.current.trace, ...res.trace];
      setTickMarkers((m) => [...m, prevTraceLen]);
      setTrace(sessionRef.current.trace);

      setCursor(res.cursor);
      setContext(res.context);
      setTranscript((t) => [
        ...t,
        ...res.messages.map((message): TranscriptItem => ({ kind: "bot", id: nextId(), message })),
      ]);
      setAwaiting(res.awaiting);
      setStopReason(res.stopReason);
      setStatus(res.status === "awaiting_input" ? "awaiting" : res.status === "done" ? "done" : "stopped");
    } catch (e) {
      let message = "Unexpected error";
      if (e instanceof SandboxApiError) {
        if (e.status === 429) {
          message = `Too many requests — ${retryAfterMessage(e.retryAfter)}`;
        } else {
          message = e.message;
        }
      } else if (e instanceof Error) {
        message = e.message;
      }
      setError(message);
      toast({ title: "Test panel error", description: message, variant: "destructive" });
      setStatus("idle");
    } finally {
      busyRef.current = false;
      setIsLoading(false);
      setTickStartedAt(null);
    }
  };

  const handleRestart = () => {
    sessionRef.current.cursor = null;
    sessionRef.current.context = {};
    sessionRef.current.trace = [];
    setCursor(null);
    setContext({});
    setTranscript([]);
    setTrace([]);
    setTickMarkers([]);
    setStatus("idle");
    setAwaiting(null);
    setStopReason(undefined);
    setError(null);
    setTextInput("");
    runTick({ type: "start" });
  };

  const handleButtonClick = (buttonId: string) => {
    if (awaiting?.kind !== "button" || isLoading) return;
    runTick({ type: "button", buttonId });
  };

  const handleTextSubmit = () => {
    const text = textInput.trim();
    if (awaiting?.kind !== "text" || isLoading || !text) return;
    setTranscript((t) => [...t, { kind: "user", id: nextId(), text }]);
    setTextInput("");
    runTick({ type: "text", text });
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [transcript]);

  // Show a "taking longer than expected" hint after 10s of loading.
  useEffect(() => {
    if (tickStartedAt === null) {
      setSlowHint(false);
      return;
    }
    const id = setTimeout(() => setSlowHint(true), 10_000);
    return () => clearTimeout(id);
  }, [tickStartedAt]);

  // start-node label for the badge (display only)
  const startNodeId = resolveStartNodeId(definitionJson, entryNodeId);
  const startNode = startNodeId
    ? (definitionJson.nodes || []).find((n) => n?.id === startNodeId)
    : null;
  const startLabel = startNode ? (startNode.data?.label || startNodeId) : "none";

  const variables = flattenContext(context);
  const canSendText = awaiting?.kind === "text" && !isLoading;

  if (!workflowId) {
    return (
      <Card className="flex h-full w-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Workflow id missing</p>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-none border-0">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b flex-shrink-0">
        <TestTube className="h-4 w-4 text-primary shrink-0" />
        <span className="font-semibold text-sm">Test flow</span>
        <Select
          value={httpMode}
          onValueChange={(v) => {
            const mode = v as "mock" | "live";
            setHttpMode(mode);
            sessionRef.current.httpMode = mode;
          }}
          disabled={isLoading}
        >
          <SelectTrigger className="h-7 w-[88px] text-xs" data-testid="select-test-panel-http-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mock">mock</SelectItem>
            <SelectItem value="live">live</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 text-xs"
          onClick={handleRestart}
          data-testid="button-test-panel-restart"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Restart
        </Button>
        {onClose ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onClose}
            title="Close test panel"
            data-testid="button-test-panel-close"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {/* Status badge */}
      <div className="px-3 pt-2 flex-shrink-0">
        <Badge variant="secondary" className="text-[10px]">
          ● Running draft · start: {startLabel}
        </Badge>
      </div>

      {/* Banners */}
      {error ? (
        <div className="px-3 pt-2 flex-shrink-0">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
            {error}
          </div>
        </div>
      ) : null}
      {status === "stopped" && !error ? (
        <div className="px-3 pt-2 flex-shrink-0">
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
            {(() => {
              if (stopReason !== "unsupported_node") return "Flow stopped — see trace";
              // Find the stopped trace entry to determine the actual node type
              const stoppedEntry = [...trace].reverse().find(t => t.outcome === "stopped");
              const nodeType = stoppedEntry?.nodeType || "unknown";
              if (nodeType.startsWith("booking.")) {
                return "Flow stopped — see trace (Booking nodes are not executed in the sandbox.)";
              }
              return `Flow stopped — see trace (Unsupported node type: "${nodeType}". Replace or remove this node to run the full flow in the sandbox.)`;
            })()}
          </div>
        </div>
      ) : null}

      {/* Transcript */}
      <div className="flex-1 min-h-0 px-3 py-2">
        {status === "idle" && transcript.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-muted-foreground">
            <TestTube className="h-10 w-10 opacity-20" />
            <p className="text-sm">Click Restart to begin</p>
            <Button size="sm" onClick={handleRestart} data-testid="button-test-panel-restart">
              <RefreshCw className="h-4 w-4 mr-2" />
              Restart
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-full overflow-x-hidden">
            <div className="space-y-2 pr-2 pb-2">
              {transcript.map((item) =>
                item.kind === "bot" ? (
                  <MessageBubble
                    key={item.id}
                    message={item.message}
                    awaiting={awaiting}
                    isLoading={isLoading}
                    onButton={handleButtonClick}
                  />
                ) : (
                  <div key={item.id} className="flex justify-end">
                    <div className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm max-w-[85%] whitespace-pre-wrap break-words">
                      {item.text}
                    </div>
                  </div>
                )
              )}
              {isLoading ? (
                <p className="text-xs text-muted-foreground">…</p>
              ) : null}
              {isLoading && slowHint ? (
                <p className="text-[10px] text-muted-foreground">Taking longer than expected…</p>
              ) : null}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-3 flex-shrink-0 space-y-2">
        <div className="flex gap-2">
          <Input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleTextSubmit();
              }
            }}
            placeholder={
              awaiting?.kind === "text" ? "Type a message…" : "Flow is not awaiting text input"
            }
            disabled={!canSendText}
            className="h-8 text-xs"
            data-testid="input-test-panel-text"
          />
          <Button
            size="sm"
            className="h-8"
            onClick={handleTextSubmit}
            disabled={!canSendText}
            data-testid="button-test-panel-send"
          >
            <Send className="h-3 w-3 mr-1" />
            Send
          </Button>
        </div>

        {/* Variables */}
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-3.5 w-3.5" />
            Variables ({variables.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1">
            {variables.length === 0 ? (
              <p className="text-xs text-muted-foreground px-4 py-1">
                No variables yet. (Your captured test data appears here.)
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-md border">
                {variables.map(({ path, value }) => (
                  <VariableRow key={path} path={path} value={value} />
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Trace */}
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-3.5 w-3.5" />
            Trace ({trace.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1">
            {trace.length === 0 ? (
              <p className="text-xs text-muted-foreground px-4 py-1">No trace entries yet.</p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-md border">
                {trace.map((entry, i) => {
                  const isTickStart = tickMarkers.includes(i) && i !== 0;
                  return (
                    <div key={`${i}-${entry.nodeId}-${entry.seq}`}>
                      {isTickStart ? (
                        <div className="px-2 py-1 bg-muted/60 text-[10px] text-muted-foreground border-y">
                          — next tick —
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1 text-xs border-b last:border-b-0 hover:bg-accent"
                        onClick={() => onSelectNode?.(entry.nodeId)}
                        data-testid={`trace-row-${entry.seq}`}
                      >
                        <span className="font-mono text-muted-foreground mr-1">#{entry.seq}</span>
                        <span className={`font-medium ${OUTCOME_STYLE[entry.outcome] ?? "text-muted-foreground"}`}>
                          {entry.outcome}
                        </span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="font-mono truncate">{entry.nodeType}</span>
                        {entry.handle ? (
                          <span className="text-muted-foreground"> → {entry.handle}</span>
                        ) : null}
                        {typeof entry.ms === "number" ? (
                          <span className="text-muted-foreground"> ({entry.ms}ms)</span>
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        <Separator />
        <p className="text-[10px] text-muted-foreground leading-snug">
          Tests flow logic and variables only — messages are not delivered, bookings are not
          created. Live mode makes real requests, bound by your HTTP allowlist.
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Variable row
// ---------------------------------------------------------------------------

function VariableRow({ path, value }: { path: string; value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const raw = formatValue(value);
  const isReserved = RESERVED_KEYS.has(rootSegment(path));
  const tooLong = raw.length > 500;

  return (
    <div className="px-2 py-1 border-b last:border-b-0 text-xs">
      <div className="flex items-start gap-1.5">
        <span className="font-mono text-muted-foreground break-all">{path}</span>
        {isReserved ? (
          <Badge variant="secondary" className="shrink-0 text-[9px] h-3.5 px-1">
            internal
          </Badge>
        ) : null}
      </div>
      <div className="mt-0.5 break-all text-foreground">
        {tooLong && !expanded ? `${raw.slice(0, 500)}… ` : raw}
        {tooLong ? (
          <button
            type="button"
            className="text-primary underline"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "show less" : "show more"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
