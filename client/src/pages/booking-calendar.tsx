import { useState, Fragment } from "react";
import { addDays, addWeeks, addMonths, startOfWeek, startOfMonth, format, isSameMonth, isSameDay } from "date-fns";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type ViewMode = "day" | "week" | "month";

// 08:00 -> 20:00 inclusive (13 hourly rows for the skeleton)
const HOURS = [
  "08:00", "09:00", "10:00", "11:00", "12:00", "13:00",
  "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00",
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Client-side "today" in Asia/Bahrain (mirrors server todayInBahrain(); no API call in this phase)
function todayInBahrain(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bahrain" }).format(new Date());
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
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

function CalendarHeader({
  view,
  setView,
  currentDate,
  onPrev,
  onToday,
  onNext,
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
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as ViewMode)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="day" data-testid="calendar-view-day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week" data-testid="calendar-view-week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month" data-testid="calendar-view-month">Month</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={onPrev} aria-label="Previous" data-testid="calendar-prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onToday} data-testid="calendar-today">
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={onNext} aria-label="Next" data-testid="calendar-next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterBar({
  departmentFilter,
  onDepartmentChange,
  staffFilter,
  onStaffChange,
  statusFilter,
  onStatusChange,
}: {
  departmentFilter: string;
  onDepartmentChange: (v: string) => void;
  staffFilter: string;
  onStaffChange: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={departmentFilter} onValueChange={onDepartmentChange}>
        <SelectTrigger className="w-48" data-testid="calendar-filter-department">
          <SelectValue placeholder="All Departments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Departments</SelectItem>
        </SelectContent>
      </Select>
      <Select value={staffFilter} onValueChange={onStaffChange}>
        <SelectTrigger className="w-48" data-testid="calendar-filter-staff">
          <SelectValue placeholder="All Staff" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Staff</SelectItem>
        </SelectContent>
      </Select>
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-44" data-testid="calendar-filter-status">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="confirmed">Confirmed</SelectItem>
          <SelectItem value="available">Available</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function DayView({ date }: { date: Date }) {
  return (
    <div className="grid grid-cols-[64px_1fr] rounded-md border">
      <div /> {/* corner */}
      <div className="border-b border-l px-2 py-2 text-center">
        <div className="text-xs font-medium">{format(date, "EEE")}</div>
        <div className="text-sm">{format(date, "d")}</div>
      </div>
      {HOURS.map((h) => (
        <Fragment key={h}>
          <div className="h-16 border-b pr-2 pt-1 text-right text-xs text-muted-foreground">{h}</div>
          <div className="h-16 border-b border-l" />
        </Fragment>
      ))}
    </div>
  );
}

function WeekView({ date }: { date: Date }) {
  const weekStart = startOfWeek(date, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="grid grid-cols-[64px_repeat(7,1fr)] rounded-md border">
      <div />
      {days.map((d) => (
        <div key={format(d, "yyyy-MM-dd")} className="border-b border-l px-2 py-2 text-center">
          <div className="text-xs font-medium">{format(d, "EEE")}</div>
          <div className="text-sm">{format(d, "d")}</div>
        </div>
      ))}
      {HOURS.map((h) => (
        <Fragment key={h}>
          <div className="h-16 border-b pr-2 pt-1 text-right text-xs text-muted-foreground">{h}</div>
          {days.map((d) => (
            <div key={`${format(d, "yyyy-MM-dd")}-${h}`} className="h-16 border-b border-l" />
          ))}
        </Fragment>
      ))}
    </div>
  );
}

function MonthView({ date, today }: { date: Date; today: Date }) {
  const monthStart = startOfMonth(date);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div className="grid grid-cols-7 rounded-md border">
      {WEEKDAY_LABELS.map((d) => (
        <div key={d} className="border-b border-l px-2 py-1 text-center text-xs font-medium text-muted-foreground">
          {d}
        </div>
      ))}
      {cells.map((d, i) => {
        const inMonth = isSameMonth(d, date);
        return (
          <div
            key={format(d, "yyyy-MM-dd")}
            className={`min-h-24 border-b border-l p-1 ${inMonth ? "" : "text-muted-foreground/40"}`}
          >
            <span className={`text-sm ${isSameDay(d, today) ? "font-bold text-primary" : ""}`}>{format(d, "d")}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function BookingCalendar() {
  const [view, setView] = useState<ViewMode>("day");
  const [currentDate, setCurrentDate] = useState<Date>(() => todayInBahrain());
  // Filters (UI-only this phase — reserved for 2C-2 wiring)
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const today = todayInBahrain();

  const navigate = (dir: number) => {
    setCurrentDate((d) => {
      if (view === "day") return addDays(d, dir);
      if (view === "week") return addWeeks(d, dir);
      return addMonths(d, dir);
    });
  };

  const goToday = () => setCurrentDate(todayInBahrain());

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
        departmentFilter={departmentFilter}
        onDepartmentChange={setDepartmentFilter}
        staffFilter={staffFilter}
        onStaffChange={setStaffFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
      />
      <div>
        {view === "day" && <DayView date={currentDate} />}
        {view === "week" && <WeekView date={currentDate} />}
        {view === "month" && <MonthView date={currentDate} today={today} />}
      </div>
    </div>
  );
}
