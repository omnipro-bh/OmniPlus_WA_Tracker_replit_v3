// client/src/components/chat/chat-panel.tsx
//
// The WhatsApp-styled chat surface rendered inside the phone frame. Extracted
// from public-chat.tsx's "ready" branch: header, transcript, composer. No chat
// logic lives here — it is driven entirely by the props from usePublicChat.
//
// theme is forwarded to <ChatBubble> (default "whatsapp"); the phone chrome
// (green header, beige wallpaper, pill composer) is always WhatsApp-style.

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowLeft, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatBubble } from "@/components/chat/ChatBubble";
import {
  CHAT_TEXT_MAX,
  type ChatMessage,
  type ChatPageMeta,
  type ChatSendInput,
} from "@/lib/chat-api";
import type { ChatViewState } from "@/pages/public-chat";

interface ChatPanelProps {
  state: ChatViewState;
  draft: string;
  setDraft: (value: string) => void;
  rateLimitLeft: number;
  sendInput: (input: ChatSendInput) => void;
  restart: () => void;
  meta: ChatPageMeta | null;
  theme?: "default" | "whatsapp";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + second).toUpperCase();
}

export function ChatPanel({
  state,
  draft,
  setDraft,
  rateLimitLeft,
  sendInput,
  restart,
  meta,
  theme = "whatsapp",
}: ChatPanelProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(true);
  const [showNewPill, setShowNewPill] = useState(false);

  const rateLimited = rateLimitLeft > 0;
  const busy = state.pending !== null;
  const awaitingButton = state.awaiting?.kind === "button";
  const inputEnabled = state.phase === "ready" && !busy && !rateLimited && !awaitingButton;
  const terminal = state.status === "done" || state.status === "stopped";

  const name = meta?.linkLabel || meta?.workflowName || "Chat";

  const lastBotId = useMemo(() => {
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      if (state.messages[i].role === "bot") return state.messages[i].id;
    }
    return -1;
  }, [state.messages]);

  const interactiveFor = (m: ChatMessage) =>
    m.role === "bot" && m.id === lastBotId && awaitingButton && !busy && !rateLimited;

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setShowNewPill(false);
  }

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setPinned(nearBottom);
    if (nearBottom) setShowNewPill(false);
  }

  useEffect(() => {
    if (state.messages.length === 0) return;
    if (pinned) scrollToBottom("smooth");
    else setShowNewPill(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.messages.length]);

  function submitText() {
    const text = draft.trim();
    if (!text || !inputEnabled) return;
    void sendInput({ type: "text", text });
  }

  function clickButton(buttonId: string) {
    if (!awaitingButton || busy || rateLimited) return;
    void sendInput({ type: "button", buttonId });
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#efeae2]">
      {/* WhatsApp header */}
      <header className="flex items-center gap-2 bg-[#008069] px-3 py-2.5 text-white">
        <ArrowLeft className="h-5 w-5 shrink-0" aria-hidden="true" />
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/25 text-sm font-semibold"
          aria-hidden="true"
        >
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-white/80">online</p>
        </div>
      </header>

      {/* Transcript */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="flex-1 space-y-3 overflow-y-auto px-3 py-4"
        data-testid="chat-transcript"
      >
        {state.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-gray-500">
            <p>This conversation has no messages.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void restart()}
              disabled={busy}
              data-testid="chat-empty-restart"
            >
              Restart conversation
            </Button>
          </div>
        ) : (
          state.messages.map((m) => (
            <ChatBubble
              key={m.id}
              message={m}
              interactive={interactiveFor(m)}
              onButton={clickButton}
              theme={theme}
            />
          ))
        )}

        {state.pending === "send" ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-sm">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
            </div>
          </div>
        ) : null}
      </div>

      {showNewPill && !pinned ? (
        <div className="relative">
          <div className="absolute -top-12 left-0 right-0 flex justify-center">
            <Button
              size="sm"
              variant="secondary"
              className="rounded-full shadow"
              onClick={() => scrollToBottom("smooth")}
              data-testid="chat-new-messages"
            >
              <ArrowDown className="mr-1 h-3.5 w-3.5" />
              New messages
            </Button>
          </div>
        </div>
      ) : null}

      {/* Composer */}
      <footer className="flex items-end gap-2 bg-[#f0f2f5] px-3 py-2">
        {state.error ? (
          <div
            className="mb-2 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            data-testid="chat-error"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        {state.inlineHint ? (
          <p className="mb-2 text-xs text-muted-foreground" data-testid="chat-hint">
            {state.inlineHint}
          </p>
        ) : null}

        {awaitingButton ? (
          <p className="py-2 text-xs text-muted-foreground" data-testid="chat-choose-option">
            Choose an option above to continue.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitText();
            }}
            className="flex flex-1 items-end gap-2"
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitText();
                }
              }}
              placeholder={
                rateLimited
                  ? `Too many messages — try again in ${rateLimitLeft}s`
                  : terminal
                    ? "Send a message to start a new conversation…"
                    : "Type a message"
              }
              maxLength={CHAT_TEXT_MAX}
              disabled={!inputEnabled}
              rows={1}
              className="min-h-[42px] flex-1 resize-none rounded-full border-0 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:ring-0"
              data-testid="chat-input"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!inputEnabled || draft.trim().length === 0}
              aria-label="Send message"
              data-testid="chat-send"
              className="h-10 w-10 shrink-0 rounded-full bg-[#00a884] text-white hover:bg-[#00a884]/90 disabled:opacity-50"
            >
              {state.pending === "send" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </form>
        )}

        {rateLimited && !awaitingButton ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Please wait — messages will re-enable automatically.
          </p>
        ) : null}
      </footer>
    </div>
  );
}

export default ChatPanel;
