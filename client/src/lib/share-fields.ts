import type { ShareLinkConfig } from "@shared/schema";

// ---------------------------------------------------------------------------
// Feature 3G-5 — shared field metadata for the public share-link page.
// The labels/order below are duplicated from share-links-settings.tsx
// (STANDARD_FIELDS / STATUS_LABELS) because the owner UI is intentionally left
// untouched this phase. The field ORDER must stay in sync with the server's
// SHARE_FIELD_ORDER (server/share-links.ts) so the list columns line up with
// the CSV export.
// ---------------------------------------------------------------------------

// Canonical field order (matches server/share-links.ts SHARE_FIELD_ORDER).
export const SHARE_FIELD_ORDER: string[] = [
  "slotDate",
  "endDate",
  "startTime",
  "endTime",
  "endDayTime",
  "status",
  "bookingLabel",
  "customerName",
  "customerPhone",
  "service",
  "provider",
];

export const STANDARD_FIELD_LABELS: Record<string, string> = {
  slotDate: "Date",
  endDate: "End date",
  startTime: "Start time",
  endTime: "End time",
  endDayTime: "Last day time",
  status: "Status",
  bookingLabel: "Booking label",
  customerName: "Customer name",
  customerPhone: "Customer phone",
  service: "Service",
  provider: "Provider",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
};

// Mirrors the owner dashboard's getStatusBadgeVariant (booking-scheduler.tsx).
export function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "confirmed":
      return "default";
    case "pending":
      return "secondary";
    case "cancelled":
      return "destructive";
    case "completed":
      return "outline";
    case "no_show":
      return "destructive";
    default:
      return "secondary";
  }
}

type FieldPerm = "hidden" | "read" | "write";

function perm(config: ShareLinkConfig, key: string): FieldPerm {
  return config.fieldPermissions?.[key] ?? "hidden";
}

// Visible standard field keys (non-hidden), in canonical order.
export function visibleFieldKeys(config: ShareLinkConfig): string[] {
  return SHARE_FIELD_ORDER.filter((k) => perm(config, k) !== "hidden");
}

// Visible user-defined custom field ids, sorted ascending (stable column order).
// Only ids present in `customFieldNames` are rendered, so ghost permissions the
// owner never configured (e.g. after "Set all visible to Read") don't produce
// empty columns. Calculation fields are computed (never stored), so they're
// excluded from columns too.
export function visibleCustomFieldIds(
  config: ShareLinkConfig,
  customFieldNames: Record<number, string>,
  customFieldTypes: Record<number, string>,
  customFieldOrder: number[] = [],
): number[] {
  const perms = config.fieldPermissions || {};
  const names = customFieldNames || {};
  const types = customFieldTypes || {};
  const orderIndex = new Map(customFieldOrder.map((id, i) => [id, i]));
  return Object.keys(perms)
    .filter((k) => k.startsWith("custom:") && perms[k] !== "hidden")
    .map((k) => parseInt(k.slice("custom:".length), 10))
    .filter(
      (id) =>
        Number.isInteger(id) &&
        Object.prototype.hasOwnProperty.call(names, id) &&
        types[id] !== "calculation",
    )
    .sort((a, b) => {
      const ai = orderIndex.has(a) ? orderIndex.get(a)! : Infinity;
      const bi = orderIndex.has(b) ? orderIndex.get(b)! : Infinity;
      if (ai !== bi) return ai - bi;
      return a - b;
    });
}

// True when at least one actually-renderable field is writable (drives whether
// Edit shows). Mirrors the exact set of controls the edit dialog would render:
// standard keys currently in SHARE_FIELD_ORDER, plus custom:<id> ids present in
// customFieldNames and not of type "calculation".
export function hasWritableField(
  config: ShareLinkConfig,
  customFieldNames: Record<number, string>,
  customFieldTypes: Record<number, string>,
): boolean {
  const perms = config.fieldPermissions || {};
  const names = customFieldNames || {};
  const types = customFieldTypes || {};
  for (const key of SHARE_FIELD_ORDER) {
    if (perms[key] === "write") return true;
  }
  for (const key of Object.keys(perms)) {
    if (!key.startsWith("custom:") || perms[key] !== "write") continue;
    const id = parseInt(key.slice("custom:".length), 10);
    if (
      Number.isInteger(id) &&
      Object.prototype.hasOwnProperty.call(names, id) &&
      types[id] !== "calculation"
    ) {
      return true;
    }
  }
  return false;
}

// Column header for a custom field: the real name when provided (the server now
// echoes customFieldNames), else a placeholder fallback.
export function customFieldLabel(id: number, customFieldNames?: Record<number, string>): string {
  return customFieldNames?.[id] ?? `Custom Field ${id}`;
}
