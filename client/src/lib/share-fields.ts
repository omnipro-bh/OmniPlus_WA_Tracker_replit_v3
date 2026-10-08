import type { ShareLinkConfig } from "@shared/schema";
import type { ShareBooking } from "@/lib/share-api";

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

// ---------------------------------------------------------------------------
// Feature 3G-6 — fieldOrder-aware ordering + public-page sorting.
// ---------------------------------------------------------------------------

export type OrderedField =
  | { kind: "standard"; key: string }
  | { kind: "custom"; id: number; key: string };

// Single merged, ordered, VISIBLE field list (table columns = mobile card fields).
// Respects config.fieldOrder first, then appends anything visible but missing in
// canonical order (standard by SHARE_FIELD_ORDER, custom by displayOrder). Mirrors
// the server's orderedVisibleFieldKeys (server/share-links.ts) so the public table
// columns line up exactly with the CSV export.
export function orderedVisibleFields(
  config: ShareLinkConfig,
  customFieldNames: Record<number, string>,
  customFieldTypes: Record<number, string>,
  customFieldOrder: number[] = [],
): OrderedField[] {
  const perms = config.fieldPermissions || {};
  const names = customFieldNames || {};
  const types = customFieldTypes || {};
  const order: string[] = [];
  for (const key of config.fieldOrder ?? []) {
    if (order.includes(key) || (perms[key] ?? "hidden") === "hidden") continue;
    if (key.startsWith("custom:")) {
      const id = parseInt(key.slice("custom:".length), 10);
      if (
        !Number.isInteger(id) ||
        !Object.prototype.hasOwnProperty.call(names, id) ||
        types[id] === "calculation"
      ) {
        continue;
      }
    } else if (!SHARE_FIELD_ORDER.includes(key)) {
      continue;
    }
    order.push(key);
  }
  for (const key of SHARE_FIELD_ORDER) {
    if (!order.includes(key) && (perms[key] ?? "hidden") !== "hidden") order.push(key);
  }
  for (const id of visibleCustomFieldIds(config, names, types, customFieldOrder)) {
    const key = `custom:${id}`;
    if (!order.includes(key)) order.push(key);
  }
  return order.map((key) =>
    key.startsWith("custom:")
      ? { kind: "custom", id: parseInt(key.slice("custom:".length), 10), key }
      : { kind: "standard", key },
  );
}

// Ordered list of WRITABLE field keys (perm === "write"), in fieldOrder order.
// Drives the public edit modal's control order.
export function orderedWritableFieldKeys(
  config: ShareLinkConfig,
  customFieldNames: Record<number, string>,
  customFieldTypes: Record<number, string>,
  customFieldOrder: number[] = [],
): string[] {
  return orderedVisibleFields(config, customFieldNames, customFieldTypes, customFieldOrder)
    .filter((c) => (config.fieldPermissions?.[c.key] ?? "hidden") === "write")
    .map((c) => c.key);
}

// ---- public-page sorting ---------------------------------------------------

// Workflow-priority status order (needs-action first), not alphabetical.
export const STATUS_ORDER = ["pending", "confirmed", "cancelled", "completed", "no_show"];

// Sort type per standard key; custom keys look up customFieldTypes instead.
const STANDARD_FIELD_SORT_TYPES: Record<string, "date" | "time" | "status" | "number" | "text"> = {
  slotDate: "date",
  endDate: "date",
  startTime: "time",
  endTime: "time",
  endDayTime: "time",
  status: "status",
  bookingLabel: "text",
  customerName: "text",
  customerPhone: "text",
  service: "text",
  provider: "text",
};

// Raw sort value for a booking + column key. `endDayTime` is a composite column
// that sorts by its start time; custom fields read from customFieldValues.
function sortValue(key: string, b: ShareBooking): string | null {
  if (key === "endDayTime") return b.endDayStartTime ?? null;
  if (key.startsWith("custom:")) {
    const id = parseInt(key.slice("custom:".length), 10);
    return b.customFieldValues?.find((v) => v.fieldId === id)?.value ?? null;
  }
  return (b as unknown as Record<string, unknown>)[key] == null
    ? null
    : String((b as unknown as Record<string, unknown>)[key]);
}

// Type-aware comparator for a single column. Blank values always sort last,
// regardless of direction. Dates/times are ISO strings so lexical == chronological.
export function compareBookingFields(
  a: ShareBooking,
  b: ShareBooking,
  key: string,
  customFieldTypes: Record<number, string>,
): number {
  const type = key.startsWith("custom:")
    ? customFieldTypes[parseInt(key.slice("custom:".length), 10)] ?? "text"
    : STANDARD_FIELD_SORT_TYPES[key] ?? "text";
  const av = sortValue(key, a);
  const bv = sortValue(key, b);
  const as = av == null ? "" : String(av);
  const bs = bv == null ? "" : String(bv);
  const aBlank = as.trim() === "";
  const bBlank = bs.trim() === "";
  if (aBlank !== bBlank) return aBlank ? 1 : -1;
  switch (type) {
    case "number": {
      const an = parseFloat(as);
      const bn = parseFloat(bs);
      return (Number.isNaN(an) ? -Infinity : an) - (Number.isNaN(bn) ? -Infinity : bn);
    }
    case "status": {
      const ai = STATUS_ORDER.indexOf(as);
      const bi = STATUS_ORDER.indexOf(bs);
      return (ai === -1 ? STATUS_ORDER.length : ai) - (bi === -1 ? STATUS_ORDER.length : bi);
    }
    case "date":
    case "time":
    default:
      return as.localeCompare(bs, undefined, { numeric: true });
  }
}
