// client/src/components/chat/chat-left-panel.tsx
//
// The instructional panel for the public chat page. Fully config-driven — every
// string comes from a ChatPageCopy object (see client/src/lib/chat-page-config.ts).
//
//   ChatLeftPanel   — full side panel (desktop, 40% column).
//   ChatMobileIntro — collapsible card shown above the chat on mobile.

import { useState } from "react";
import { ChevronDown, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatPageCopy } from "@/lib/chat-page-config";
import type { ChatPageMeta } from "@/lib/chat-api";

interface ChatLeftPanelProps {
  config: ChatPageCopy;
  meta?: ChatPageMeta | null;
  onStartOver: () => void;
  onEndChat: () => void;
}

function resolveHeading(config: ChatPageCopy, meta?: ChatPageMeta | null): string {
  return meta?.linkLabel || meta?.workflowName || config.heading;
}

export function ChatLeftPanel({ config, meta, onStartOver, onEndChat }: ChatLeftPanelProps) {
  const heading = resolveHeading(config, meta);

  return (
    <div className="flex flex-col gap-7">
      {/* Small logo mark, top-left */}
      <div className="flex items-center gap-2" data-testid="chat-brand">
        <MessageSquare className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight">OMNI PLUS</span>
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
          {heading}
        </h1>
        <p className="text-base text-muted-foreground">{config.subtext}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          How to use
        </h2>
        <ol className="space-y-3">
          {config.howToUse.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <span className="text-sm text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Important notes
        </h2>
        <ul className="space-y-2.5">
          {config.importantNotes.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="text-sm text-muted-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-2">
        <Button onClick={onStartOver} className="w-full" data-testid="chat-restart">
          {config.startOverLabel}
        </Button>
        <p className="text-xs text-muted-foreground">
          Your previous messages stay in the transcript.
        </p>
        <button
          type="button"
          onClick={onEndChat}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          End chat
        </button>
      </div>

      <a
        href={config.contact.href}
        className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        data-testid="chat-contact"
      >
        {config.contact.label}
      </a>

      {config.poweredBy ? (
        <p className="pt-6 text-xs text-muted-foreground">{config.poweredBy}</p>
      ) : null}
    </div>
  );
}

export function ChatMobileIntro({ config, meta, onStartOver, onEndChat }: ChatLeftPanelProps) {
  const [open, setOpen] = useState(false);
  const heading = resolveHeading(config, meta);

  return (
    <Card className="rounded-none border-x-0 border-t-0 bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
        data-testid="chat-howto-toggle"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{heading}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {open ? "Hide instructions" : "How to use"}
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <CardContent className="space-y-4 border-t pb-4 pt-3">
          <p className="text-sm text-muted-foreground">{config.subtext}</p>
          <ol className="space-y-2">
            {config.howToUse.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="text-sm text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
          <div className="space-y-2">
            <Button onClick={onStartOver} size="sm" className="w-full" data-testid="chat-restart">
              {config.startOverLabel}
            </Button>
            <p className="text-xs text-muted-foreground">
              Your previous messages stay in the transcript.
            </p>
            <button
              type="button"
              onClick={onEndChat}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              End chat
            </button>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
