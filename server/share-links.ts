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
  customField1: (b) => ({ customField1Label: b.customField1Label, customField1Value: b.customField1Value }),
  customField2: (b) => ({ customField2Label: b.customField2Label, customField2Value: b.customField2Value }),
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
  "service", "provider", "customField1", "customField2",
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

export function buildCsvHeader(config: ShareLinkConfig, customFieldNames: Record<number, string> = {}): string {
  const cells = visibleFieldKeys(config).map((k) => {
    switch (k) {
      case "endDayTime": return csvCell("Last day time");
      case "customField1": return csvCell("Custom Field 1");
      case "customField2": return csvCell("Custom Field 2");
      default: return csvCell(k);
    }
  });
  // Custom-field columns use their real names (owner-controlled → sanitize).
  for (const id of visibleCustomFieldIds(config)) {
    cells.push(csvCell(customFieldNames[id] ?? `Custom Field ${id}`));
  }
  return cells.join(",");
}

export function buildCsvRow(projected: Record<string, unknown>, config: ShareLinkConfig): string {
  const cells = visibleFieldKeys(config).map((k) => {
    if (k === "endDayTime") {
      const s = projected["endDayStartTime"];
      const e = projected["endDayEndTime"];
      return csvCell(s && e ? `${s}-${e}` : (s || e || ""));
    }
    if (k === "customField1" || k === "customField2") {
      const label = projected[`${k}Label`];
      const value = projected[`${k}Value`];
      return csvCell(label ? `${label}: ${value ?? ""}` : (value ?? ""));
    }
    return csvCell(projected[k]);
  });
  // Custom-field values in the same (id-sorted) order as the header.
  const values = (projected["customFieldValues"] as Array<{ fieldId: number; value: string }> || []);
  const byId = new Map(values.map((v) => [v.fieldId, v.value]));
  for (const id of visibleCustomFieldIds(config)) {
    cells.push(csvCell(byId.get(id) ?? ""));
  }
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
