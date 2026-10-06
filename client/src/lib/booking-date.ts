const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(s: string): [number, number, number] | null {
  if (!s || typeof s !== 'string') return null;
  const p = s.split('-').map(Number);
  if (p.length !== 3 || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) return null;
  return [p[0], p[1], p[2]];
}

// "2026-10-18" -> "Oct 18, 2026"
export function formatLongDate(s: string): string {
  const p = parts(s);
  if (!p) return '—';
  return `${MONTHS[p[1] - 1]} ${p[2]}, ${p[0]}`;
}

// "Oct 18, 2026" or "Oct 18 – Oct 19, 2026" (en-dash)
export function formatDateRangeLong(slotDate: string, endDate?: string | null): string {
  if (!endDate || endDate === slotDate) return formatLongDate(slotDate);
  return `${formatLongDate(slotDate)} – ${formatLongDate(endDate)}`;
}

// "Oct 18" or "Oct 18 – Oct 19"
export function formatDateRangeShort(slotDate: string, endDate?: string | null): string {
  const short = (s: string) => {
    const p = parts(s);
    if (!p) return '—';
    return `${MONTHS[p[1] - 1]} ${p[2]}`;
  };
  if (!endDate || endDate === slotDate) return short(slotDate);
  return `${short(slotDate)} – ${short(endDate)}`;
}

// Inclusive day count: Oct 18 -> Oct 19 = 2. Single-day = 1.
export function dayCount(slotDate: string, endDate?: string | null): number {
  if (!endDate || endDate === slotDate) return 1;
  return Math.round((+new Date(endDate + 'T00:00:00Z') - +new Date(slotDate + 'T00:00:00Z')) / 86400000) + 1;
}

// Sentinel value for the edit-dialog "same as main window" end-day option
// (Radix SelectItem cannot use an empty string as a value).
export const END_DAY_SAME = "__same__";

// Shared shape for per-day window resolution (mirrors server OccupiedWindowSource).
export interface BookingWindow {
  slotDate: string;
  endDate?: string | null;
  startTime: string;
  endTime: string;
  endDayStartTime?: string | null;
  endDayEndTime?: string | null;
}

// Last-day window if set, else the main window. Mirrors server occupiedWindowForDate.
export function occupiedWindowForDate(b: BookingWindow, date: string): [string, string] {
  const isLastDay = !!b.endDate && b.endDate !== b.slotDate && date === b.endDate;
  if (isLastDay) return [b.endDayStartTime ?? b.startTime, b.endDayEndTime ?? b.endTime];
  return [b.startTime, b.endTime];
}

// True when the booking has a distinct last-day window (backend guarantees both-or-neither).
export function hasEndDayWindow(b: BookingWindow): boolean {
  return !!b.endDayStartTime && !!b.endDayEndTime;
}

// "Oct 10, 2026 09:00 – 17:00" (single-day) or
// "Oct 10, 2026 09:00 – Oct 12, 2026 12:00" (multi-day, uses end-day time when set).
export function formatDateTimeRangeLong(b: BookingWindow): string {
  const endDate = b.endDate && b.endDate !== b.slotDate ? b.endDate : null;
  const [, ee] = occupiedWindowForDate(b, b.endDate ?? b.slotDate);
  const start = `${formatLongDate(b.slotDate)} ${b.startTime}`;
  const end = endDate ? `${formatLongDate(endDate)} ${ee}` : ee;
  return `${start} – ${end}`;
}

// "09:00–12:00" for the last-day window, or null when unset.
export function formatEndDayWindow(b: BookingWindow): string | null {
  return hasEndDayWindow(b) ? `${b.endDayStartTime}–${b.endDayEndTime}` : null;
}
