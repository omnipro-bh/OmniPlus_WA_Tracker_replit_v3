import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { addDays, addWeeks, addMonths, startOfWeek, startOfMonth, format, isSameMonth, isSameDay } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  Calendar, ChevronLeft, ChevronRight, Maximize2, Minimize2,
  Building2, Clock, User, Phone, Tag, CalendarDays, SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

type ViewMode = "day" | "week" | "month";

// 08:00 -> 20:00 inclusive (13 hourly rows)
const HOURS = [
  "08:00", "09:00", "10:00", "11:00", "12:00", "13:00",
  "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00",
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Grid geometry (fixed hour range; out-of-range items are clamped in render)
const ROW_HEIGHT = 64;          // h-16 = 4rem
const GRID_START_MIN = 8 * 60;  // 08:00
const GRID_END_MIN = 20 * 60;   // 20:00

// Status color system — a three-part chip (soft tint + left accent + dot)
const STATUS_BLOCK: Record<string, string> = {
  confirmed: "border-l-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  completed: "border-l-sky-500     bg-sky-500/10     text-sky-700     dark:text-sky-300",
  pending:   "border-l-amber-500   bg-amber-500/15   text-amber-800   dark:text-amber-300",
  cancelled: "border-l-slate-400   bg-slate-400/10   text-slate-500   dark:text-slate-400",
  no_show:   "border-l-rose-500    bg-rose-500/10    text-rose-700    dark:text-rose-300",
};
const STATUS_BLOCK_DEFAULT = "border-l-primary bg-primary/10 text-foreground";

const STATUS_DOT: Record<string, string> = {
  confirmed: "bg-emerald-500", completed: "bg-sky-500", pending: "bg-amber-500",
  cancelled: "bg-slate-400",   no_show: "bg-rose-500",
};
const STATUS_DOT_DEFAULT = "bg-primary";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", completed: "Completed",
  cancelled: "Cancelled", no_show: "No Show",
};

interface BookingDepartment {
  id: number;
  name: string;
  serviceId: number | null;
}

interface BookingStaff {
  id: number;
  name: string;
  departmentId: number;
}

interface CalendarBooking {
  id: number;
  slotDate: string;
  startTime: string;
  endTime: string;
  departmentId: number;
  departmentName: string;
  staffId: number;
  staffName: string;
  customerName: string | null;
  customerPhone: string;
  status: string;
  bookingLabel: string | null;
  customField1Label: string | null;
  customField1Value: string | null;
  customField2Label: string | null;
  customField2Value: string | null;
}

interface AvailableWindow {
  slotDate: string;
  startTime: string;
  endTime: string;
  staffId: number;
  staffName: string;
  departmentId: number;
  departmentName: string;
}

interface CalendarResponse {
  range: { from: string; to: string };
  timezone: string;
  today: string;
  bookings: CalendarBooking[];
  availableSlots: AvailableWindow[];
}

// Parse "YYYY-MM-DD" into a local Date at that calendar date (timezone-independent)
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Client-side "today" in Asia/Bahrain (fallback for first paint; server `today` is authoritative once loaded)
function todayInBahrain(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bahrain" }).format(new Date());
  return parseDate(iso);
}

// Current wall-clock "HH:MM" in Asia/Bahrain
function nowTimeInBahrain(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bahrain", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(now);
}

function rangeFor(view: ViewMode, date: Date): { from: string; to: string } {
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  if (view === "day") {
    const s = fmt(date);
    return { from: s, to: s };
  }
  if (view === "week") {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    return { from: fmt(start), to: fmt(addDays(start, 6)) };
  }
  const gridStart = startOfWeek(startOfMonth(date), { weekStartsOn: 0 });
  return { from: fmt(gridStart), to: fmt(addDays(gridStart, 41)) };
}

function headerLabel(view: ViewMode, date: Date): string {
  if (view === "day") return format(date, "EEEE, MMMM d, yyyy");
  if (view === "week") {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    const end = addDays(start, 6);
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }
  return format(date, "MMMM yyyy");
}

function toMin(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Absolute top/height for a time range, clamped to the visible 08:00–20:00 window.
// Returns null when the range is entirely outside the visible window.
function clampedPosition(start: string, end: string): { top: number; height: number } | null {
  const s = Math.max(toMin(start), GRID_START_MIN);
  const e = Math.min(toMin(end), GRID_END_MIN);
  if (e <= s) return null;
  return {
    top: ((s - GRID_START_MIN) / 60) * ROW_HEIGHT,
    height: ((e - s) / 60) * ROW_HEIGHT,
  };
}

// Vertical top for a single instant (now-line); null when outside the visible window
function topForInstant(time: string): number | null {
  const m = toMin(time);
  if (m < GRID_START_MIN || m >= GRID_END_MIN) return null;
  return ((m - GRID_START_MIN) / 60) * ROW_HEIGHT;
}

function CalendarHeader({
  view, setView, currentDate, isToday, isFullscreen, onToggleFullscreen, onPrev, onToday, onNext,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  currentDate: Date;
  isToday: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
}) {
  return (
    <div className={isFullscreen
      ? "border-b bg-background px-6 py-3"
      : "sticky top-0 z-20 -mx-6 -mt-6 border-b bg-background/95 px-6 py-3 backdrop-blur"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" data-testid="text-page-title">
            <Calendar className="h-5 w-5" />
            Calendar
          </h1>
          <p className="text-sm font-medium text-muted-foreground">{headerLabel(view, currentDate)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as ViewMode)} variant="outline" size="sm">
            <ToggleGroupItem value="day" data-testid="calendar-view-day">Day</ToggleGroupItem>
            <ToggleGroupItem value="week" data-testid="calendar-view-week">Week</ToggleGroupItem>
            <ToggleGroupItem value="month" data-testid="calendar-view-month">Month</ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="outline" size="icon"
            onClick={onToggleFullscreen}
            aria-pressed={isFullscreen}
            aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
            data-testid="calendar-fullscreen-toggle"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={onPrev} aria-label="Previous" data-testid="calendar-prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {!isToday && (
              <Button variant="outline" size="sm" onClick={onToday} data-testid="calendar-today">Today</Button>
            )}
            <Button variant="outline" size="icon" onClick={onNext} aria-label="Next" data-testid="calendar-next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterBar({
  departments, staff,
  departmentFilter, onDepartmentChange,
  staffFilter, onStaffChange,
  statusFilter, onStatusChange,
}: {
  departments: BookingDepartment[];
  staff: BookingStaff[];
  departmentFilter: string;
  onDepartmentChange: (v: string) => void;
  staffFilter: string;
  onStaffChange: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
}) {
  const sortedDepartments = [...departments].sort((a, b) => a.name.localeCompare(b.name));
  const staffByDept = new Map<number, BookingStaff[]>();
  for (const s of staff) {
    const list = staffByDept.get(s.departmentId) || [];
    list.push(s);
    staffByDept.set(s.departmentId, list);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={departmentFilter} onValueChange={onDepartmentChange}>
        <SelectTrigger className="w-48" data-testid="calendar-filter-department">
          <SelectValue placeholder="All Departments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Departments</SelectItem>
          {sortedDepartments.map((d) => (
            <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={staffFilter} onValueChange={onStaffChange}>
        <SelectTrigger className="w-48" data-testid="calendar-filter-staff">
          <SelectValue placeholder="All Staff" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Staff</SelectItem>
          {sortedDepartments.map((d) => {
            const deptStaff = (staffByDept.get(d.id) || []).sort((a, b) => a.name.localeCompare(b.name));
            if (deptStaff.length === 0) return null;
            return (
              <SelectGroup key={d.id}>
                <SelectLabel>{d.name}</SelectLabel>
                {deptStaff.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>

      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-44" data-testid="calendar-filter-status">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="confirmed">Confirmed</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
          <SelectItem value="no_show">No Show</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function HourGutter() {
  return (
    <div className="w-16 shrink-0">
      {HOURS.map((h) => (
        <div key={h} className="h-16 border-b pr-2 pt-1 text-right text-xs text-muted-foreground">{h}</div>
      ))}
    </div>
  );
}

function DayColumn({
  dateKey, bookings, availableSlots, todayKey, nowTime, onBookingClick,
}: {
  dateKey: string;
  bookings: CalendarBooking[];
  availableSlots: AvailableWindow[];
  todayKey: string;
  nowTime: string;
  onBookingClick: (b: CalendarBooking) => void;
}) {
  const dayBookings = bookings.filter((b) => b.slotDate === dateKey);
  const dayAvailable = availableSlots.filter((w) => w.slotDate === dateKey);
  const isToday = dateKey === todayKey;
  const dow = parseDate(dateKey).getDay();
  const isWeekend = dow === 0 || dow === 6;
  const nowTop = isToday ? topForInstant(nowTime) : null;
  const colHeight = HOURS.length * ROW_HEIGHT;
  const colBg = isToday ? "bg-primary/5" : isWeekend ? "bg-muted/5" : "";

  return (
    <div className={`relative flex-1 border-l ${colBg}`} style={{ height: colHeight }}>
      {Array.from({ length: HOURS.length - 1 }).map((_, i) => (
        <div key={i} className="absolute inset-x-0 h-px bg-border" style={{ top: (i + 1) * ROW_HEIGHT }} />
      ))}
      {dayAvailable.map((w, i) => {
        const pos = clampedPosition(w.startTime, w.endTime);
        if (!pos) return null;
        return (
          <div key={`av-${i}`} className="absolute inset-x-0 bg-muted/5" style={{ top: pos.top, height: pos.height }} />
        );
      })}
      {dayBookings.map((b) => {
        const pos = clampedPosition(b.startTime, b.endTime);
        if (!pos) return null;
        return (
          <HoverCard key={b.id}>
            <HoverCardTrigger asChild>
              <div
                className={`absolute left-0.5 right-0.5 z-10 cursor-pointer overflow-hidden rounded-r-md border-l-2 px-1.5 py-0.5 text-xs shadow-sm hover:shadow-md ${STATUS_BLOCK[b.status] ?? STATUS_BLOCK_DEFAULT}`}
                style={{ top: pos.top, height: pos.height }}
                onClick={() => onBookingClick(b)}
                data-testid="calendar-booking-block"
              >
                <div className="flex items-center gap-1 truncate">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[b.status] ?? STATUS_DOT_DEFAULT}`} />
                  <span className={`truncate font-medium ${b.status === "cancelled" ? "line-through" : ""}`}>
                    {b.customerName || b.customerPhone}
                  </span>
                </div>
                {pos.height >= 32 && (
                  <div className="truncate opacity-75">{b.startTime}–{b.endTime}</div>
                )}
              </div>
            </HoverCardTrigger>
            <HoverCardContent side="right" align="start" className="w-60">
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[b.status] ?? STATUS_DOT_DEFAULT}`} />
                <span className="truncate font-medium">{b.customerName || b.customerPhone}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{b.slotDate} · {b.startTime}–{b.endTime}</div>
              <div className="mt-1.5">
                <StatusPill status={b.status} />
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      })}
      {nowTop !== null && (
        <div className="absolute inset-x-0 z-20 h-px bg-rose-500" style={{ top: nowTop }}>
          <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-rose-500" />
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? STATUS_DOT_DEFAULT}`} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function DayView({ date, bookings, availableSlots, todayKey, nowTime, onBookingClick }: {
  date: Date;
  bookings: CalendarBooking[];
  availableSlots: AvailableWindow[];
  todayKey: string;
  nowTime: string;
  onBookingClick: (b: CalendarBooking) => void;
}) {
  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-[64px_1fr] border-b">
        <div />
        <div className="border-l px-2 py-2 text-center">
          <div className="text-xs font-medium">{format(date, "EEE")}</div>
          <div className="text-sm">{format(date, "d")}</div>
        </div>
      </div>
      <div className="flex">
        <HourGutter />
        <DayColumn dateKey={format(date, "yyyy-MM-dd")} bookings={bookings} availableSlots={availableSlots} todayKey={todayKey} nowTime={nowTime} onBookingClick={onBookingClick} />
      </div>
    </div>
  );
}

function WeekView({ date, bookings, availableSlots, todayKey, nowTime, onBookingClick }: {
  date: Date;
  bookings: CalendarBooking[];
  availableSlots: AvailableWindow[];
  todayKey: string;
  nowTime: string;
  onBookingClick: (b: CalendarBooking) => void;
}) {
  const weekStart = startOfWeek(date, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b">
        <div />
        {days.map((d) => (
          <div key={format(d, "yyyy-MM-dd")} className={`border-l px-2 py-2 text-center ${format(d, "yyyy-MM-dd") === todayKey ? "bg-primary/5" : ""}`}>
            <div className="text-xs font-medium">{format(d, "EEE")}</div>
            <div className={`text-sm ${format(d, "yyyy-MM-dd") === todayKey ? "font-bold text-primary" : ""}`}>{format(d, "d")}</div>
          </div>
        ))}
      </div>
      <div className="flex">
        <HourGutter />
        {days.map((d) => (
          <DayColumn key={format(d, "yyyy-MM-dd")} dateKey={format(d, "yyyy-MM-dd")} bookings={bookings} availableSlots={availableSlots} todayKey={todayKey} nowTime={nowTime} onBookingClick={onBookingClick} />
        ))}
      </div>
    </div>
  );
}

function MonthView({ date, today, bookings, onBookingClick }: {
  date: Date;
  today: Date;
  bookings: CalendarBooking[];
  onBookingClick: (b: CalendarBooking) => void;
}) {
  const monthStart = startOfMonth(date);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const bookingsByDate = new Map<string, CalendarBooking[]>();
  for (const b of bookings) {
    const list = bookingsByDate.get(b.slotDate) || [];
    list.push(b);
    bookingsByDate.set(b.slotDate, list);
  }

  return (
    <div className="grid grid-cols-7 rounded-md border">
      {WEEKDAY_LABELS.map((d) => (
        <div key={d} className="border-b border-l px-2 py-1 text-center text-xs font-medium text-muted-foreground">{d}</div>
      ))}
      {cells.map((d) => {
        const key = format(d, "yyyy-MM-dd");
        const inMonth = isSameMonth(d, date);
        const dow = d.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const dayBookings = bookingsByDate.get(key) || [];
        return (
          <div key={key} className={`min-h-24 border-b border-l p-1 ${!inMonth ? "text-muted-foreground/40" : ""} ${inMonth && isWeekend ? "bg-muted/5" : ""}`}>
            <div className="flex items-center justify-between">
              <span className={`text-sm ${isSameDay(d, today) ? "font-bold text-primary" : ""}`}>{format(d, "d")}</span>
              {dayBookings.length > 0 && (
                <span className="text-xs text-muted-foreground">{dayBookings.length}</span>
              )}
            </div>
            <div className="mt-1 space-y-0.5">
              {dayBookings.slice(0, 2).map((b) => (
                <button
                  key={b.id}
                  className="flex w-full items-center gap-1 truncate text-left text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onBookingClick(b)}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[b.status] ?? STATUS_DOT_DEFAULT}`} />
                  <span className="truncate">{b.customerName || b.customerPhone}</span>
                </button>
              ))}
              {dayBookings.length > 2 && (
                <div className="text-xs text-muted-foreground">+{dayBookings.length - 2} more</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Field({ icon: Icon, label, value }: { icon?: LucideIcon; label?: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label ?? ""}</div>
        <div className="text-sm">{value}</div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function ComingSoonButton({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button variant="outline" size="sm" disabled>{children}</Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>Coming soon</TooltipContent>
    </Tooltip>
  );
}

function BookingDetailDialog({ booking, onClose }: {
  booking: CalendarBooking;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="calendar-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[booking.status] ?? STATUS_DOT_DEFAULT}`} />
            {booking.customerName || "Unknown"}
          </DialogTitle>
          <DialogDescription>
            <StatusPill status={booking.status} />
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Section label="Appointment">
            <Field icon={Calendar} label="Date" value={booking.slotDate} />
            <Field icon={Clock} label="Time" value={`${booking.startTime}–${booking.endTime}`} />
            <Field icon={Building2} label="Department" value={booking.departmentName} />
            <Field icon={User} label="Staff" value={booking.staffName} />
            <Field icon={Tag} label="Label" value={booking.bookingLabel} />
          </Section>
          <Section label="Customer">
            <Field icon={Phone} label="Phone" value={booking.customerPhone} />
            <Field label={booking.customField1Label ?? undefined} value={booking.customField1Value} />
            <Field label={booking.customField2Label ?? undefined} value={booking.customField2Value} />
          </Section>
        </div>
        <DialogFooter>
          <ComingSoonButton>Cancel</ComingSoonButton>
          <ComingSoonButton>Reschedule</ComingSoonButton>
          <ComingSoonButton>Edit</ComingSoonButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BookingCalendar() {
  const { toast } = useToast();
  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState<Date>(() => todayInBahrain());
  const [hasNavigated, setHasNavigated] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null);
  const [now, setNow] = useState(() => new Date());
  // Filters (wired into the API query)
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Real-time "now" (60s tick) for the now-line
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Exit full-screen on Escape (scoped to full-screen and no open dialog)
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !selectedBooking) setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen, selectedBooking]);

  const { from, to } = rangeFor(view, currentDate);
  const hasActiveFilters = departmentFilter !== "all" || staffFilter !== "all" || statusFilter !== "all";

  const { data, isLoading, isError, error } = useQuery<CalendarResponse>({
    queryKey: ["/api/booking/calendar", from, to, departmentFilter, staffFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (departmentFilter !== "all") params.set("departmentId", departmentFilter);
      if (staffFilter !== "all") params.set("staffId", staffFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/booking/calendar?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch calendar");
      return res.json() as Promise<CalendarResponse>;
    },
  });

  const { data: departments = [] } = useQuery<BookingDepartment[]>({ queryKey: ["/api/booking/departments"] });
  const { data: staff = [] } = useQuery<BookingStaff[]>({ queryKey: ["/api/booking/staff"] });

  // Reconcile currentDate to the server's authoritative "today" only before any navigation
  useEffect(() => {
    if (data?.today && !hasNavigated) {
      setCurrentDate(parseDate(data.today));
    }
  }, [data?.today, hasNavigated]);

  useEffect(() => {
    if (isError) {
      toast({ title: "Error", description: (error as Error)?.message || "Failed to fetch calendar", variant: "destructive" });
    }
  }, [isError, error, toast]);

  const today = data?.today ? parseDate(data.today) : todayInBahrain();
  const todayKey = format(today, "yyyy-MM-dd");
  const nowTime = nowTimeInBahrain(now);
  const isToday = isSameDay(currentDate, today);

  const navigate = (dir: number) => {
    setHasNavigated(true);
    setCurrentDate((d) => {
      if (view === "day") return addDays(d, dir);
      if (view === "week") return addWeeks(d, dir);
      return addMonths(d, dir);
    });
  };

  const goToday = () => {
    setHasNavigated(true);
    setCurrentDate(today);
  };

  const clearFilters = () => {
    setDepartmentFilter("all");
    setStaffFilter("all");
    setStatusFilter("all");
  };

  const bookings = data?.bookings ?? [];
  const availableSlots = data?.availableSlots ?? [];
  const isEmpty = !isLoading && !isError && bookings.length === 0 && availableSlots.length === 0;

  const header = (
    <CalendarHeader
      view={view}
      setView={setView}
      currentDate={currentDate}
      isToday={isToday}
      isFullscreen={isFullscreen}
      onToggleFullscreen={() => setIsFullscreen((v) => !v)}
      onPrev={() => navigate(-1)}
      onToday={goToday}
      onNext={() => navigate(1)}
    />
  );

  const filterBar = (
    <FilterBar
      departments={departments}
      staff={staff}
      departmentFilter={departmentFilter}
      onDepartmentChange={setDepartmentFilter}
      staffFilter={staffFilter}
      onStaffChange={setStaffFilter}
      statusFilter={statusFilter}
      onStatusChange={setStatusFilter}
    />
  );

  const body = (
    <>
      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {!isLoading && isError && (
        <p className="py-8 text-center text-sm text-muted-foreground">Unable to load calendar</p>
      )}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            {hasActiveFilters
              ? <SlidersHorizontal className="h-6 w-6 text-muted-foreground" />
              : <CalendarDays className="h-6 w-6 text-muted-foreground" />}
          </div>
          <p className="font-medium">{hasActiveFilters ? "No bookings match your filters" : "No bookings this period"}</p>
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters ? "Try adjusting or clearing your filters" : "Bookings and availability will appear here"}
          </p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} data-testid="calendar-empty-clear">
              Clear filters
            </Button>
          )}
        </div>
      )}
      {!isLoading && !isError && !isEmpty && (
        <>
          {view === "day" && (
            <DayView date={currentDate} bookings={bookings} availableSlots={availableSlots} todayKey={todayKey} nowTime={nowTime} onBookingClick={setSelectedBooking} />
          )}
          {view === "week" && (
            <WeekView date={currentDate} bookings={bookings} availableSlots={availableSlots} todayKey={todayKey} nowTime={nowTime} onBookingClick={setSelectedBooking} />
          )}
          {view === "month" && (
            <MonthView date={currentDate} today={today} bookings={bookings} onBookingClick={setSelectedBooking} />
          )}
        </>
      )}
    </>
  );

  const detailDialog = selectedBooking && (
    <BookingDetailDialog booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
  );

  if (isFullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        {header}
        <div className="px-6 py-3">{filterBar}</div>
        <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">{body}</div>
        {detailDialog}
      </div>,
      document.body,
    );
  }

  return (
    <div className="p-6 space-y-4">
      {header}
      {filterBar}
      <div>{body}</div>
      {detailDialog}
    </div>
  );
}
