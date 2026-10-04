import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, addWeeks, addMonths, startOfWeek, startOfMonth, format, isSameMonth, isSameDay } from "date-fns";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
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

function CalendarHeader({
  view, setView, currentDate, onPrev, onToday, onNext,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  currentDate: Date;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Calendar className="h-6 w-6" />
          Calendar
        </h1>
        <p className="text-sm text-muted-foreground">{headerLabel(view, currentDate)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as ViewMode)} variant="outline" size="sm">
          <ToggleGroupItem value="day" data-testid="calendar-view-day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week" data-testid="calendar-view-week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month" data-testid="calendar-view-month">Month</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={onPrev} aria-label="Previous" data-testid="calendar-prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onToday} data-testid="calendar-today">Today</Button>
          <Button variant="outline" size="icon" onClick={onNext} aria-label="Next" data-testid="calendar-next">
            <ChevronRight className="h-4 w-4" />
          </Button>
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
          <SelectItem value="available">Available</SelectItem>
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

function DayColumn({ dateKey, bookings, availableSlots }: {
  dateKey: string;
  bookings: CalendarBooking[];
  availableSlots: AvailableWindow[];
}) {
  const dayBookings = bookings.filter((b) => b.slotDate === dateKey);
  const dayAvailable = availableSlots.filter((w) => w.slotDate === dateKey);
  const colHeight = HOURS.length * ROW_HEIGHT;

  return (
    <div className="relative flex-1 border-l" style={{ height: colHeight }}>
      {Array.from({ length: HOURS.length - 1 }).map((_, i) => (
        <div key={i} className="absolute inset-x-0 h-px bg-border" style={{ top: (i + 1) * ROW_HEIGHT }} />
      ))}
      {dayAvailable.map((w, i) => {
        const pos = clampedPosition(w.startTime, w.endTime);
        if (!pos) return null;
        return (
          <div
            key={`av-${i}`}
            className="absolute inset-x-0 border border-dashed border-emerald-500/30 bg-emerald-500/10"
            style={{ top: pos.top, height: pos.height }}
          />
        );
      })}
      {dayBookings.map((b) => {
        const pos = clampedPosition(b.startTime, b.endTime);
        if (!pos) return null;
        return (
          <div
            key={b.id}
            className="absolute left-0.5 right-0.5 z-10 overflow-hidden rounded border border-primary bg-primary/20 px-1 text-xs"
            style={{ top: pos.top, height: pos.height }}
          >
            <div className="truncate font-medium">{b.customerName || b.customerPhone}</div>
            <div className="truncate text-muted-foreground">{b.startTime}–{b.endTime}</div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ date, bookings, availableSlots }: {
  date: Date;
  bookings: CalendarBooking[];
  availableSlots: AvailableWindow[];
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
        <DayColumn dateKey={format(date, "yyyy-MM-dd")} bookings={bookings} availableSlots={availableSlots} />
      </div>
    </div>
  );
}

function WeekView({ date, bookings, availableSlots }: {
  date: Date;
  bookings: CalendarBooking[];
  availableSlots: AvailableWindow[];
}) {
  const weekStart = startOfWeek(date, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b">
        <div />
        {days.map((d) => (
          <div key={format(d, "yyyy-MM-dd")} className="border-l px-2 py-2 text-center">
            <div className="text-xs font-medium">{format(d, "EEE")}</div>
            <div className="text-sm">{format(d, "d")}</div>
          </div>
        ))}
      </div>
      <div className="flex">
        <HourGutter />
        {days.map((d) => (
          <DayColumn key={format(d, "yyyy-MM-dd")} dateKey={format(d, "yyyy-MM-dd")} bookings={bookings} availableSlots={availableSlots} />
        ))}
      </div>
    </div>
  );
}

function MonthView({ date, today, bookings }: {
  date: Date;
  today: Date;
  bookings: CalendarBooking[];
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
        const dayBookings = bookingsByDate.get(key) || [];
        return (
          <div key={key} className={`min-h-24 border-b border-l p-1 ${inMonth ? "" : "text-muted-foreground/40"}`}>
            <div className="flex items-center justify-between">
              <span className={`text-sm ${isSameDay(d, today) ? "font-bold text-primary" : ""}`}>{format(d, "d")}</span>
              {dayBookings.length > 0 && (
                <span className="text-xs text-muted-foreground">● {dayBookings.length}</span>
              )}
            </div>
            {dayBookings.length > 0 && (
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {dayBookings[0].customerName || dayBookings[0].customerPhone}
                {dayBookings.length > 1 ? ` +${dayBookings.length - 1}` : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BookingCalendar() {
  const { toast } = useToast();
  const [view, setView] = useState<ViewMode>("day");
  const [currentDate, setCurrentDate] = useState<Date>(() => todayInBahrain());
  const [hasNavigated, setHasNavigated] = useState(false);
  // Filters (populated but not wired to the API until 2C-2b)
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { from, to } = rangeFor(view, currentDate);

  const { data, isLoading, isError, error } = useQuery<CalendarResponse>({
    queryKey: ["/api/booking/calendar", from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
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

  const bookings = data?.bookings ?? [];
  const availableSlots = data?.availableSlots ?? [];
  const isEmpty = !isLoading && !isError && bookings.length === 0 && availableSlots.length === 0;

  return (
    <div className="p-6 space-y-4">
      <CalendarHeader
        view={view}
        setView={setView}
        currentDate={currentDate}
        onPrev={() => navigate(-1)}
        onToday={goToday}
        onNext={() => navigate(1)}
      />
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
      <div>
        {isLoading && <Skeleton className="h-96 w-full" />}
        {!isLoading && isError && (
          <p className="py-8 text-center text-sm text-muted-foreground">Unable to load calendar</p>
        )}
        {!isLoading && !isError && isEmpty && (
          <p className="py-8 text-center text-sm text-muted-foreground">No bookings this period</p>
        )}
        {!isLoading && !isError && !isEmpty && (
          <>
            {view === "day" && <DayView date={currentDate} bookings={bookings} availableSlots={availableSlots} />}
            {view === "week" && <WeekView date={currentDate} bookings={bookings} availableSlots={availableSlots} />}
            {view === "month" && <MonthView date={currentDate} today={today} bookings={bookings} />}
          </>
        )}
      </div>
    </div>
  );
}
