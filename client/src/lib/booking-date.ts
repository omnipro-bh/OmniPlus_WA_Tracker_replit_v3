const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(s: string): [number, number, number] | null {
  const p = s.split('-').map(Number);
  if (p.length !== 3 || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) return null;
  return [p[0], p[1], p[2]];
}

// "2026-10-18" -> "Oct 18, 2026"
export function formatLongDate(s: string): string {
  const p = parts(s);
  if (!p) return s;
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
    if (!p) return s;
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
