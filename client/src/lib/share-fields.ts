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
  "customField1",
  "customField2",
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
  customField1: "Custom field 1",
  customField2: "Custom field 2",
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
export function visibleCustomFieldIds(config: ShareLinkConfig): number[] {
  const perms = config.fieldPermissions || {};
  return Object.keys(perms)
    .filter((k) => k.startsWith("custom:") && perms[k] !== "hidden")
    .map((k) => parseInt(k.slice("custom:".length), 10))
    .filter((id) => Number.isInteger(id))
    .sort((a, b) => a - b);
}

// True when any standard or custom field is writable (drives whether Edit shows).
export function hasWritableField(config: ShareLinkConfig): boolean {
  const perms = config.fieldPermissions || {};
  return Object.values(perms).some((v) => v === "write");
}

// Placeholder column header until the server includes custom-field names (follow-up).
export function customFieldLabel(id: number): string {
  return `Custom Field ${id}`;
}
