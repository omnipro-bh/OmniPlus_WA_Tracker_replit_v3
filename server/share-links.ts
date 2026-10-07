import crypto from "crypto";
import bcrypt from "bcryptjs";
import { comparePassword } from "./auth";
import type { Booking, BookingShareLink, ShareLinkConfig } from "@shared/schema";

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

export function buildCsvHeader(config: ShareLinkConfig): string {
  const cells = visibleFieldKeys(config).map((k) => {
    switch (k) {
      case "endDayTime": return csvCell("Last day time");
      case "customField1": return csvCell("Custom Field 1");
      case "customField2": return csvCell("Custom Field 2");
      default: return csvCell(k);
    }
  });
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
  for (const v of (projected["customFieldValues"] as Array<{ fieldId: number; value: string }> || [])) {
    cells.push(csvCell(v.value));
  }
  return cells.join(",");
}
