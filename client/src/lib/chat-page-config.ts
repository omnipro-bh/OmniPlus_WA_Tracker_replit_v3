// client/src/lib/chat-page-config.ts
//
// Config-driven copy for the public chat page's instructional left panel.
// The panel components must never contain prose — every string is read from a
// ChatPageCopy object so the same panel can be reused for other workflows with
// different copy.

export interface ChatPageContact {
  label: string;
  /** mailto: or a URL. */
  href: string;
}

export interface ChatPageCopy {
  /** Fallback heading when the workflow/link has no name. */
  heading: string;
  subtext: string;
  /** Numbered "How to use" list. */
  howToUse: string[];
  /** Bullet "Try these" list. */
  tryThese: string[];
  startOverLabel: string;
  contact: ChatPageContact;
  /** Small print at the bottom of the panel, e.g. "Powered by OMNI PLUS". */
  poweredBy?: string;
  /** Reserved for a future language switcher. Unused in v1. */
  languages?: { code: string; label: string }[];
}

export const DEFAULT_CHAT_PAGE_COPY: ChatPageCopy = {
  heading: "How can I help?",
  subtext:
    "This assistant replies instantly — type a message or tap an option to continue.",
  howToUse: [
    "Type your question in the box below and press send.",
    "Tap a button when it appears to choose an option.",
    "Your conversation stays private to this link.",
  ],
  tryThese: [
    "Ask what this assistant can help with.",
    "Type “hello” to start.",
    "Choose one of the options shown.",
  ],
  startOverLabel: "Start over",
  contact: {
    label: "Need help?",
    href: "mailto:support@omniplus-bh.com",
  },
  poweredBy: "Powered by OMNI PLUS",
};
