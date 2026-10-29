// Industry landing page configuration.
//
// This file is PURE DATA — no React, no JSX, no icon components. That keeps it
// trivially portable (a future CMS/JSON source can replace it without touching
// the page components) and keeps bundle concerns out of the copy layer.
//
// Adding a new industry = adding one entry to `industries` below. No component
// changes required, provided the industry has nothing structurally unique.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DepartmentKey = "operations" | "marketing" | "management" | "events";

/**
 * Icon names are resolved to Lucide components by
 * `client/src/components/industry/industry-icon.tsx`.
 * Keep this union in sync with the registry there.
 */
export type IconKey =
  | "calendar"
  | "clock"
  | "users"
  | "megaphone"
  | "chart"
  | "shield"
  | "bot"
  | "messages"
  | "bell"
  | "stethoscope"
  | "fileText"
  | "workflow"
  | "checkCircle"
  | "star"
  | "zap"
  | "trendingUp"
  | "heartPulse"
  | "phone"
  | "userCheck"
  | "target"
  | "listChecks"
  | "send"
  | "sparkles"
  | "mapPin"
  | "lock"
  | "repeat"
  | "timer";

export interface IndustryPainPoint {
  title: string;
  description: string;
  icon: IconKey;
}

export interface IndustryFeature {
  title: string;
  description: string;
  icon: IconKey;
  /** Optional pill rendered next to the title, e.g. "Most requested". */
  badge?: string;
}

/**
 * Features are grouped by department. An ARRAY (not a Record) so that:
 *  - render order is authored data, not an implementation detail;
 *  - a group can be omitted entirely (a vertical with no events programme);
 *  - each group carries its own display label and tagline.
 */
export interface IndustryFeatureGroup {
  department: DepartmentKey;
  /** Human label — "Operations" for one industry, "Front Desk" for another. */
  label: string;
  tagline: string;
  icon: IconKey;
  features: IndustryFeature[];
}

export interface IndustryStat {
  /** Kept as a string so units, signs and prefixes stay editorial copy. */
  value: string;
  label: string;
  /** Attribution / caveat. Use for "illustrative" honesty. */
  note?: string;
}

export interface IndustryComplianceBadge {
  label: string;
  description: string;
  icon: IconKey;
  /** Existing on-site page only — do not invent new legal pages. */
  href?: string;
  hrefLabel?: string;
}

export interface IndustryStep {
  title: string;
  description: string;
  icon: IconKey;
}

export interface IndustryCaseStudy {
  /**
   * Hide the whole section for this industry without deleting the copy.
   * Used while a case study is still placeholder text: an obviously fake quote
   * costs more trust than a missing section.
   */
  hidden?: boolean;
  org: string;
  headline: string;
  quote: string;
  author: string;
  role: string;
  /** Optional — omit for text-only case studies (v1 for Medical). */
  imagePath?: string;
  imageAlt?: string;
  bullets: string[];
}

/**
 * Decorative WhatsApp-style mockup for the hero. Copy lives here (not in the
 * component) so the hero stays industry-agnostic. Rendered with CSS only — no
 * image asset required.
 */
export interface IndustryHeroMessage {
  from: "customer" | "business";
  text: string;
}

export interface IndustryHeroMock {
  header: string;
  status?: string;
  messages: IndustryHeroMessage[];
  inputPlaceholder?: string;
}

export interface IndustryCta {
  heading: string;
  subtext?: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export interface IndustryDemo {
  /** Button label in the "watch the demo" section. */
  label: string;
  /**
   * Public path to a self-contained animation, e.g. "/demos/medical.html".
   * `null` renders a disabled "coming soon" button and never mounts an iframe.
   */
  htmlPath: string | null;
  /** Label used while `htmlPath` is null. */
  disabledLabel: string;
  /** Small print under the button. */
  caption?: string;
  /** Dialog heading (used in Phase B). */
  modalTitle: string;
}

export interface IndustrySectionHeading {
  heading: string;
  subtext?: string;
}

/**
 * Section headings live here so that no prose is hardcoded in the section
 * components. Every section reads its heading from this block.
 */
export interface IndustrySectionCopy {
  painPoints: IndustrySectionHeading;
  demo: IndustrySectionHeading;
  capabilities: IndustrySectionHeading;
  howItWorks: IndustrySectionHeading;
  results: IndustrySectionHeading;
  compliance: IndustrySectionHeading;
  caseStudy: IndustrySectionHeading;
}

export interface IndustryConfig {
  slug: string;
  /** Short label for nav / breadcrumb / document title: "Medical". */
  title: string;
  metaTitle: string;
  metaDescription: string;
  /** Kicker above the H1. */
  eyebrow?: string;
  headline: string;
  subtext: string;
  heroBullets?: string[];
  heroMock?: IndustryHeroMock;

  painPoints: IndustryPainPoint[];
  demo: IndustryDemo;
  featureGroups: IndustryFeatureGroup[];
  howItWorks: IndustryStep[];
  stats: IndustryStat[];
  compliance: IndustryComplianceBadge[];
  caseStudy: IndustryCaseStudy;
  cta: IndustryCta;
  sectionCopy: IndustrySectionCopy;

  /**
   * Lower-case fragments matched against the `use_cases.title` rows managed in
   * the admin panel, so landing-page cards can deep-link here without a schema
   * change. Matching is normalised (case, spaces and punctuation ignored).
   */
  aliases: string[];
}

// ---------------------------------------------------------------------------
// Medical
//
// ⚠️  ALL COPY BELOW IS PLACEHOLDER / DRAFT for review. Nothing here is a
//     measured result. Stats are illustrative targets only.
// ---------------------------------------------------------------------------

const medical: IndustryConfig = {
  slug: "medical",
  title: "Medical",
  metaTitle: "WhatsApp automation for clinics and medical practices | OMNI PLUS",
  metaDescription:
    "Automate appointment booking, patient reminders and front-desk FAQs on WhatsApp — for clinics, polyclinics and specialist practices.",

  eyebrow: "For clinics, polyclinics & specialist practices",
  headline: "Take the phone queue off your front desk",
  subtext:
    "OMNI PLUS answers the questions your team answers fifty times a day, books and confirms appointments on WhatsApp, and keeps every department in one inbox.",
  heroBullets: [
    "Patients book, reschedule and cancel in chat — no app to install",
    "Reminders and recall lists send themselves",
    "One shared inbox for front desk, nursing and management",
  ],

  heroMock: {
    header: "Al Noor Clinic",
    status: "Typically replies in seconds",
    inputPlaceholder: "Type a message",
    messages: [
      { from: "customer", text: "Hi, can I book a check-up this week?" },
      { from: "business", text: "Of course. Which day suits you — Tuesday or Thursday?" },
      { from: "customer", text: "Thursday morning, if possible." },
      { from: "business", text: "Booked for Thu 9:30 AM with Dr. Rahman. Reminder 24h before 👍" },
    ],
  },

  sectionCopy: {
    painPoints: {
      heading: "What the front desk is really fighting",
      subtext: "Four problems we hear from clinics before anything is automated.",
    },
    demo: {
      heading: "See the booking flow before you read about it",
      subtext: "A short animation of a patient booking on WhatsApp.",
    },
    capabilities: {
      heading: "What each department gets",
      subtext: "The same platform, seen from the four teams that actually use it.",
    },
    howItWorks: {
      heading: "Live in four steps",
      subtext: "No developer, no new hardware, no app for patients.",
    },
    results: {
      heading: "What clinics are aiming for",
      subtext: "Illustrative targets from active pilots, not measured outcomes.",
    },
    compliance: {
      heading: "Built for a regulated waiting room",
      subtext: "The guardrails we would not ship without.",
    },
    caseStudy: {
      heading: "In a clinic's own words",
      subtext: "Pending approval from the practice named below.",
    },
  },

  painPoints: [
    {
      title: "The front desk is a switchboard",
      description:
        "Opening hours, directions, insurance, parking, “is my result ready?” — the same handful of questions, all day, by phone.",
      icon: "phone",
    },
    {
      title: "No-shows eat the schedule",
      description:
        "A patient forgets a Tuesday appointment, the slot goes empty, and the next patient waits three weeks.",
      icon: "calendar",
    },
    {
      title: "Recall lists never get called",
      description:
        "Annual reviews, follow-ups and screening reminders sit on a spreadsheet until someone has a quiet afternoon.",
      icon: "listChecks",
    },
    {
      title: "Marketing can't prove its work",
      description:
        "Campaigns go out from a staff member's personal phone, and nobody can say which one brought a patient in.",
      icon: "chart",
    },
  ],

  demo: {
    label: "Watch the chatbot demo",
    // Placeholder: the animation file is not in the repo yet.
    htmlPath: null,
    disabledLabel: "Demo coming soon",
    caption: "A 30-second WhatsApp booking flow — no signup required.",
    modalTitle: "Booking a clinic appointment on WhatsApp",
  },

  featureGroups: [
    {
      department: "operations",
      label: "Operations",
      tagline: "The front desk, minus the phone queue.",
      icon: "workflow",
      features: [
        {
          title: "Booking and rescheduling in chat",
          description:
            "Patients pick a department, a doctor and a slot inside the conversation. Confirmations resolve themselves.",
          icon: "calendar",
          badge: "Most requested",
        },
        {
          title: "Automated appointment reminders",
          description:
            "Scheduled nudges at 24 hours and 2 hours before the visit, with a one-tap option to reschedule.",
          icon: "bell",
        },
        {
          title: "FAQ auto-replies",
          description:
            "Hours, location, parking, insurance and preparation instructions answered instantly, in your own wording.",
          icon: "messages",
        },
        {
          title: "Intake before the visit",
          description:
            "Collect the details your team needs while the patient is still at home, not at the reception window.",
          icon: "listChecks",
        },
      ],
    },
    {
      department: "marketing",
      label: "Marketing",
      tagline: "Fill the quiet slots without shouting at everyone.",
      icon: "megaphone",
      features: [
        {
          title: "Segmented broadcasts",
          description:
            "Message only the patients who opted in for a given treatment, branch or language.",
          icon: "send",
        },
        {
          title: "Seasonal health packages",
          description:
            "Announce check-up bundles and screening weeks to the right segment, with a booking link attached.",
          icon: "sparkles",
        },
        {
          title: "Review and referral requests",
          description:
            "Ask for feedback a day after the visit, and route unhappy replies to a human instead of a public review.",
          icon: "star",
        },
        {
          title: "Campaign performance",
          description:
            "See delivery, replies and bookings per campaign, so the next send is a decision rather than a guess.",
          icon: "chart",
        },
      ],
    },
    {
      department: "management",
      label: "Management",
      tagline: "The whole clinic, one screen.",
      icon: "chart",
      features: [
        {
          title: "Department-level analytics",
          description:
            "Volume, response time and booking conversion split by department, branch or doctor.",
          icon: "chart",
        },
        {
          title: "Role-based staff access",
          description:
            "Front desk sees bookings; management sees reporting. Nobody sees more than their role needs.",
          icon: "lock",
        },
        {
          title: "Response-time visibility",
          description:
            "Know when a conversation has been waiting too long, before the patient chases you.",
          icon: "timer",
        },
        {
          title: "Clean handover to a human",
          description:
            "The bot escalates with the full thread attached, so the patient never repeats themselves.",
          icon: "userCheck",
        },
      ],
    },
    {
      department: "events",
      label: "Events",
      tagline: "Camps, drives and awareness days.",
      icon: "mapPin",
      features: [
        {
          title: "Health camp registration",
          description:
            "Publish a camp, collect registrations in chat and hand the attendance list to the team.",
          icon: "mapPin",
        },
        {
          title: "Screening drive reminders",
          description:
            "Remind registrants the day before, then follow up on anyone who did not attend.",
          icon: "bell",
        },
        {
          title: "Waitlists when a drive fills up",
          description:
            "Offer the next available slot automatically instead of turning people away.",
          icon: "listChecks",
        },
        {
          title: "Post-event follow-up",
          description:
            "Send results guidance, a feedback request or the next appointment prompt in one flow.",
          icon: "repeat",
        },
      ],
    },
  ],

  howItWorks: [
    {
      title: "Connect your WhatsApp number",
      description:
        "Scan a QR code or link your business number. Setup takes minutes, not a project.",
      icon: "phone",
    },
    {
      title: "Pick a clinic conversation template",
      description:
        "Booking, reminders, FAQs or recall — start from a template and edit the wording to match your tone.",
      icon: "fileText",
    },
    {
      title: "Set hours, departments and escalation",
      description:
        "Decide what the bot handles, what waits for a human, and who gets notified when.",
      icon: "clock",
    },
    {
      title: "Go live and watch the queue shrink",
      description:
        "The front desk keeps working the same way — it just stops answering the same question forty times.",
      icon: "checkCircle",
    },
  ],

  stats: [
    {
      value: "−30%",
      label: "front-desk call volume",
      note: "Illustrative target — pilot in progress",
    },
    {
      value: "−40%",
      label: "appointment no-shows",
      note: "Illustrative target — pilot in progress",
    },
    {
      value: "< 60s",
      label: "first response time",
      note: "Illustrative target — pilot in progress",
    },
    {
      value: "24/7",
      label: "booking availability",
      note: "Illustrative target — pilot in progress",
    },
  ],

  compliance: [
    {
      label: "Consent before the first message",
      description:
        "Patients opt in before anything marketing-shaped is sent. Opt-outs are honoured automatically.",
      icon: "checkCircle",
      href: "/privacy-policy",
      hrefLabel: "How we handle consent",
    },
    {
      label: "No clinical detail in chat",
      description:
        "Conversation flows are designed to route diagnoses and results to a secure channel, not to a message thread.",
      icon: "shield",
      href: "/privacy-policy",
      hrefLabel: "Privacy policy",
    },
    {
      label: "WhatsApp Business Policy",
      description:
        "Templates, messaging windows and opt-in rules follow WhatsApp's platform policy, not workarounds.",
      icon: "fileText",
      href: "/terms-conditions",
      hrefLabel: "Terms & conditions",
    },
    {
      label: "Audit trail and access control",
      description:
        "Every send, template change and staff action is logged, with per-role permissions.",
      icon: "lock",
      href: "/terms-conditions",
      hrefLabel: "Terms of use",
    },
  ],

  caseStudy: {
    hidden: true,
    org: "Draft — clinic name to be confirmed",
    headline: "How a two-branch polyclinic cut its no-show rate",
    quote:
      "Placeholder quote for review. The intended line is about the front desk spending its day on patients in the building instead of the phone.",
    author: "Dr. [Name to confirm]",
    role: "Medical Director",
    imageAlt: "",
    bullets: [
      "Draft — reminders moved from manual calls to automated WhatsApp nudges",
      "Draft — one shared inbox replaced three staff phones",
      "Draft — camp registrations handled entirely in chat",
    ],
  },

  cta: {
    heading: "Ready to take the phone queue off your front desk?",
    subtext:
      "Book a demo, or see how the same flow works for other industries.",
    primaryLabel: "Book a Demo",
    primaryHref: "mailto:support@omniplus-bh.com",
    secondaryLabel: "See all use cases",
    secondaryHref: "/#use-cases",
  },

  // Matches the live admin row "Health & Wellness business" (id 3).
  aliases: ["medical", "health", "healthcare", "health & wellness", "wellness", "clinic", "hospital"],
};

// ---------------------------------------------------------------------------
// Registry + helpers
// ---------------------------------------------------------------------------

export const industries: Record<string, IndustryConfig> = {
  medical,
};

/** Ordered list for future index pages / nav menus. */
export const industryList: IndustryConfig[] = Object.values(industries);

export function getIndustry(slug?: string | null): IndustryConfig | undefined {
  return slug ? industries[slug] : undefined;
}

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Maps a `use_cases.title` row (admin-managed, e.g. "Health & Wellness
 * business") onto an industry config. Returns undefined when the row has no
 * matching industry — callers must degrade gracefully.
 */
export function resolveIndustryByTitle(title: string): IndustryConfig | undefined {
  const needle = normalize(title);
  if (!needle) return undefined;
  return industryList.find((industry) =>
    industry.aliases.some((alias) => needle.includes(normalize(alias))),
  );
}
