const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatLongDate(s: string): string {
  const p = s.split('-').map(Number);
  if (p.length !== 3 || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) return s;
  return `${MONTHS[p[1] - 1]} ${p[2]}, ${p[0]}`;
}

// "Oct 20 – Oct 22, 2026" or "Oct 20, 2026" for single-day bookings.
export function formatBookingDateRange(slotDate: string, endDate?: string | null): string {
  if (!endDate || endDate === slotDate) return formatLongDate(slotDate);
  return `${formatLongDate(slotDate)} – ${formatLongDate(endDate)}`;
}

export interface BookingTemplateContext {
  customerName?: string | null;
  date: string;      // {{date}}  -> start date (slotDate)
  time: string;      // {{time}}  -> start time
  dateRange: string; // {{dateRange}} -> "Oct 20 – Oct 22, 2026" (or single date)
  endDate: string;   // {{endDate}}  -> endDate ?? slotDate
  endTime: string;   // {{endTime}}  -> end time
  department?: string | null;
  staff?: string | null;
  oldDate?: string;
  oldTime?: string;
}

// Single source of truth for booking notification template substitution.
// Supports the legacy placeholders plus the multi-day ones ({{dateRange}},
// {{endDate}}, {{endTime}}). {{name}} is kept as an alias for {{customerName}}
// (used by the reminder sender). Multi-day variables resolve to single-day values
// when endDate is null, so existing templates keep working unchanged.
export function renderBookingTemplate(template: string, ctx: BookingTemplateContext): string {
  return template
    .replace(/\{\{customerName\}\}/g, ctx.customerName ?? '')
    .replace(/\{\{name\}\}/g, ctx.customerName ?? '')
    .replace(/\{\{dateRange\}\}/g, ctx.dateRange)
    .replace(/\{\{endDate\}\}/g, ctx.endDate)
    .replace(/\{\{endTime\}\}/g, ctx.endTime)
    .replace(/\{\{date\}\}/g, ctx.date)
    .replace(/\{\{time\}\}/g, ctx.time)
    .replace(/\{\{oldDate\}\}/g, ctx.oldDate ?? '')
    .replace(/\{\{oldTime\}\}/g, ctx.oldTime ?? '')
    .replace(/\{\{department\}\}/g, ctx.department ?? '')
    .replace(/\{\{staff\}\}/g, ctx.staff ?? '');
}
