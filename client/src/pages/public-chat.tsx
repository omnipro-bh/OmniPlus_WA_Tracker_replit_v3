// client/src/pages/public-chat.tsx
//
// Phase 4A-3a-3 — visitor-facing web chat at /chat/:token.
//
// Standalone page (no DashboardLayout, no ProtectedRoute), mirroring
// public-share.tsx. The token in the URL is the capability: it authorises
// CREATING a session; the HttpOnly `chat_session` cookie authenticates every
// later request. The client never stores the token anywhere.
//
// Backend contract (Phase 4A-3a-2, server/routes.ts:6832-7106):
//   410 = conversation ended      401 = cookie/JWT gone (GET /session, or ended)
//   404 = link gone/disabled      503 = workflow deactivated
//   409 busy = mutex, retry       409 not_awaiting_text = flow moved to buttons
//   429 = rate limit (Retry-After)  400 button_not_routed = stale button
//
// Design decisions recorded in the a-3 investigation:
//   • Append POST/restart responses immediately (they carry the bot rows), then
//     advance the poll cursor to max(id). Never wait for the next poll.
//   • mergeMessages by id — a poll that overlaps a send cannot duplicate rows.
//   • 2s visible / 10s hidden polling, exponential backoff capped at 30s.
//   • Stop polling 60s after a terminal status with no activity (a terminal
//     conversation can only grow when the visitor sends something).
//   • Poll results never overwrite status/awaiting while a mutation is pending.
//   • No booking UI and no booking logic — the backend gate is the source of truth.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRoute } from "wouter";
import { AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PhoneFrame } from "@/components/chat/phone-frame";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatLeftPanel, ChatMobileIntro } from "@/components/chat/chat-left-panel";
import { DEFAULT_CHAT_PAGE_COPY } from "@/lib/chat-page-config";
import {
  ChatApiError,
  bootstrapChat,
  endChat,
  fetchChatMessages,
  maxMessageId,
  mergeMessages,
  newClientMsgId,
  restartWithBusyRetry,
  retryAfterSeconds,
  sendWithBusyRetry,
  type ChatAwaiting,
  type ChatMessage,
  type ChatPageMeta,
  type ChatSendInput,
  type ChatSendPayload,
  type ChatStatus,
} from "@/lib/chat-api";

// ---------------------------------------------------------------------------
// Polling constants
// ---------------------------------------------------------------------------

const POLL_VISIBLE_MS = 2_000;
const POLL_HIDDEN_MS = 10_000;
const POLL_MAX_BACKOFF_MS = 30_000;
const IDLE_STOP_MS = 60_000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type ChatPhase =
  | "loading"
  | "ready"
  | "ended"
  | "expired"
  | "unavailable"
  | "maintenance"
  | "error";

export interface ChatViewState {
  phase: ChatPhase;
  sessionId: number | null;
  status: ChatStatus | null;
  awaiting: ChatAwaiting | null;
  canRestart: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  meta: ChatPageMeta | null;
  messages: ChatMessage[];
  nextSinceId: number;
  pending: null | "send" | "restart" | "end";
  rateLimitedUntil: number | null;
  inlineHint: string | null;
  error: string | null;
}

const INITIAL_STATE: ChatViewState = {
  phase: "loading",
  sessionId: null,
  status: null,
  awaiting: null,
  canRestart: false,
  startedAt: null,
  expiresAt: null,
  meta: null,
  messages: [],
  nextSinceId: 0,
  pending: null,
  rateLimitedUntil: null,
  inlineHint: null,
  error: null,
};

// ---------------------------------------------------------------------------
// useCountdown — seconds left until an epoch-ms deadline
// ---------------------------------------------------------------------------

function useCountdown(until: number | null): number {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!until) {
      setLeft(0);
      return;
    }
    const update = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [until]);

  return left;
}

// ---------------------------------------------------------------------------
// usePublicChat — bootstrap + transcript + poll loop + actions
// ---------------------------------------------------------------------------

function usePublicChat(token: string) {
  const [state, setState] = useState<ChatViewState>(INITIAL_STATE);
  const [draft, setDraft] = useState("");

  // Latest state for the timer callbacks (no effect re-subscription per render).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const aliveRef = useRef(true);
  const sinceRef = useRef(0); // single source of truth for the poll cursor
  const inFlightRef = useRef(false); // a poll never overlaps itself
  const pendingRef = useRef<null | "send" | "restart" | "end">(null);
  const backoffRef = useRef<number>(POLL_VISIBLE_MS);
  const timerRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  // A failed send keeps its clientMsgId so a retry cannot duplicate the row.
  const failedRef = useRef<{ key: string; payload: ChatSendPayload } | null>(null);

  const rateLimitLeft = useCountdown(state.rateLimitedUntil);

  useEffect(() => {
    if (state.rateLimitedUntil != null && rateLimitLeft <= 0) {
      setState((prev) => ({ ...prev, rateLimitedUntil: null }));
    }
  }, [rateLimitLeft, state.rateLimitedUntil]);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function schedule(delayMs: number) {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      void tick();
    }, delayMs);
  }

  function transition(phase: ChatPhase, error: string | null = null) {
    clearTimer();
    pendingRef.current = null;
    setState((prev) => ({ ...prev, phase, error, pending: null }));
  }

  /**
   * Merge a batch from ANY endpoint, advance the cursor, and apply the state —
   * except from a poll that raced a mutation (its `status`/`awaiting` are stale).
   */
  function applyBatch(
    messages: ChatMessage[] | undefined,
    status: ChatStatus | null,
    awaiting: ChatAwaiting | null,
    source: "bootstrap" | "poll" | "send" | "restart",
  ) {
    const batch = messages ?? [];
    const cursor = maxMessageId(batch, sinceRef.current);
    if (cursor > sinceRef.current) sinceRef.current = cursor;

    setState((prev) => {
      const staleState = source === "poll" && pendingRef.current !== null;
      const nextAwaiting = staleState ? prev.awaiting : awaiting;
      return {
        ...prev,
        phase: "ready",
        messages: mergeMessages(prev.messages, batch),
        nextSinceId: Math.max(prev.nextSinceId, cursor),
        status: staleState ? prev.status : status ?? prev.status,
        awaiting: nextAwaiting,
        // The composer becomes usable again as soon as the flow awaits text.
        inlineHint: nextAwaiting?.kind === "text" ? null : prev.inlineHint,
        error: null,
      };
    });
  }

  async function bootstrap() {
    transition("loading");
    try {
      const res = await bootstrapChat(token);
      const initial = res.messages ?? [];
      sinceRef.current = maxMessageId(initial, 0);

      setState({
        ...INITIAL_STATE,
        phase: "ready",
        sessionId: res.sessionId,
        startedAt: res.startedAt ?? null,
        expiresAt: res.expiresAt ?? null,
        meta: res.meta ?? null,
        canRestart: true,
        messages: mergeMessages([], initial),
        nextSinceId: sinceRef.current,
        status: res.status ?? null,
        awaiting: res.awaiting ?? null,
      });

      lastActivityRef.current = Date.now();
      backoffRef.current = POLL_VISIBLE_MS;
      schedule(POLL_VISIBLE_MS);
    } catch (e) {
      const err = e as ChatApiError;
      if (err.status === 404) return transition("unavailable");
      if (err.status === 503) return transition("maintenance");
      if (err.status === 429) {
        return transition(
          "error",
          `Too many chat sessions from this network. Try again in ~${Math.ceil(
            retryAfterSeconds(err, 300) / 60,
          )} min.`,
        );
      }
      transition("error", err.message || "Something went wrong. Please try again.");
    }
  }

  async function tick() {
    timerRef.current = null;
    if (!aliveRef.current) return;

    const { phase, status } = stateRef.current;
    if (phase !== "ready") return;
    if (inFlightRef.current || pendingRef.current !== null) return schedule(POLL_VISIBLE_MS);

    const terminal = status === "done" || status === "stopped";
    if (terminal && Date.now() - lastActivityRef.current > IDLE_STOP_MS) return; // idle stop

    inFlightRef.current = true;
    try {
      const res = await fetchChatMessages(sinceRef.current, 50);
      applyBatch(res.messages, res.status, res.awaiting ?? null, "poll");
      backoffRef.current = POLL_VISIBLE_MS;
    } catch (e) {
      const err = e as ChatApiError;
      if (err.status === 410) return transition("ended");
      if (err.status === 401) return transition("expired");
      if (err.status === 404) return transition("unavailable");
      if (err.status === 503) return transition("maintenance");

      if (err.status === 429) {
        backoffRef.current = Math.min(
          POLL_MAX_BACKOFF_MS,
          Math.max(retryAfterSeconds(err, 30) * 1000, backoffRef.current * 2),
        );
        setState((prev) => ({ ...prev, error: "Too many requests — slowing down." }));
      } else {
        backoffRef.current = Math.min(POLL_MAX_BACKOFF_MS, backoffRef.current * 2);
        setState((prev) => ({
          ...prev,
          error: err.message || "Connection problem — retrying…",
        }));
      }
    } finally {
      inFlightRef.current = false;
      if (aliveRef.current && stateRef.current.phase === "ready") {
        const base = document.hidden ? POLL_HIDDEN_MS : 0;
        schedule(Math.max(base, backoffRef.current));
      }
    }
  }

  /** Poll immediately (after a send/restart, or when the tab becomes visible). */
  function wake() {
    backoffRef.current = POLL_VISIBLE_MS;
    schedule(0);
  }

  function payloadFor(input: ChatSendInput): ChatSendPayload {
    const key = input.type === "text" ? `text:${input.text}` : `button:${input.buttonId}`;
    const prior = failedRef.current;
    if (prior && prior.key === key) return prior.payload;
    return { ...input, clientMsgId: newClientMsgId() };
  }

  /** Map a transport/HTTP failure of an action to UI state. Returns true if handled. */
  function handleActionError(err: ChatApiError, key: string, payload: ChatSendPayload): boolean {
    if (err.status === 410) {
      transition("ended");
      return true;
    }
    if (err.status === 401) {
      transition("expired");
      return true;
    }
    if (err.status === 404) {
      transition("unavailable");
      return true;
    }
    if (err.status === 503) {
      transition("maintenance");
      return true;
    }
    if (err.status === 429) {
      setState((prev) => ({
        ...prev,
        rateLimitedUntil: Date.now() + retryAfterSeconds(err, 30) * 1000,
        error: null,
      }));
      return true;
    }
    if (err.status === 409 && err.message === "not_awaiting_text") {
      setState((prev) => ({
        ...prev,
        inlineHint: "Please choose an option above.",
        error: null,
      }));
      wake();
      return true;
    }
    if (err.status === 400 && err.message === "button_not_routed") {
      setState((prev) => ({
        ...prev,
        inlineHint: "That option is no longer available.",
        error: null,
      }));
      wake();
      return true;
    }
    if (err.status === 409) {
      // Busy after every retry — the previous run is still executing.
      setState((prev) => ({
        ...prev,
        error: "Still working on your last message — please try again in a moment.",
      }));
      wake();
      return true;
    }

    // Generic / network failure: keep the payload so a retry is idempotent.
    failedRef.current = { key, payload };
    setState((prev) => ({ ...prev, error: err.message || "Could not send your message." }));
    return true;
  }

  async function sendInput(input: ChatSendInput) {
    if (pendingRef.current !== null) return;
    const payload = payloadFor(input);
    const key = input.type === "text" ? `text:${input.text}` : `button:${input.buttonId}`;

    pendingRef.current = "send";
    setState((prev) => ({ ...prev, pending: "send", error: null, inlineHint: null }));

    try {
      // Busy retries reuse payload.clientMsgId — the server replays, never duplicates.
      const res = await sendWithBusyRetry(payload);
      applyBatch(res.messages, res.status, res.awaiting ?? null, "send");
      failedRef.current = null;
      if (input.type === "text") setDraft("");
      lastActivityRef.current = Date.now();
      wake();
    } catch (e) {
      handleActionError(e as ChatApiError, key, payload);
    } finally {
      pendingRef.current = null;
      setState((prev) => ({ ...prev, pending: null }));
    }
  }

  async function restart() {
    if (pendingRef.current !== null) return;
    const payload: ChatSendPayload = { type: "text", text: "", clientMsgId: newClientMsgId() };

    pendingRef.current = "restart";
    setState((prev) => ({ ...prev, pending: "restart", error: null, inlineHint: null }));

    try {
      const res = await restartWithBusyRetry();
      // The transcript is preserved server-side: APPEND the new entry rows.
      applyBatch(res.messages, res.status, res.awaiting ?? null, "restart");
      failedRef.current = null;
      setDraft("");
      lastActivityRef.current = Date.now();
      wake();
    } catch (e) {
      handleActionError(e as ChatApiError, "restart", payload);
    } finally {
      pendingRef.current = null;
      setState((prev) => ({ ...prev, pending: null }));
    }
  }

  async function leaveChat() {
    if (pendingRef.current !== null) return;
    pendingRef.current = "end";
    setState((prev) => ({ ...prev, pending: "end" }));

    // Always 200 server-side; endChat() swallows transport failures too.
    await endChat();

    pendingRef.current = null;
    sinceRef.current = 0;
    setState((prev) => ({ ...prev, pending: null, awaiting: null, status: null }));
    transition("ended");
  }

  // Bootstrap on mount/token change, plus poll wake-up on tab visibility.
  useEffect(() => {
    aliveRef.current = true;
    void bootstrap();

    const onVisibility = () => {
      if (document.hidden) return;
      lastActivityRef.current = Date.now();
      wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      aliveRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return {
    state,
    draft,
    setDraft,
    rateLimitLeft,
    sendInput,
    restart,
    leaveChat,
    bootstrap,
  };
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background p-4">
      {children}
    </div>
  );
}

function LoadingScreen() {
  return (
    <Shell>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading…</span>
      </div>
    </Shell>
  );
}

function NoticeScreen({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <Shell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <CardTitle>{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>{message}</p>
          {children}
        </CardContent>
      </Card>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PublicChatPage() {
  const [, params] = useRoute("/chat/:token");
  const token = params?.token ?? "";

  const { state, draft, setDraft, rateLimitLeft, sendInput, restart, leaveChat, bootstrap } =
    usePublicChat(token);

  // ----- non-ready screens -----

  if (!token) {
    return (
      <NoticeScreen
        title="Link unavailable"
        message="This chat link is incomplete. Please check the link you were given."
      />
    );
  }

  if (state.phase === "loading") return <LoadingScreen />;

  if (state.phase === "unavailable") {
    return (
      <NoticeScreen
        title="Chat unavailable"
        message="This chat is no longer available. If you believe this is an error, please contact the person who shared this link."
      />
    );
  }

  if (state.phase === "maintenance") {
    return (
      <NoticeScreen
        title="Chat temporarily unavailable"
        message="This chat is being updated. Please try again in a few minutes.">
        <Button variant="outline" onClick={() => void bootstrap()} data-testid="chat-retry">
          Try again
        </Button>
      </NoticeScreen>
    );
  }

  if (state.phase === "ended" || state.phase === "expired") {
    return (
      <NoticeScreen
        title="This conversation has ended"
        message="You can start a new chat using the same link.">
        <Button onClick={() => void bootstrap()} data-testid="chat-start-new">
          Start a new chat
        </Button>
      </NoticeScreen>
    );
  }

  if (state.phase === "error") {
    return (
      <NoticeScreen title="Something went wrong" message={state.error || "Please try again."}>
        <Button onClick={() => void bootstrap()} data-testid="chat-retry">
          Try again
        </Button>
      </NoticeScreen>
    );
  }

  // ----- ready -----

  return (
    <div className="flex h-[100dvh] w-full flex-col md:grid md:grid-cols-[40%_60%]">
      {/* Left: instructions (desktop only) */}
      <aside className="hidden overflow-y-auto bg-background md:block md:p-8 lg:p-10">
        <ChatLeftPanel
          config={DEFAULT_CHAT_PAGE_COPY}
          meta={state.meta}
          onStartOver={() => void restart()}
          onEndChat={() => void leaveChat()}
        />
      </aside>

      {/* Right: phone-framed chat */}
      <section className="flex min-h-0 flex-1 flex-col bg-card/30">
        {/* Mobile instructions (collapsible) */}
        <div className="md:hidden">
          <ChatMobileIntro
            config={DEFAULT_CHAT_PAGE_COPY}
            meta={state.meta}
            onStartOver={() => void restart()}
            onEndChat={() => void leaveChat()}
          />
        </div>

        <div className="min-h-0 flex-1 md:flex md:items-center md:justify-center md:p-6">
          <PhoneFrame>
            <ChatPanel
              state={state}
              draft={draft}
              setDraft={setDraft}
              rateLimitLeft={rateLimitLeft}
              sendInput={sendInput}
              restart={restart}
              meta={state.meta}
              theme="whatsapp"
            />
          </PhoneFrame>
        </div>
      </section>
    </div>
  );
}
