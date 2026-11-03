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
  /** Bullet "Important notes" list. */
  importantNotes: string[];
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
    "Click on the start over button to start the bot menu.",
    "Navigate by clicking on message buttons.",
    "Your conversation stays private to this link.",
  ],
  importantNotes: [
    "This is only demo bot not a full product.",
    "You can reach out to us for any customizations.",
    "The bot link is active for limited time only.",
  ],
  startOverLabel: "Start over",
  contact: {
    label: "Need help?",
    href: "mailto:support@omniplus-bh.com",
  },
  poweredBy: "Powered by OMNI PLUS",
};
