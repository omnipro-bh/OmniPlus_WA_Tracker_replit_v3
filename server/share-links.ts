import crypto from "crypto";
import bcrypt from "bcryptjs";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { comparePassword } from "./auth";
import { storage } from "./storage";
import type { Booking, BookingShareLink, ShareLinkConfig } from "@shared/schema";

dayjs.extend(utc);
dayjs.extend(timezone);

// Today's date in the owner's local timezone (Asia/Bahrain), "YYYY-MM-DD".
function todayInBahrain(): string {
  return dayjs().tz("Asia/Bahrain").format("YYYY-MM-DD");
}

// ---------------------------------------------------------------------------
// Feature 3 — shareable, password-protected booking links.
// Token generation/hashing + the per-field projection / filtering / CSV helpers.
// `projectBooking` is the SINGLE serialization path for both JSON and CSV on the
// public side (3G-3): it builds the output object key-by-key from a whitelist so
// a field with "hidden" permission can never leak.
// ---------------------------------------------------------------------------

// ---- token generation / hashing -------------------------------------------

// 256-bit URL-safe token. Stored only as a SHA-256 hash.
export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Short, stable, non-sensitive preview for the owner list UI.
export function maskToken(tokenHash: string): string {
  return tokenHash.slice(0, 3) + "…";
}

// ---- timing equalization --------------------------------------------------
// A valid bcrypt hash compared against on the "token missing/disabled/expired"
// path so those responses spend the same ~100ms as a real password check
// (prevents enumerating valid tokens via response timing).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("omniplus-share-dummy-password", 10);

export async function timingEqualizeCompare(password: string): Promise<void> {
  await comparePassword(password, DUMMY_PASSWORD_HASH);
}

// ---- slot assignment (max 2 links per user) -------------------------------

// Returns the first free slot (0 then 1), or null if both are taken.
// The (userId, slot) unique index is the authoritative backstop against races.
export function assignSlot(existing: Array<{ slot: number }>): number | null {
  const used = new Set(existing.map((l) => l.slot));
  if (!used.has(0)) return 0;
  if (!used.has(1)) return 1;
  return null;
}

// ---- serialization --------------------------------------------------------

// Strip secrets (tokenHash, passwordHash); add a masked preview.
export function serializeShareLink(link: BookingShareLink): Record<string, unknown> {
  const { tokenHash, passwordHash, ...rest } = link;
  return { ...rest, tokenPreview: maskToken(tokenHash) };
}

// ---- per-field projection -------------------------------------------------

// A booking enriched with derived names + custom field values (mirrors the shape
// produced by GET /api/booking/bookings).
export type EnrichedBooking = Booking & {
  departmentName: string | null;
  staffName: string | null;
  customFieldValues: Array<{ fieldId: number; value: string }>;
};

// Canonical field keys → projector emitting ONLY the allowed keys.
const STANDARD_PROJECTORS: Record<string, (b: EnrichedBooking) => Record<string, unknown>> = {
  slotDate: (b) => ({ slotDate: b.slotDate }),
  endDate: (b) => ({ endDate: b.endDate }),
  startTime: (b) => ({ startTime: b.startTime }),
  endTime: (b) => ({ endTime: b.endTime }),
  endDayTime: (b) => ({ endDayStartTime: b.endDayStartTime, endDayEndTime: b.endDayEndTime }),
  status: (b) => ({ status: b.status }),
  bookingLabel: (b) => ({ bookingLabel: b.bookingLabel }),
  customerName: (b) => ({ customerName: b.customerName }),
  customerPhone: (b) => ({ customerPhone: b.customerPhone }),
  service: (b) => ({ service: b.departmentName }),
  provider: (b) => ({ provider: b.staffName }),
};

// Builds the projected object key-by-key from a whitelist; a hidden field is never
// touched. Always includes `id` (the row key used by the edit/cancel endpoints).
export function projectBooking(booking: EnrichedBooking, config: ShareLinkConfig): Record<string, unknown> {
  const perms = config.fieldPermissions || {};
  const out: Record<string, unknown> = { id: booking.id };
  for (const [key, projector] of Object.entries(STANDARD_PROJECTORS)) {
    if ((perms[key] ?? "hidden") === "hidden") continue;
    Object.assign(out, projector(booking));
  }
  const customValues = (booking.customFieldValues || [])
    .filter((v) => (perms[`custom:${v.fieldId}`] ?? "hidden") !== "hidden")
    .map((v) => ({ fieldId: v.fieldId, value: v.value }));
  if (customValues.length > 0) {
    out.customFieldValues = customValues;
  }
  return out;
}

// ---- filters --------------------------------------------------------------

export function filterBookingsByConfig(
  bookings: EnrichedBooking[],
  config: ShareLinkConfig,
  today: string, // "YYYY-MM-DD" in the owner's local timezone (Asia/Bahrain)
): EnrichedBooking[] {
  return bookings.filter((b) => {
    switch (config.visibility) {
      case "confirmed_upcoming":
        if (b.status !== "confirmed") return false;
        if ((b.endDate ?? b.slotDate) < today) return false;
        break;
      case "statuses":
        if (!config.statuses.includes(b.status)) return false;
        break;
      case "all":
      default:
        break;
    }
    if (config.dateRange) {
      const { from, to } = config.dateRange;
      const lastDay = b.endDate ?? b.slotDate;
      if (from && lastDay < from) return false;
      if (to && b.slotDate > to) return false;
    }
    return true;
  });
}

// ---- CSV ------------------------------------------------------------------

// OWASP spreadsheet-injection neutralization: prefix formula-leading cells,
// and strip CR/LF to prevent row injection.
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  s = s.replace(/[\r\n]+/g, " ");
  return '"' + s.replace(/"/g, '""') + '"';
}

// Ordered list of visible standard field keys (custom fields appended separately).
const SHARE_FIELD_ORDER = [
  "slotDate", "endDate", "startTime", "endTime", "endDayTime",
  "status", "bookingLabel", "customerName", "customerPhone",
  "service", "provider",
];

export function visibleFieldKeys(config: ShareLinkConfig): string[] {
  const perms = config.fieldPermissions || {};
  return SHARE_FIELD_ORDER.filter((k) => (perms[k] ?? "hidden") !== "hidden");
}

// Sorted list of visible user-defined custom field ids (stable column order,
// shared by header + row so their columns line up).
export function visibleCustomFieldIds(config: ShareLinkConfig): number[] {
  const perms = config.fieldPermissions || {};
  return Object.keys(perms)
    .filter((k) => k.startsWith("custom:"))
    .map((k) => parseInt(k.slice("custom:".length), 10))
    .filter((id) => Number.isInteger(id) && (perms[`custom:${id}`] ?? "hidden") !== "hidden")
    .sort((a, b) => a - b);
}

// Visible custom field ids ordered by the owner's displayOrder (customFieldOrder),
// falling back to id ASC for ids missing from the list (or when it's empty).
function orderedVisibleCustomFieldIds(config: ShareLinkConfig, customFieldOrder: number[]): number[] {
  const orderIndex = new Map(customFieldOrder.map((id, i) => [id, i]));
  return visibleCustomFieldIds(config).sort((a, b) => {
    const ai = orderIndex.has(a) ? orderIndex.get(a)! : Infinity;
    const bi = orderIndex.has(b) ? orderIndex.get(b)! : Infinity;
    if (ai !== bi) return ai - bi;
    return a - b;
  });
}

// Single merged, ordered, VISIBLE field-key list (standard keys + `custom:<id>`).
// Respects config.fieldOrder first, then appends any visible-but-missing keys in
// canonical order (standard by SHARE_FIELD_ORDER, custom by displayOrder). This is
// the single source for CSV column order — the client's orderedVisibleFields in
// share-fields.ts mirrors this exact algorithm so table columns line up with CSV.
export function orderedVisibleFieldKeys(
  config: ShareLinkConfig,
  customFieldOrder: number[] = [],
): string[] {
  const perms = config.fieldPermissions || {};
  const out: string[] = [];
  for (const key of config.fieldOrder ?? []) {
    if (out.includes(key) || (perms[key] ?? "hidden") === "hidden") continue;
    if (key.startsWith("custom:")) {
      const id = parseInt(key.slice("custom:".length), 10);
      if (!Number.isInteger(id)) continue;
    } else if (!SHARE_FIELD_ORDER.includes(key)) {
      continue;
    }
    out.push(key);
  }
  for (const key of SHARE_FIELD_ORDER) {
    if (!out.includes(key) && (perms[key] ?? "hidden") !== "hidden") out.push(key);
  }
  for (const id of orderedVisibleCustomFieldIds(config, customFieldOrder)) {
    const key = `custom:${id}`;
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

export function buildCsvHeader(
  config: ShareLinkConfig,
  customFieldNames: Record<number, string> = {},
  customFieldOrder: number[] = [],
): string {
  const cells = orderedVisibleFieldKeys(config, customFieldOrder).map((key) => {
    if (key.startsWith("custom:")) {
      const id = parseInt(key.slice("custom:".length), 10);
      // Custom-field columns use their real names (owner-controlled → sanitize).
      return csvCell(customFieldNames[id] ?? `Custom Field ${id}`);
    }
    switch (key) {
      case "endDayTime": return csvCell("Last day time");
      default: return csvCell(key);
    }
  });
  return cells.join(",");
}

export function buildCsvRow(
  projected: Record<string, unknown>,
  config: ShareLinkConfig,
  customFieldOrder: number[] = [],
): string {
  // Custom-field values in the same order as the header.
  const values = (projected["customFieldValues"] as Array<{ fieldId: number; value: string }> || []);
  const byId = new Map(values.map((v) => [v.fieldId, v.value]));
  const cells = orderedVisibleFieldKeys(config, customFieldOrder).map((key) => {
    if (key.startsWith("custom:")) {
      const id = parseInt(key.slice("custom:".length), 10);
      return csvCell(byId.get(id) ?? "");
    }
    if (key === "endDayTime") {
      const s = projected["endDayStartTime"];
      const e = projected["endDayEndTime"];
      return csvCell(s && e ? `${s}-${e}` : (s || e || ""));
    }
    return csvCell(projected[key]);
  });
  return cells.join(",");
}

// ---- enrichment + shared row fetch ----------------------------------------

// Enrich raw bookings with derived names + custom field values (the shape
// `projectBooking` needs). Mirrors the owner list's enrichment (per-row N+1).
export async function enrichBookingsForUser(_userId: number, bookings: Booking[]): Promise<EnrichedBooking[]> {
  if (bookings.length === 0) return [];
  const bookingIds = bookings.map((b) => b.id);
  const fieldValues = await storage.getBookingCustomFieldValuesForBookings(bookingIds);
  const valuesByBooking = new Map<number, Array<{ fieldId: number; value: string }>>();
  for (const v of fieldValues) {
    const list = valuesByBooking.get(v.bookingId) ?? [];
    list.push({ fieldId: v.fieldId, value: v.value });
    valuesByBooking.set(v.bookingId, list);
  }
  return await Promise.all(bookings.map(async (b) => {
    const [department, staff] = await Promise.all([
      b.departmentId ? storage.getBookingDepartment(b.departmentId) : null,
      b.staffId ? storage.getBookingStaff(b.staffId) : null,
    ]);
    return {
      ...b,
      departmentName: department?.name ?? null,
      staffName: staff?.name ?? null,
      customFieldValues: valuesByBooking.get(b.id) ?? [],
    };
  }));
}

// Single source of rows for the public JSON list, CSV export, and the
// visibility check on write actions. Fetches the owner's bookings (up to 5000),
// enriches, then applies the link's visibility/statuses/dateRange filters.
export async function getShareBookingsForLink(link: BookingShareLink): Promise<EnrichedBooking[]> {
  const { bookings } = await storage.getBookingsForUser(link.userId, { page: 1, pageSize: 5000 });
  const enriched = await enrichBookingsForUser(link.userId, bookings);
  return filterBookingsByConfig(enriched, link.config, todayInBahrain());
}
