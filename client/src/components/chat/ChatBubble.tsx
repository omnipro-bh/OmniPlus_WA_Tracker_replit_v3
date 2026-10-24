// client/src/components/chat/ChatBubble.tsx
//
// Phase 4A-3a-3 — transcript row renderer for the public web chat.
//
// Contract (server/workflows/chat-host.ts):
//   PublicMessage { id, role: 'visitor'|'bot'|'system', kind: SandboxBubbleType,
//                   payload: flattened SandboxMessage, createdAt }
//
// Rules enforced here:
//   • Render by ROLE first, never by kind (deviation 8 — visitor button/list
//     clicks are stored as kind:'text' with the button title in payload.text).
//   • No raw-HTML injection anywhere (no inner-HTML escape hatch): every string
//     is a React text node.
//   • Only payload.url / buttons[].url / cards[].buttons[].url become hrefs, and
//     the server has already https-validated them (sanitizeBubblePayload).
//     No client-side URL re-validation is performed here.
//   • cards[].media / media.url are rendered as <img> only (no anchor) with an
//     onError fallback, so no URL validation is needed (deviation 9).
//   • Flow-routing controls (quick reply / list row) are clickable only for the
//     last bot message while the flow awaits a button; everything older is
//     disabled. URL buttons stay live — they do not route the flow.

import { useState } from "react";
import { Copy, Link as LinkIcon, Paperclip, Phone } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-api";
import type { SandboxButton } from "@/lib/workflow-sandbox";

export interface ChatBubbleProps {
  message: ChatMessage;
  /** True only for the last bot message while awaiting a button and nothing is pending. */
  interactive: boolean;
  onButton: (buttonId: string) => void;
}

// ---------------------------------------------------------------------------
// Image helpers (mirrors WorkflowTestPanel.tsx:147-190)
// ---------------------------------------------------------------------------

const IMAGE_MEDIA_HINTS = ["image", "photo", "picture", "png", "jpg", "jpeg", "gif", "webp"];

function isImageMedia(mediaType?: string): boolean {
  if (!mediaType) return false;
  const t = mediaType.toLowerCase();
  return IMAGE_MEDIA_HINTS.some((h) => t.includes(h));
}

/** Carousel card image with a paperclip fallback on load failure. */
function CardImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <PaperclipFallback />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="h-20 w-full object-cover rounded"
      onError={() => setFailed(true)}
    />
  );
}

/** Media-bubble image with a plain-text URL fallback (never a link). */
function MediaImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <p className="text-xs text-muted-foreground break-all">{src}</p>;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="max-h-40 w-full object-contain rounded"
      onError={() => setFailed(true)}
    />
  );
}

function PaperclipFallback() {
  return (
    <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded bg-muted">
      <Paperclip className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function ActionControl({
  button,
  interactive,
  onButton,
}: {
  button: SandboxButton;
  interactive: boolean;
  onButton: (buttonId: string) => void;
}) {
  // https-validated server-side; opening a new tab keeps the conversation alive.
  if (button.type === "url" && button.url) {
    return (
      <a
        href={button.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs hover:bg-accent"
        data-testid={`chat-link-${button.id}`}
      >
        <LinkIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{button.title}</span>
      </a>
    );
  }

  // Static chips: no tel: navigation, no clipboard access.
  if (button.type === "call" || button.type === "copy") {
    return (
      <div
        className="inline-flex w-full items-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground"
        data-testid={`chat-static-${button.id}`}
      >
        {button.type === "call" ? (
          <Phone className="h-3 w-3 shrink-0" />
        ) : (
          <Copy className="h-3 w-3 shrink-0" />
        )}
        <span className="truncate">
          {button.title}
          {button.type === "call" && button.phone_number ? ` · ${button.phone_number}` : null}
          {button.type === "copy" && button.copy_code ? ` · ${button.copy_code}` : null}
        </span>
      </div>
    );
  }

  // quick_reply — routes the flow, so it is the only control gated on `interactive`.
  return (
    <button
      type="button"
      disabled={!interactive}
      aria-disabled={!interactive}
      onClick={() => onButton(button.id)}
      className="inline-flex w-full items-center justify-start rounded-md border bg-background px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background"
      data-testid={`chat-button-${button.id}`}
    >
      <span className="truncate">{button.title}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Bubble
// ---------------------------------------------------------------------------

export function ChatBubble({ message, interactive, onButton }: ChatBubbleProps) {
  const payload = message.payload ?? {};

  // Visitor rows: right-aligned plain text. NEVER switch on `kind` here —
  // button/list clicks are persisted as kind:'text' with the title in payload.text.
  if (message.role === "visitor") {
    const visitorText = typeof payload.text === "string" ? payload.text : "";
    return (
      <div className="flex justify-end" data-testid={`chat-msg-${message.id}`}>
        <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
          {visitorText}
        </div>
      </div>
    );
  }

  // No role:'system' rows are written today, but the union documents them.
  if (message.role === "system") {
    const systemText = typeof payload.text === "string" ? payload.text : "";
    return (
      <div className="flex justify-center" data-testid={`chat-msg-${message.id}`}>
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {systemText}
        </span>
      </div>
    );
  }

  const text = typeof payload.text === "string" && payload.text.length > 0 ? payload.text : null;
  const headerText =
    typeof payload.headerText === "string" && payload.headerText.length > 0 ? payload.headerText : null;
  const footerText =
    typeof payload.footerText === "string" && payload.footerText.length > 0 ? payload.footerText : null;

  const buttons: SandboxButton[] = Array.isArray(payload.buttons) ? payload.buttons : [];
  const sections: Array<{ title?: string; rows?: Array<{ id: string; title: string; description?: string }> }> =
    Array.isArray(payload.sections) ? payload.sections : [];
  const cards: Array<{ id?: string; media?: string; text?: string; buttons?: SandboxButton[] }> =
    Array.isArray(payload.cards) ? payload.cards : [];

  let body: React.ReactNode = null;

  switch (message.kind) {
    case "buttons":
    case "call_to_action_buttons":
      body = (
        <div className="space-y-2">
          {text ? <p className="whitespace-pre-wrap break-words">{text}</p> : null}
          {buttons.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {buttons.map((b) => (
                <ActionControl key={b.id} button={b} interactive={interactive} onButton={onButton} />
              ))}
            </div>
          ) : null}
        </div>
      );
      break;

    case "list":
      body = (
        <div className="space-y-2">
          {text ? <p className="whitespace-pre-wrap break-words">{text}</p> : null}
          {sections.map((section, i) => (
            <div key={`${section.title ?? "section"}-${i}`} className="overflow-hidden rounded-md border">
              {section.title ? (
                <div className="break-words bg-muted px-2 py-1 text-xs font-medium">{section.title}</div>
              ) : null}
              {(section.rows ?? []).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  disabled={!interactive}
                  aria-disabled={!interactive}
                  onClick={() => onButton(row.id)}
                  className="w-full border-t px-2 py-1.5 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                  data-testid={`chat-row-${row.id}`}
                >
                  <div className="break-words text-sm font-medium">{row.title}</div>
                  {row.description ? (
                    <div className="break-words text-xs text-muted-foreground">{row.description}</div>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
          {typeof payload.buttonLabel === "string" && payload.buttonLabel.length > 0 ? (
            <p className="text-[11px] text-muted-foreground break-words">{payload.buttonLabel}</p>
          ) : null}
        </div>
      );
      break;

    case "carousel":
      body = (
        <div className="space-y-2">
          {text ? <p className="whitespace-pre-wrap break-words">{text}</p> : null}
          {cards.length > 0 ? (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {cards.map((card, i) => (
                <div
                  key={card.id ?? `card-${i}`}
                  className="min-w-[180px] max-w-[200px] shrink-0 space-y-1.5 rounded-md border p-2"
                >
                  {card.media ? <CardImage src={card.media} /> : <PaperclipFallback />}
                  {card.text ? (
                    <p className="whitespace-pre-wrap break-words text-xs">{card.text}</p>
                  ) : null}
                  {(card.buttons ?? []).length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {(card.buttons ?? []).map((b) => (
                        <ActionControl key={b.id} button={b} interactive={interactive} onButton={onButton} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
      break;

    case "media":
      body = (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{payload.mediaType || "Media"}</span>
          </div>
          {typeof payload.url === "string" && payload.url.length > 0 ? (
            isImageMedia(payload.mediaType) ? (
              <MediaImage src={payload.url} />
            ) : (
              <p className="text-xs text-muted-foreground break-all">{payload.url}</p>
            )
          ) : null}
          {typeof payload.caption === "string" && payload.caption.length > 0 ? (
            <p className="whitespace-pre-wrap break-words text-xs">{payload.caption}</p>
          ) : null}
        </div>
      );
      break;

    case "location":
      body = (
        <div className="space-y-1">
          {typeof payload.name === "string" && payload.name.length > 0 ? (
            <p className="break-words text-sm font-medium">{payload.name}</p>
          ) : null}
          {typeof payload.address === "string" && payload.address.length > 0 ? (
            <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {payload.address}
            </p>
          ) : null}
          {Number.isFinite(payload.lat) && Number.isFinite(payload.lng) ? (
            <p className="text-[11px] text-muted-foreground">
              {payload.lat}, {payload.lng}
            </p>
          ) : null}
        </div>
      );
      break;

    case "text":
    default:
      body = text ? <p className="whitespace-pre-wrap break-words">{text}</p> : null;
      break;
  }

  // Nothing renderable (e.g. an empty bubble) → omit the frame entirely.
  if (!body && !headerText && !footerText) return null;

  return (
    <div className="flex justify-start" data-testid={`chat-msg-${message.id}`}>
      <div className="max-w-[85%] space-y-1.5 rounded-2xl rounded-bl-sm border bg-card px-3 py-2 text-sm">
        {headerText ? <p className="break-words text-xs font-medium">{headerText}</p> : null}
        {body}
        {footerText ? (
          <p className="break-words text-[11px] text-muted-foreground">{footerText}</p>
        ) : null}
      </div>
    </div>
  );
}

export default ChatBubble;
