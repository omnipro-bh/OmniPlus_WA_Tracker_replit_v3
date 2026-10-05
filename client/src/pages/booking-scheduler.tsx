import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, Users, Clock, Calendar, Plus, Trash2, Edit, ChevronDown, ChevronUp, ChevronRight, Phone, Mail, Download, RefreshCw, Filter, ChevronLeft, Search, CheckCircle, XCircle, CalendarClock, Send, MoreHorizontal, Bell, RotateCcw, MessageSquare, Upload, FileSpreadsheet, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CustomFieldsSettings } from "@/components/custom-fields-settings";
import { ManualBookingDialog } from "@/components/manual-booking-dialog";
import { BookingDetailDrawer } from "@/components/booking-detail-drawer";
import { computeCalcValue } from "@/lib/calc";
import { Booking, CustomField } from "@/lib/booking-types";
import { formatDateRangeLong, formatDateRangeShort, dayCount } from "@/lib/booking-date";

interface BookingService {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  slotLabels: string[] | null; // Custom labels for time slots (e.g., weekdays or Morning/Evening/Night)
  isActive: boolean;
  createdAt: string;
}

interface BookingDepartment {
  id: number;
  userId: number;
  serviceId: number | null;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

interface BookingStaff {
  id: number;
  userId: number;
  departmentId: number;
  name: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
}

interface BookingSlot {
  id: number;
  staffId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  capacity: number;
  isActive: boolean;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShortDate(s: string): string {
  const parts = s.split('-').map(Number);
  if (parts.length !== 3 || !Number.isFinite(parts[1]) || !Number.isFinite(parts[2])) return s;
  return `${SHORT_MONTHS[parts[1] - 1]} ${parts[2]}`;
}

function formatCustomFieldValue(field: CustomField, value: string | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  switch (field.fieldType) {
    case 'number':
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value));
    case 'date':
      return formatShortDate(value);
    case 'boolean':
      return value === 'true' ? 'Yes' : 'No';
    default:
      return value;
  }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function BookingScheduler() {
  const { toast } = useToast();
  const [location] = useLocation();
  const activeTab = (() => {
    const segment = location.split("/").filter(Boolean).pop();
    return segment === "bookings" || segment === "settings" ? segment : "departments";
  })();
  const [selectedService, setSelectedService] = useState<BookingService | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<BookingDepartment | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<BookingStaff | null>(null);
  
  // Dialog states
  const [newServiceOpen, setNewServiceOpen] = useState(false);
  const [newDeptOpen, setNewDeptOpen] = useState(false);
  const [newStaffOpen, setNewStaffOpen] = useState(false);
  const [newSlotOpen, setNewSlotOpen] = useState(false);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  
  // Form states
  const [serviceName, setServiceName] = useState("");
  const [serviceDesc, setServiceDesc] = useState("");
  const [serviceSlotLabels, setServiceSlotLabels] = useState<string[]>([...DAY_NAMES]); // Default to weekdays
  const [useCustomSlotLabels, setUseCustomSlotLabels] = useState(false);
  const [deptName, setDeptName] = useState("");
  const [deptDesc, setDeptDesc] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffPhone, setStaffPhone] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [slotDay, setSlotDay] = useState("1");
  const [slotStart, setSlotStart] = useState("09:00");
  const [slotEnd, setSlotEnd] = useState("17:00");
  const [slotDuration, setSlotDuration] = useState("30");
  const [slotCapacity, setSlotCapacity] = useState("1");
  
  // Bookings pagination and filter state
  const [bookingsPage, setBookingsPage] = useState(1);
  const [bookingsStatusFilter, setBookingsStatusFilter] = useState<string>(() => {
    try { return localStorage.getItem('omniplus.bookings.statusFilter') || 'all'; } catch { return 'all'; }
  });
  const [bookingsSort, setBookingsSort] = useState<{ sortBy: string; sortDir: 'asc' | 'desc' }>(() => {
    try {
      const raw = localStorage.getItem('omniplus.bookings.sort');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.sortDir === 'asc' || parsed.sortDir === 'desc') && typeof parsed.sortBy === 'string') {
          return parsed;
        }
      }
    } catch { /* fall through */ }
    return { sortBy: 'slotDate', sortDir: 'desc' };
  });
  const [bookingsSearch, setBookingsSearch] = useState("");
  const [bookingsFullWidth, setBookingsFullWidth] = useState<boolean>(() => {
    try { return localStorage.getItem('omniplus.bookings.fullWidth') === 'true'; } catch { return false; }
  });
  const [selectedBookings, setSelectedBookings] = useState<Set<number>>(new Set());
  const BOOKINGS_PAGE_SIZE = 10;

  // Persist sort + status filter + full-width preferences (search text stays transient)
  useEffect(() => {
    try { localStorage.setItem('omniplus.bookings.sort', JSON.stringify(bookingsSort)); } catch { /* ignore */ }
  }, [bookingsSort]);
  useEffect(() => {
    try { localStorage.setItem('omniplus.bookings.statusFilter', bookingsStatusFilter); } catch { /* ignore */ }
  }, [bookingsStatusFilter]);
  useEffect(() => {
    try { localStorage.setItem('omniplus.bookings.fullWidth', String(bookingsFullWidth)); } catch { /* ignore */ }
  }, [bookingsFullWidth]);

  // Booking action modal states
  const [editBookingOpen, setEditBookingOpen] = useState(false);
  const [cancelBookingOpen, setCancelBookingOpen] = useState(false);
  const [confirmBookingOpen, setConfirmBookingOpen] = useState(false);
  const [actionBooking, setActionBooking] = useState<any>(null);
  const [drawerBooking, setDrawerBooking] = useState<Booking | null>(null);
  
  // Edit booking form
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editBookingLabel, setEditBookingLabel] = useState("");
  const [editCustomField1, setEditCustomField1] = useState("");
  const [editCustomField2, setEditCustomField2] = useState("");
  const [editCustomFieldValues, setEditCustomFieldValues] = useState<Record<string, string>>({});
  const [editStatus, setEditStatus] = useState("");
  const [editDepartmentId, setEditDepartmentId] = useState<string>("");
  const [editStaffId, setEditStaffId] = useState<string>("");
  const [editDate, setEditDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editSlot, setEditSlot] = useState("");
  const [editAvailableStaff, setEditAvailableStaff] = useState<BookingStaff[]>([]);
  const [editAvailableSlots, setEditAvailableSlots] = useState<any[]>([]);
  
  // Notification toggles
  const [sendConfirmNotification, setSendConfirmNotification] = useState(true);
  const [sendCancelNotification, setSendCancelNotification] = useState(true);
  const [sendRescheduleNotification, setSendRescheduleNotification] = useState(true);

  // Notification message settings
  const [confirmMessage, setConfirmMessage] = useState("");
  const [rescheduleMessage, setRescheduleMessage] = useState("");
  const [cancelMessage, setCancelMessage] = useState("");

  // Default messages
  const getDefaultConfirmMessage = () => `Your booking has been confirmed!\n\nDate: {{date}}\nTime: {{time}}\nDepartment: {{department}}\nStaff: {{staff}}\n\nWe look forward to seeing you!`;
  const getDefaultRescheduleMessage = () => `Your booking has been rescheduled.\n\nOld: {{oldDate}} at {{oldTime}}\nNew: {{date}} at {{time}}\nDepartment: {{department}}\nStaff: {{staff}}\n\nWe look forward to seeing you!`;
  const getDefaultCancelMessage = () => `Your booking has been cancelled.\n\nDate: {{date}}\nTime: {{time}}\nDepartment: {{department}}\n\nIf you have questions, please contact us.`;

  // Import dialog states
  const [importDeptOpen, setImportDeptOpen] = useState(false);
  const [importStaffOpen, setImportStaffOpen] = useState(false);
  const [importSlotsOpen, setImportSlotsOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importType, setImportType] = useState<'departments' | 'staff' | 'slots'>('departments');
  
  // File input refs for CSV upload
  const deptFileInputRef = useRef<HTMLInputElement>(null);
  const staffFileInputRef = useRef<HTMLInputElement>(null);
  const slotsFileInputRef = useRef<HTMLInputElement>(null);

  // CSV parsing function with CRLF/BOM handling and header normalization
  const parseCSV = (text: string): any[] => {
    let cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = cleanText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const parseRow = (line: string): string[] => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^["']|["']$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^["']|["']$/g, ''));
      return values;
    };
    
    const rawHeaders = parseRow(lines[0]);
    const headers = rawHeaders.map(h => h.toLowerCase().trim());
    
    const headerAliases: Record<string, string[]> = {
      name: ['name', 'department', 'staff', 'department_name', 'staff_name'],
      description: ['description', 'desc', 'details'],
      phone: ['phone', 'phone_number', 'phonenumber', 'tel', 'telephone'],
      email: ['email', 'email_address', 'e-mail'],
      day: ['day', 'dayofweek', 'day_of_week', 'weekday'],
      starttime: ['starttime', 'start_time', 'start', 'from'],
      endtime: ['endtime', 'end_time', 'end', 'to'],
      slotduration: ['slotduration', 'slot_duration', 'duration', 'minutes'],
      capacity: ['capacity', 'slots', 'max'],
    };
    
    const normalizeHeader = (h: string): string => {
      const lowerH = h.toLowerCase().trim();
      for (const [canonical, aliases] of Object.entries(headerAliases)) {
        if (aliases.includes(lowerH)) return canonical;
      }
      return lowerH;
    };
    
    const normalizedHeaders = headers.map(normalizeHeader);
    
    return lines.slice(1).map(line => {
      const values = parseRow(line);
      const row: Record<string, string> = {};
      normalizedHeaders.forEach((h, i) => { row[h] = values[i] || ''; });
      rawHeaders.forEach((h, i) => { row[h] = values[i] || ''; });
      return row;
    });
  };

  // Download sample CSV
  const downloadSampleCSV = (type: 'departments' | 'staff' | 'slots') => {
    let content = '';
    let filename = '';
    if (type === 'departments') {
      content = 'name,description\nCardiology,Heart and cardiovascular health\nGeneral Medicine,General health checkups\nDentistry,Dental care and treatment';
      filename = 'departments_sample.csv';
    } else if (type === 'staff') {
      content = 'name,phone,email\nDr. John Smith,+1234567890,john@example.com\nDr. Sarah Johnson,,sarah@example.com\nDr. Mike Brown,+0987654321,';
      filename = 'staff_sample.csv';
    } else {
      // Sample shows multiple formats: English name, Arabic name, and numeric (0=Sunday)
      content = 'day,startTime,endTime,slotDuration,capacity\nMonday,09:00,12:00,30,1\nالثلاثاء,09:00,17:00,60,2\n3,10:00,16:00,30,1';
      filename = 'slots_sample.csv';
    }
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'departments' | 'staff' | 'slots') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      console.log('[CSV Import] Raw text length:', text.length, 'First 200 chars:', text.substring(0, 200));
      const rows = parseCSV(text);
      console.log('[CSV Import] Parsed rows:', rows.length, 'Type:', type, 'First row:', rows[0]);
      if (rows.length === 0) {
        toast({ title: "Error", description: "No data found in CSV file. Please check the format.", variant: "destructive" });
        return;
      }
      setImportPreview(rows);
      setImportType(type);
      if (type === 'departments') setImportDeptOpen(true);
      else if (type === 'staff') setImportStaffOpen(true);
      else setImportSlotsOpen(true);
    };
    reader.onerror = () => {
      console.error('[CSV Import] File read error');
      toast({ title: "Error", description: "Failed to read the CSV file.", variant: "destructive" });
    };
    // Read as UTF-8 to support Arabic and other languages
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  // Queries
  const { data: services = [], isLoading: loadingServices } = useQuery<BookingService[]>({
    queryKey: ['/api/booking/services'],
  });

  const { data: departments = [], isLoading: loadingDepts } = useQuery<BookingDepartment[]>({
    queryKey: ['/api/booking/departments'],
  });

  // Filter departments by selected service
  const filteredDepartments = selectedService 
    ? departments.filter(d => d.serviceId === selectedService.id)
    : departments;

  // Get effective slot labels for time slot operations
  // Priority: selectedService (if filtered) > selectedDepartment's service > default weekdays
  const activeServiceForSlots = selectedService 
    || (selectedDepartment?.serviceId ? services.find(s => s.id === selectedDepartment.serviceId) : null);
  const serviceSlotLabelsForDropdown = activeServiceForSlots?.slotLabels?.length 
    ? activeServiceForSlots.slotLabels 
    : DAY_NAMES;

  const { data: staff = [], isLoading: loadingStaff } = useQuery<BookingStaff[]>({
    queryKey: ['/api/booking/departments', selectedDepartment?.id, 'staff'],
    enabled: !!selectedDepartment,
    queryFn: async () => {
      if (!selectedDepartment) return [];
      const res = await fetch(`/api/booking/departments/${selectedDepartment.id}/staff`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch staff');
      return res.json();
    },
  });

  const { data: slots = [], isLoading: loadingSlots } = useQuery<BookingSlot[]>({
    queryKey: ['/api/booking/staff', selectedStaff?.id, 'slots'],
    enabled: !!selectedStaff,
    queryFn: async () => {
      if (!selectedStaff) return [];
      const res = await fetch(`/api/booking/staff/${selectedStaff.id}/slots`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch slots');
      return res.json();
    },
  });

  const { data: bookingsData, isLoading: loadingBookings, refetch: refetchBookings, isFetching: fetchingBookings } = useQuery<{ bookings: Booking[]; customFields: CustomField[]; total: number }>({
    queryKey: ['/api/booking/bookings', bookingsPage, bookingsStatusFilter, bookingsSearch, bookingsSort.sortBy, bookingsSort.sortDir],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(bookingsPage));
      params.set('pageSize', String(BOOKINGS_PAGE_SIZE));
      if (bookingsStatusFilter !== 'all') {
        params.set('status', bookingsStatusFilter);
      }
      if (bookingsSearch.trim()) {
        params.set('search', bookingsSearch.trim());
      }
      params.set('sortBy', bookingsSort.sortBy);
      params.set('sortDir', bookingsSort.sortDir);
      const res = await fetch(`/api/booking/bookings?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch bookings');
      return res.json();
    },
  });

  const customFields = bookingsData?.customFields ?? [];
  const sortedCustomFields = [...customFields].sort((a, b) => a.displayOrder - b.displayOrder);
  const hasCustomFields = sortedCustomFields.length > 0;

  const appointmentChanged = !!actionBooking && (
    editDepartmentId !== String(actionBooking.departmentId) ||
    editStaffId !== String(actionBooking.staffId) ||
    editDate !== actionBooking.slotDate ||
    editEndDate !== (actionBooking.endDate ?? '') ||
    editSlot !== `${actionBooking.startTime}|${actionBooking.endTime}`
  );

  // Notification settings query
  const { data: notificationSettings, isLoading: loadingNotificationSettings } = useQuery<{
    confirmMessage: string | null;
    rescheduleMessage: string | null;
    cancelMessage: string | null;
    customDayNames: string[] | null;
  }>({
    queryKey: ['/api/booking/notification-settings'],
  });

  // Custom day names state - default to English
  const [customDayNames, setCustomDayNames] = useState<string[]>(DAY_NAMES);
  const [useCustomDayNames, setUseCustomDayNames] = useState(false);

  // Effective day names - use custom if enabled and valid, otherwise default
  const effectiveDayNames = useCustomDayNames && customDayNames.length === 7 
    ? customDayNames 
    : DAY_NAMES;

  // Initialize notification message states when settings load
  useEffect(() => {
    if (notificationSettings) {
      setConfirmMessage(notificationSettings.confirmMessage || getDefaultConfirmMessage());
      setRescheduleMessage(notificationSettings.rescheduleMessage || getDefaultRescheduleMessage());
      setCancelMessage(notificationSettings.cancelMessage || getDefaultCancelMessage());
      if (notificationSettings.customDayNames && notificationSettings.customDayNames.length === 7) {
        setCustomDayNames(notificationSettings.customDayNames);
        setUseCustomDayNames(true);
      }
    }
  }, [notificationSettings]);

  // Mutations
  const updateNotificationSettingsMutation = useMutation({
    mutationFn: async (data: { confirmMessage: string; rescheduleMessage: string; cancelMessage: string; customDayNames?: string[] | null }) => {
      return await apiRequest('PUT', '/api/booking/notification-settings', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/notification-settings'] });
      toast({ title: "Settings saved", description: "Notification messages have been updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save settings", variant: "destructive" });
    },
  });

  // Service mutations
  const createServiceMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; slotLabels?: string[] | null }) => {
      return await apiRequest('POST', '/api/booking/services', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/services'] });
      setNewServiceOpen(false);
      setServiceName("");
      setServiceDesc("");
      setServiceSlotLabels([...DAY_NAMES]);
      setUseCustomSlotLabels(false);
      toast({ title: "Service created", description: "Booking service has been created successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create service", variant: "destructive" });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/booking/services/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/services'] });
      queryClient.invalidateQueries({ queryKey: ['/api/booking/departments'] });
      setSelectedService(null);
      toast({ title: "Service deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete service", variant: "destructive" });
    },
  });

  const createDeptMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; serviceId?: number }) => {
      return await apiRequest('POST', '/api/booking/departments', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/departments'] });
      setNewDeptOpen(false);
      setDeptName("");
      setDeptDesc("");
      toast({ title: "Department created", description: "Department has been created successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create department", variant: "destructive" });
    },
  });

  const deleteDeptMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/booking/departments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/departments'] });
      setSelectedDepartment(null);
      toast({ title: "Department deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete department", variant: "destructive" });
    },
  });

  const createStaffMutation = useMutation({
    mutationFn: async (data: { name: string; phone?: string; email?: string }) => {
      if (!selectedDepartment) throw new Error("No department selected");
      return await apiRequest('POST', `/api/booking/departments/${selectedDepartment.id}/staff`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/departments', selectedDepartment?.id, 'staff'] });
      setNewStaffOpen(false);
      setStaffName("");
      setStaffPhone("");
      setStaffEmail("");
      toast({ title: "Staff added", description: "Staff member has been added successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add staff", variant: "destructive" });
    },
  });

  const deleteStaffMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/booking/staff/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/departments', selectedDepartment?.id, 'staff'] });
      setSelectedStaff(null);
      toast({ title: "Staff deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete staff", variant: "destructive" });
    },
  });

  const createSlotMutation = useMutation({
    mutationFn: async (data: { dayOfWeek: number; startTime: string; endTime: string; slotDuration: number; capacity: number }) => {
      if (!selectedStaff) throw new Error("No staff selected");
      return await apiRequest('POST', `/api/booking/staff/${selectedStaff.id}/slots`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/staff', selectedStaff?.id, 'slots'] });
      setNewSlotOpen(false);
      toast({ title: "Time slot added" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add slot", variant: "destructive" });
    },
  });

  const deleteSlotMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/booking/slots/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/staff', selectedStaff?.id, 'slots'] });
      toast({ title: "Slot deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete slot", variant: "destructive" });
    },
  });

  // Import mutations
  const importDeptMutation = useMutation({
    mutationFn: async ({ rows, serviceId }: { rows: any[]; serviceId?: number }) => {
      const res = await apiRequest('POST', '/api/booking/import/departments', { rows, serviceId });
      return await res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/departments'] });
      setImportDeptOpen(false);
      setImportPreview([]);
      toast({ 
        title: "Import complete", 
        description: `${result.imported} department(s) imported${result.errors?.length ? `, ${result.errors.length} error(s)` : ''}` 
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to import departments", variant: "destructive" });
    },
  });

  const importStaffMutation = useMutation({
    mutationFn: async ({ rows, departmentId }: { rows: any[]; departmentId: number }) => {
      const res = await apiRequest('POST', '/api/booking/import/staff', { rows, departmentId });
      return await res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/departments', selectedDepartment?.id, 'staff'] });
      setImportStaffOpen(false);
      setImportPreview([]);
      toast({ 
        title: "Import complete", 
        description: `${result.imported} staff member(s) imported${result.errors?.length ? `, ${result.errors.length} error(s)` : ''}` 
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to import staff", variant: "destructive" });
    },
  });

  const importSlotsMutation = useMutation({
    mutationFn: async ({ rows, staffId }: { rows: any[]; staffId: number }) => {
      const res = await apiRequest('POST', '/api/booking/import/slots', { rows, staffId });
      return await res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/staff', selectedStaff?.id, 'slots'] });
      setImportSlotsOpen(false);
      setImportPreview([]);
      toast({ 
        title: "Import complete", 
        description: `${result.imported} time slot(s) imported${result.errors?.length ? `, ${result.errors.length} error(s)` : ''}` 
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to import slots", variant: "destructive" });
    },
  });

  const updateBookingMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return await apiRequest('PUT', `/api/booking/bookings/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/bookings'] });
      toast({ title: "Booking updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update booking", variant: "destructive" });
    },
  });

  const bulkDeleteBookingsMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return await apiRequest('DELETE', '/api/booking/bookings/bulk', { ids });
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/bookings'] });
      setSelectedBookings(new Set());
      toast({ title: `${ids.length} booking(s) deleted` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete bookings", variant: "destructive" });
    },
  });

  // Bulk change status mutation
  const bulkChangeStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      return await apiRequest('PATCH', '/api/booking/bookings/bulk-status', { ids, status });
    },
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/bookings'] });
      refetchOutdatedCount();
      setSelectedBookings(new Set());
      toast({ title: `${data.updated} booking(s) changed to ${variables.status}` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update statuses", variant: "destructive" });
    },
  });

  const handleBulkStatusChange = (status: string) => {
    if (selectedBookings.size === 0) return;
    if (confirm(`Change status of ${selectedBookings.size} booking(s) to "${status}"?`)) {
      bulkChangeStatusMutation.mutate({ ids: Array.from(selectedBookings), status });
    }
  };

  // Query for outdated confirmed bookings count
  const { data: outdatedCount, refetch: refetchOutdatedCount } = useQuery<{ count: number }>({
    queryKey: ['/api/booking/bookings/outdated-count'],
    enabled: activeTab === 'bookings',
  });

  // Bulk complete outdated bookings mutation
  const bulkCompleteOutdatedMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/booking/bookings/complete-outdated', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/bookings'] });
      refetchOutdatedCount();
      toast({ title: `${data.updated} outdated booking(s) marked as completed` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to complete outdated bookings", variant: "destructive" });
    },
  });

  // Edit booking mutation
  const editBookingMutation = useMutation({
    mutationFn: async (data: { 
      id: number; 
      customerName?: string; 
      customerPhone?: string; 
      bookingLabel?: string; 
      customField1Value?: string; 
      customField2Value?: string;
      departmentId?: number;
      staffId?: number;
      slotDate?: string;
      startTime?: string;
      endTime?: string;
      status?: string;
      customFieldValues?: Record<string, string>;
      sendNotification?: boolean;
    }) => {
      return await apiRequest('PUT', `/api/booking/bookings/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/bookings'] });
      setEditBookingOpen(false);
      setActionBooking(null);
      toast({ title: "Booking updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update booking", variant: "destructive" });
    },
  });

  // Confirm booking mutation (with optional notification)
  const confirmBookingMutation = useMutation({
    mutationFn: async ({ id, sendNotification }: { id: number; sendNotification: boolean }) => {
      return await apiRequest('POST', `/api/booking/bookings/${id}/confirm`, { sendNotification });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/bookings'] });
      setConfirmBookingOpen(false);
      setActionBooking(null);
      toast({ title: "Booking confirmed" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to confirm booking", variant: "destructive" });
    },
  });

  // Cancel booking mutation (with optional notification)
  const cancelBookingMutation = useMutation({
    mutationFn: async ({ id, sendNotification }: { id: number; sendNotification: boolean }) => {
      return await apiRequest('POST', `/api/booking/bookings/${id}/cancel`, { sendNotification });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/bookings'] });
      setCancelBookingOpen(false);
      setActionBooking(null);
      toast({ title: "Booking cancelled" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to cancel booking", variant: "destructive" });
    },
  });

  // Fetch staff for a department (for edit/reschedule)
  const fetchStaffForDepartment = async (departmentId: number): Promise<BookingStaff[]> => {
    try {
      const res = await fetch(`/api/booking/departments/${departmentId}/staff`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch staff');
      return await res.json();
    } catch (err) {
      return [];
    }
  };

  // Fetch available slots for edit modal
  const fetchAvailableSlotsForEdit = async (staffId: number, date: string, excludeBookingId?: number) => {
    try {
      const params = new URLSearchParams({ date });
      if (excludeBookingId !== undefined) params.set('excludeBookingId', String(excludeBookingId));
      const res = await fetch(`/api/booking/staff/${staffId}/available-slots?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch slots');
      const slots = await res.json();
      setEditAvailableSlots(slots);
    } catch (err) {
      setEditAvailableSlots([]);
    }
  };

  // Helper to open edit modal
  const openEditBookingModal = async (booking: any) => {
    setActionBooking(booking);
    setEditCustomerName(booking.customerName || '');
    setEditCustomerPhone(booking.customerPhone || '');
    setEditBookingLabel(booking.bookingLabel || '');
    setEditCustomField1(booking.customField1Value || '');
    setEditCustomField2(booking.customField2Value || '');
    setEditDepartmentId(String(booking.departmentId));
    setEditStaffId(String(booking.staffId));
    setEditDate(booking.slotDate);
    setEditEndDate(booking.endDate ?? '');
    setEditSlot(`${booking.startTime}|${booking.endTime}`);
    setEditStatus(booking.status || '');
    setEditCustomFieldValues(
      Object.fromEntries((booking.customFieldValues ?? []).map((v: any) => [String(v.fieldId), v.value]))
    );
    setSendRescheduleNotification(true);
    // Fetch staff for the current department
    const staffList = await fetchStaffForDepartment(booking.departmentId);
    setEditAvailableStaff(staffList);
    // Fetch available slots for current staff and date (exclude this booking)
    await fetchAvailableSlotsForEdit(booking.staffId, booking.slotDate, booking.id);
    setEditBookingOpen(true);
  };

  // Helper to open cancel modal
  const openCancelModal = (booking: any) => {
    setActionBooking(booking);
    setSendCancelNotification(true);
    setCancelBookingOpen(true);
  };

  // Helper to open confirm modal
  const openConfirmModal = (booking: any) => {
    setActionBooking(booking);
    setSendConfirmNotification(true);
    setConfirmBookingOpen(true);
  };

  const handleSelectAll = () => {
    if (!bookingsData?.bookings) return;
    if (selectedBookings.size === bookingsData.bookings.length) {
      setSelectedBookings(new Set());
    } else {
      setSelectedBookings(new Set(bookingsData.bookings.map((b: any) => b.id)));
    }
  };

  const handleSelectBooking = (id: number) => {
    const newSet = new Set(selectedBookings);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedBookings(newSet);
  };

  const handleBulkDelete = () => {
    if (selectedBookings.size === 0) return;
    if (confirm(`Are you sure you want to permanently delete ${selectedBookings.size} booking(s)? This cannot be undone.`)) {
      bulkDeleteBookingsMutation.mutate(Array.from(selectedBookings));
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'confirmed': return 'default';
      case 'pending': return 'secondary';
      case 'cancelled': return 'destructive';
      case 'completed': return 'outline';
      case 'no_show': return 'destructive';
      default: return 'secondary';
    }
  };

  // Sortable header handler: new column -> ascending; active column -> toggle direction.
  const handleSort = (col: string) => {
    setBookingsSort((prev) => {
      if (prev.sortBy === col) {
        return { sortBy: col, sortDir: prev.sortDir === 'asc' ? 'desc' : 'asc' };
      }
      return { sortBy: col, sortDir: 'asc' };
    });
    setBookingsPage(1);
    setSelectedBookings(new Set());
  };

  // Compact timestamp: "Today 12:08" / "Oct 5 12:08" / "Oct 5 2025" / "—"
  const formatTimestamp = (ts?: string | null): string => {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const now = new Date();
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    const sameYear = d.getFullYear() === now.getFullYear();
    if (sameDay) return `Today ${format(d, 'HH:mm')}`;
    if (sameYear) return format(d, 'MMM d HH:mm');
    return format(d, 'MMM d yyyy');
  };

  const exportBookingsToExcel = () => {
    if (!bookingsData?.bookings || bookingsData.bookings.length === 0) return;
    
    const headers = [
      'Date',
      'End Date',
      'Start Time',
      'End Time',
      'Department',
      'Staff',
      'Customer Name',
      'Customer Phone',
      'Booking Label',
      'Status',
      'Created At',
      ...sortedCustomFields.filter(f => f.fieldType !== 'calculation').map(f => f.name),
      ...sortedCustomFields.filter(f => f.fieldType === 'calculation').map(f => f.name),
      'Custom Question 1 Label',
      'Custom Question 1 Answer',
      'Custom Question 2 Label',
      'Custom Question 2 Answer',
    ];
    const rows = bookingsData.bookings.map((booking: any) => {
      const values = new Map<number, string>((booking.customFieldValues ?? []).map((v: any) => [v.fieldId, v.value]));
      const regularCells = sortedCustomFields.filter(f => f.fieldType !== 'calculation').map(f => values.get(f.id) ?? '');
      const calcCells = sortedCustomFields.filter(f => f.fieldType === 'calculation').map(f => {
        const a = f.calcFieldAId != null ? values.get(f.calcFieldAId) : undefined;
        const b = f.calcFieldBId != null ? values.get(f.calcFieldBId) : undefined;
        const result = computeCalcValue(f.calcOperation, a, b);
        return result == null ? '' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(result);
      });
      return [
        booking.slotDate,
        booking.endDate && booking.endDate !== booking.slotDate ? booking.endDate : '',
        booking.startTime,
        booking.endTime,
        booking.departmentName || '',
        booking.staffName || '',
        booking.customerName || 'Unknown',
        booking.customerPhone,
        booking.bookingLabel || '',
        booking.status,
        booking.createdAt ? format(new Date(booking.createdAt), 'yyyy-MM-dd HH:mm') : '',
        ...regularCells,
        ...calcCells,
        booking.customField1Label || '',
        booking.customField1Value || '',
        booking.customField2Label || '',
        booking.customField2Value || '',
      ];
    });
    
    // Create CSV content with proper escaping
    const escapeCell = (cell: string) => {
      if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    };
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => escapeCell(String(cell))).join(','))
    ].join('\n');
    
    // Add BOM for Excel to recognize UTF-8
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bookings_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({ title: "Export Complete", description: "Bookings exported successfully" });
  };

  if (loadingDepts) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className={bookingsFullWidth ? "p-6 space-y-6 -mx-6 lg:-mx-8" : "p-6 space-y-6"}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Calendar className="h-6 w-6" />
            Booking Scheduler
          </h1>
          <p className="text-muted-foreground">Manage departments, staff, and appointment bookings</p>
        </div>
      </div>

      {activeTab === "departments" && (
        <div className="space-y-4">
          {/* Services Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Booking Services</CardTitle>
                <CardDescription>Group departments by service context (e.g., different branches, languages)</CardDescription>
              </div>
              <Dialog open={newServiceOpen} onOpenChange={setNewServiceOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-service">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Service
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Create Booking Service</DialogTitle>
                    <DialogDescription>Add a new service to group related departments.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="service-name">Name</Label>
                      <Input
                        id="service-name"
                        value={serviceName}
                        onChange={(e) => setServiceName(e.target.value)}
                        placeholder="e.g., English Branch, Arabic Saloon"
                        data-testid="input-service-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="service-desc">Description (optional)</Label>
                      <Textarea
                        id="service-desc"
                        value={serviceDesc}
                        onChange={(e) => setServiceDesc(e.target.value)}
                        placeholder="Describe this service..."
                        data-testid="input-service-description"
                      />
                    </div>
                    
                    {/* Custom Slot Labels */}
                    <div className="border-t pt-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Checkbox
                          id="use-custom-slots"
                          checked={useCustomSlotLabels}
                          onCheckedChange={(checked) => setUseCustomSlotLabels(checked === true)}
                          data-testid="checkbox-use-custom-slots"
                        />
                        <Label htmlFor="use-custom-slots">Customize time slot labels</Label>
                      </div>
                      
                      {useCustomSlotLabels && (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Define custom labels for time slots (e.g., weekdays in Arabic, or "Morning", "Evening", "Night").
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {serviceSlotLabels.map((label, i) => (
                              <div key={i} className="flex items-center gap-1">
                                <Input
                                  value={label}
                                  onChange={(e) => {
                                    const newLabels = [...serviceSlotLabels];
                                    newLabels[i] = e.target.value;
                                    setServiceSlotLabels(newLabels);
                                  }}
                                  className="w-28"
                                  placeholder={`Label ${i + 1}`}
                                  data-testid={`input-slot-label-${i}`}
                                />
                                {serviceSlotLabels.length > 1 && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      const newLabels = serviceSlotLabels.filter((_, idx) => idx !== i);
                                      setServiceSlotLabels(newLabels);
                                    }}
                                    data-testid={`button-remove-label-${i}`}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setServiceSlotLabels([...serviceSlotLabels, ''])}
                              data-testid="button-add-label"
                            >
                              <Plus className="h-3 w-3 mr-1" /> Add
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setServiceSlotLabels([...DAY_NAMES])}
                              data-testid="button-reset-weekdays"
                            >
                              Reset to Weekdays
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => createServiceMutation.mutate({ 
                        name: serviceName, 
                        description: serviceDesc || undefined,
                        slotLabels: useCustomSlotLabels ? serviceSlotLabels.filter(l => l.trim()) : null
                      })}
                      disabled={!serviceName.trim() || createServiceMutation.isPending}
                      data-testid="button-submit-service"
                    >
                      {createServiceMutation.isPending ? "Creating..." : "Create Service"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {loadingServices ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : services.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-sm">No services created yet.</p>
                  <p className="text-xs mt-1">Services help organize departments for different contexts (branches, languages, etc.)</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={selectedService === null ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedService(null);
                      setSelectedDepartment(null);
                      setSelectedStaff(null);
                    }}
                    data-testid="button-service-all"
                  >
                    All Services
                  </Button>
                  {services.map((service) => (
                    <div key={service.id} className="flex items-center gap-1">
                      <Button
                        variant={selectedService?.id === service.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setSelectedService(service);
                          setSelectedDepartment(null);
                          setSelectedStaff(null);
                        }}
                        data-testid={`button-service-${service.id}`}
                      >
                        {service.name}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Delete service "${service.name}"? This will unlink all associated departments.`)) {
                            deleteServiceMutation.mutate(service.id);
                          }
                        }}
                        data-testid={`button-delete-service-${service.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Departments List */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">Departments</CardTitle>
                  <CardDescription>
                    {selectedService ? `Departments in ${selectedService.name}` : "All departments across services"}
                  </CardDescription>
                </div>
                <div className="flex gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" data-testid="button-import-department">
                        <Upload className="h-4 w-4 mr-1" />
                        Import
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => downloadSampleCSV('departments')}>
                        <Download className="h-4 w-4 mr-2" />
                        Download Sample CSV
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => deptFileInputRef.current?.click()}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Upload CSV File
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <input 
                    ref={deptFileInputRef}
                    type="file" 
                    accept=".csv" 
                    className="hidden" 
                    data-testid="input-upload-dept-csv"
                    onChange={(e) => handleFileUpload(e, 'departments')}
                  />
                  <Dialog open={newDeptOpen} onOpenChange={setNewDeptOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" data-testid="button-add-department">
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Department</DialogTitle>
                      <DialogDescription>Add a new department to organize your staff.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="dept-name">Name</Label>
                        <Input
                          id="dept-name"
                          value={deptName}
                          onChange={(e) => setDeptName(e.target.value)}
                          placeholder="e.g., Sales, Support"
                          data-testid="input-department-name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="dept-desc">Description (optional)</Label>
                        <Textarea
                          id="dept-desc"
                          value={deptDesc}
                          onChange={(e) => setDeptDesc(e.target.value)}
                          placeholder="Describe this department..."
                          data-testid="input-department-description"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => createDeptMutation.mutate({ 
                          name: deptName, 
                          description: deptDesc || undefined,
                          serviceId: selectedService?.id 
                        })}
                        disabled={!deptName.trim() || createDeptMutation.isPending}
                        data-testid="button-submit-department"
                      >
                        {createDeptMutation.isPending ? "Creating..." : "Create"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {filteredDepartments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {selectedService ? `No departments in ${selectedService.name}` : "No departments yet"}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {filteredDepartments.map((dept) => (
                        <div
                          key={dept.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedDepartment?.id === dept.id ? 'bg-primary/10 border-primary' : 'hover-elevate'
                          }`}
                          onClick={() => {
                            setSelectedDepartment(dept);
                            setSelectedStaff(null);
                          }}
                          data-testid={`department-item-${dept.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{dept.name}</span>
                              {!selectedService && dept.serviceId && (
                                <Badge variant="secondary" className="text-xs">
                                  {services.find(s => s.id === dept.serviceId)?.name || 'Unknown Service'}
                                </Badge>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Delete this department?')) {
                                  deleteDeptMutation.mutate(dept.id);
                                }
                              }}
                              data-testid={`button-delete-department-${dept.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          {dept.description && (
                            <p className="text-xs text-muted-foreground mt-1">{dept.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Staff List */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">Staff</CardTitle>
                  <CardDescription>
                    {selectedDepartment ? `Staff in ${selectedDepartment.name}` : 'Select a department'}
                  </CardDescription>
                </div>
                {selectedDepartment && (
                  <div className="flex gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" data-testid="button-import-staff">
                          <Upload className="h-4 w-4 mr-1" />
                          Import
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => downloadSampleCSV('staff')}>
                          <Download className="h-4 w-4 mr-2" />
                          Download Sample CSV
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => staffFileInputRef.current?.click()}>
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Upload CSV File
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <input 
                      ref={staffFileInputRef}
                      type="file" 
                      accept=".csv" 
                      className="hidden" 
                      data-testid="input-upload-staff-csv"
                      onChange={(e) => handleFileUpload(e, 'staff')}
                    />
                    <Dialog open={newStaffOpen} onOpenChange={setNewStaffOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" data-testid="button-add-staff">
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Staff Member</DialogTitle>
                          <DialogDescription>Add a new staff member to {selectedDepartment.name}.</DialogDescription>
                        </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="staff-name">Name</Label>
                          <Input
                            id="staff-name"
                            value={staffName}
                            onChange={(e) => setStaffName(e.target.value)}
                            placeholder="Staff member name"
                            data-testid="input-staff-name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="staff-phone">Phone (optional)</Label>
                          <Input
                            id="staff-phone"
                            value={staffPhone}
                            onChange={(e) => setStaffPhone(e.target.value)}
                            placeholder="Phone number"
                            data-testid="input-staff-phone"
                          />
                        </div>
                        <div>
                          <Label htmlFor="staff-email">Email (optional)</Label>
                          <Input
                            id="staff-email"
                            type="email"
                            value={staffEmail}
                            onChange={(e) => setStaffEmail(e.target.value)}
                            placeholder="Email address"
                            data-testid="input-staff-email"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => createStaffMutation.mutate({ 
                            name: staffName, 
                            phone: staffPhone || undefined, 
                            email: staffEmail || undefined 
                          })}
                          disabled={!staffName.trim() || createStaffMutation.isPending}
                          data-testid="button-submit-staff"
                        >
                          {createStaffMutation.isPending ? "Adding..." : "Add Staff"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {!selectedDepartment ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Select a department first</p>
                  ) : loadingStaff ? (
                    <Skeleton className="h-32 w-full" />
                  ) : staff.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No staff in this department</p>
                  ) : (
                    <div className="space-y-2">
                      {staff.map((member) => (
                        <div
                          key={member.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedStaff?.id === member.id ? 'bg-primary/10 border-primary' : 'hover-elevate'
                          }`}
                          onClick={() => setSelectedStaff(member)}
                          data-testid={`staff-item-${member.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{member.name}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Delete this staff member?')) {
                                  deleteStaffMutation.mutate(member.id);
                                }
                              }}
                              data-testid={`button-delete-staff-${member.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                            {member.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {member.phone}
                              </span>
                            )}
                            {member.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {member.email}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Time Slots */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">Time Slots</CardTitle>
                  <CardDescription>
                    {selectedStaff ? `Availability for ${selectedStaff.name}` : 'Select a staff member'}
                  </CardDescription>
                </div>
                {selectedStaff && (
                  <div className="flex gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" data-testid="button-import-slots">
                          <Upload className="h-4 w-4 mr-1" />
                          Import
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => downloadSampleCSV('slots')}>
                          <Download className="h-4 w-4 mr-2" />
                          Download Sample CSV
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => slotsFileInputRef.current?.click()}>
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Upload CSV File
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <input 
                      ref={slotsFileInputRef}
                      type="file" 
                      accept=".csv" 
                      className="hidden" 
                      data-testid="input-upload-slots-csv"
                      onChange={(e) => handleFileUpload(e, 'slots')}
                    />
                    <Dialog open={newSlotOpen} onOpenChange={setNewSlotOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" data-testid="button-add-slot">
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Time Slot</DialogTitle>
                          <DialogDescription>Configure availability for {selectedStaff.name}.</DialogDescription>
                        </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>Time Slot</Label>
                          <Select value={slotDay} onValueChange={setSlotDay}>
                            <SelectTrigger data-testid="select-slot-day">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {serviceSlotLabelsForDropdown.map((label, i) => (
                                <SelectItem key={i} value={String(i)}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {activeServiceForSlots?.slotLabels?.length && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Using custom labels from "{activeServiceForSlots.name}"
                            </p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Start Time</Label>
                            <Input
                              type="time"
                              value={slotStart}
                              onChange={(e) => setSlotStart(e.target.value)}
                              data-testid="input-slot-start"
                            />
                          </div>
                          <div>
                            <Label>End Time</Label>
                            <Input
                              type="time"
                              value={slotEnd}
                              onChange={(e) => setSlotEnd(e.target.value)}
                              data-testid="input-slot-end"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Slot Duration (min)</Label>
                            <Input
                              type="number"
                              value={slotDuration}
                              onChange={(e) => setSlotDuration(e.target.value)}
                              min="5"
                              max="240"
                              data-testid="input-slot-duration"
                            />
                          </div>
                          <div>
                            <Label>Capacity</Label>
                            <Input
                              type="number"
                              value={slotCapacity}
                              onChange={(e) => setSlotCapacity(e.target.value)}
                              min="1"
                              max="100"
                              data-testid="input-slot-capacity"
                            />
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => createSlotMutation.mutate({
                            dayOfWeek: parseInt(slotDay),
                            startTime: slotStart,
                            endTime: slotEnd,
                            slotDuration: parseInt(slotDuration),
                            capacity: parseInt(slotCapacity),
                          })}
                          disabled={createSlotMutation.isPending}
                          data-testid="button-submit-slot"
                        >
                          {createSlotMutation.isPending ? "Adding..." : "Add Slot"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {!selectedStaff ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Select a staff member first</p>
                  ) : loadingSlots ? (
                    <Skeleton className="h-32 w-full" />
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No time slots configured</p>
                  ) : (
                    <div className="space-y-2">
                      {slots.map((slot) => (
                        <div
                          key={slot.id}
                          className="p-3 rounded-lg border"
                          data-testid={`slot-item-${slot.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{serviceSlotLabelsForDropdown[slot.dayOfWeek] || `Slot ${slot.dayOfWeek}`}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm('Delete this slot?')) {
                                  deleteSlotMutation.mutate(slot.id);
                                }
                              }}
                              data-testid={`button-delete-slot-${slot.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {slot.startTime} - {slot.endTime}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="secondary">{slot.slotDuration} min</Badge>
                            <Badge variant="outline">Capacity: {slot.capacity}</Badge>
                            {!slot.isActive && <Badge variant="destructive">Inactive</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "bookings" && (
        <div className="space-y-4">
          {/* Filter and Controls Row */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select
                value={bookingsStatusFilter}
                onValueChange={(val) => {
                  setBookingsStatusFilter(val);
                  setBookingsPage(1);
                  setSelectedBookings(new Set());
                }}
              >
                <SelectTrigger className="w-40" data-testid="select-bookings-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="outdated_confirmed">Outdated Confirmed</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="no_show">No Show</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search bookings..."
                  className="pl-8 w-64"
                  value={bookingsSearch}
                  onChange={(e) => {
                    setBookingsSearch(e.target.value);
                    setBookingsPage(1);
                    setSelectedBookings(new Set());
                  }}
                  data-testid="input-search-bookings"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setNewBookingOpen(true)}
                data-testid="button-new-booking"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Booking
              </Button>
              {selectedBookings.size > 0 && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={bulkChangeStatusMutation.isPending}
                        data-testid="button-bulk-status"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Change Status ({selectedBookings.size})
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleBulkStatusChange('pending')} data-testid="menu-status-pending">
                        <Clock className="h-4 w-4 mr-2 text-amber-500" />
                        Pending
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkStatusChange('confirmed')} data-testid="menu-status-confirmed">
                        <CheckCircle className="h-4 w-4 mr-2 text-blue-500" />
                        Confirmed
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkStatusChange('completed')} data-testid="menu-status-completed">
                        <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                        Completed
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleBulkStatusChange('cancelled')} data-testid="menu-status-cancelled">
                        <XCircle className="h-4 w-4 mr-2 text-red-500" />
                        Cancelled
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkStatusChange('no_show')} data-testid="menu-status-noshow">
                        <XCircle className="h-4 w-4 mr-2 text-gray-500" />
                        No Show
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={bulkDeleteBookingsMutation.isPending}
                    data-testid="button-delete-selected"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete ({selectedBookings.size})
                  </Button>
                </>
              )}
              {(outdatedCount?.count || 0) > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Mark ${outdatedCount?.count} outdated confirmed booking(s) as completed?`)) {
                      bulkCompleteOutdatedMutation.mutate();
                    }
                  }}
                  disabled={bulkCompleteOutdatedMutation.isPending}
                  data-testid="button-complete-outdated"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Complete Outdated ({outdatedCount?.count})
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchBookings()}
                disabled={fetchingBookings}
                data-testid="button-refresh-bookings"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${fetchingBookings ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBookingsFullWidth((v) => !v)}
                data-testid="button-toggle-fullwidth"
                title={bookingsFullWidth ? "Collapse" : "Expand full width"}
                aria-pressed={bookingsFullWidth}
              >
                {bookingsFullWidth ? <Minimize2 className="h-4 w-4 mr-2" /> : <Maximize2 className="h-4 w-4 mr-2" />}
                {bookingsFullWidth ? "Collapse" : "Expand"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportBookingsToExcel()}
                disabled={!bookingsData?.bookings || bookingsData.bookings.length === 0}
                data-testid="button-export-bookings"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Excel
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Bookings ({bookingsData?.total || 0})</CardTitle>
              <CardDescription>View and manage customer appointments</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingBookings ? (
                <Skeleton className="h-64 w-full" />
              ) : !bookingsData?.bookings || bookingsData.bookings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {bookingsStatusFilter !== 'all' ? `No ${bookingsStatusFilter} bookings found` : 'No bookings yet'}
                </p>
              ) : (
                <div className="overflow-x-auto md:overflow-visible">
                <Table className="[&_td]:px-2 [&_th]:px-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={bookingsData.bookings.length > 0 && selectedBookings.size === bookingsData.bookings.length}
                          onCheckedChange={handleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort('slotDate')} data-testid="sort-header-date">
                        <span className="inline-flex items-center gap-1">
                          Date & Time
                          {bookingsSort.sortBy === 'slotDate' && (bookingsSort.sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                        </span>
                      </TableHead>
                      <TableHead className="min-w-[110px]">Service</TableHead>
                      <TableHead className="min-w-[130px] cursor-pointer select-none" onClick={() => handleSort('customerName')} data-testid="sort-header-customer">
                        <span className="inline-flex items-center gap-1">
                          Customer
                          {bookingsSort.sortBy === 'customerName' && (bookingsSort.sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                        </span>
                      </TableHead>
                      <TableHead className="min-w-[90px]">Label</TableHead>
                      <TableHead className="min-w-[95px] cursor-pointer select-none" onClick={() => handleSort('createdAt')} data-testid="sort-header-created">
                        <span className="inline-flex items-center gap-1">
                          Created
                          {bookingsSort.sortBy === 'createdAt' && (bookingsSort.sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                        </span>
                      </TableHead>
                      <TableHead className="min-w-[95px] cursor-pointer select-none" onClick={() => handleSort('updatedAt')} data-testid="sort-header-updated">
                        <span className="inline-flex items-center gap-1">
                          Updated
                          {bookingsSort.sortBy === 'updatedAt' && (bookingsSort.sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                        </span>
                      </TableHead>
                      {hasCustomFields && <TableHead className="min-w-[130px]">Custom Summary</TableHead>}
                      <TableHead className="min-w-[95px] cursor-pointer select-none" onClick={() => handleSort('status')} data-testid="sort-header-status">
                        <span className="inline-flex items-center gap-1">
                          Status
                          {bookingsSort.sortBy === 'status' && (bookingsSort.sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                        </span>
                      </TableHead>
                      <TableHead className="min-w-[140px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookingsData.bookings.map((booking: any) => {
                      const values = new Map<number, string>((booking.customFieldValues ?? []).map((v: any) => [v.fieldId, v.value]));
                      const summaryItems = sortedCustomFields.map((field) => {
                        let display: string;
                        if (field.fieldType === 'calculation') {
                          const a = field.calcFieldAId != null ? values.get(field.calcFieldAId) : undefined;
                          const b = field.calcFieldBId != null ? values.get(field.calcFieldBId) : undefined;
                          const result = computeCalcValue(field.calcOperation, a, b);
                          display = result == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(result);
                        } else {
                          display = formatCustomFieldValue(field, values.get(field.id));
                        }
                        return { field, display };
                      });
                      const visibleItems = summaryItems.slice(0, 2);
                      const extraCount = summaryItems.length - visibleItems.length;
                      return (
                        <TableRow key={booking.id} data-testid={`booking-row-${booking.id}`} onClick={() => setDrawerBooking(booking)} className="cursor-pointer hover:bg-muted/50">
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedBookings.has(booking.id)}
                              onCheckedChange={() => handleSelectBooking(booking.id)}
                              data-testid={`checkbox-booking-${booking.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium flex items-center gap-1.5">
                                {formatDateRangeShort(booking.slotDate, booking.endDate)}
                                {booking.endDate && booking.endDate !== booking.slotDate && (
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">{dayCount(booking.slotDate, booking.endDate)}d</Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">{booking.startTime} - {booking.endTime}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div>{booking.departmentName || '—'}</div>
                              <div className="text-sm text-muted-foreground">{booking.staffName || '—'}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{booking.customerName || 'Unknown'}</div>
                              <div className="text-sm text-muted-foreground">{booking.customerPhone}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="block truncate text-sm text-muted-foreground">{booking.bookingLabel || '—'}</span>
                          </TableCell>
                          <TableCell data-testid={`booking-cell-created-${booking.id}`}>
                            <span className="text-xs whitespace-nowrap text-muted-foreground">{formatTimestamp(booking.createdAt)}</span>
                          </TableCell>
                          <TableCell data-testid={`booking-cell-updated-${booking.id}`}>
                            <span className="text-xs whitespace-nowrap text-muted-foreground">{formatTimestamp(booking.updatedAt)}</span>
                          </TableCell>
                          {hasCustomFields && (
                            <TableCell data-testid={`booking-summary-${booking.id}`}>
                              <div className="flex flex-wrap items-center gap-1">
                                {visibleItems.map(({ field, display }) => (
                                  <Badge key={field.id} variant="secondary" className="whitespace-nowrap">
                                    {field.name}: {display}
                                  </Badge>
                                ))}
                                {extraCount > 0 && (
                                  <Badge variant="outline" className="whitespace-nowrap cursor-pointer" onClick={(e) => { e.stopPropagation(); setDrawerBooking(booking); }}>+{extraCount} more</Badge>
                                )}
                              </div>
                            </TableCell>
                          )}
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(booking.status)}>
                              {booking.status}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <Select
                                value={booking.status}
                                onValueChange={(status) => updateBookingMutation.mutate({ id: booking.id, status })}
                              >
                                <SelectTrigger className="w-28" data-testid={`select-booking-status-${booking.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="confirmed">Confirmed</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                  <SelectItem value="no_show">No Show</SelectItem>
                                </SelectContent>
                              </Select>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" data-testid={`button-booking-actions-${booking.id}`}>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEditBookingModal(booking)} data-testid={`action-edit-${booking.id}`}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Details
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {booking.status === 'pending' && (
                                    <DropdownMenuItem onClick={() => openConfirmModal(booking)} data-testid={`action-confirm-${booking.id}`}>
                                      <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                                      Confirm Booking
                                    </DropdownMenuItem>
                                  )}
                                  {booking.status !== 'cancelled' && (
                                    <DropdownMenuItem onClick={() => openCancelModal(booking)} className="text-destructive" data-testid={`action-cancel-${booking.id}`}>
                                      <XCircle className="h-4 w-4 mr-2" />
                                      Cancel Booking
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {bookingsData && bookingsData.total > 0 && (
            <div className="flex items-center justify-between px-2">
              <p className="text-sm text-muted-foreground">
                Page {bookingsPage} of {Math.ceil(bookingsData.total / BOOKINGS_PAGE_SIZE)} ({bookingsData.total} bookings)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBookingsPage(p => Math.max(1, p - 1))}
                  disabled={bookingsPage <= 1 || fetchingBookings}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBookingsPage(p => p + 1)}
                  disabled={bookingsPage >= Math.ceil(bookingsData.total / BOOKINGS_PAGE_SIZE) || fetchingBookings}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Messages</CardTitle>
              <CardDescription>
                Customize the WhatsApp messages sent when bookings are confirmed, rescheduled, or cancelled
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingNotificationSettings ? (
                <div className="text-sm text-muted-foreground">Loading settings...</div>
              ) : (
                <>
                  <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-md">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 text-blue-500 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-500">Template Variables</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Use these placeholders in your messages. They will be replaced with actual booking data:
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {['{{customerName}}', '{{date}}', '{{time}}', '{{dateRange}}', '{{endDate}}', '{{endTime}}', '{{department}}', '{{staff}}', '{{oldDate}}', '{{oldTime}}'].map((v) => (
                            <code key={v} className="text-xs bg-muted px-1.5 py-0.5 rounded">{v}</code>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Confirmation Message</Label>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmMessage(getDefaultConfirmMessage())} data-testid="button-reset-confirm">
                        <RotateCcw className="w-3 h-3 mr-1" /> Reset
                      </Button>
                    </div>
                    <Textarea
                      value={confirmMessage}
                      onChange={(e) => setConfirmMessage(e.target.value)}
                      placeholder="Your booking has been confirmed..."
                      rows={5}
                      data-testid="textarea-confirm-message"
                    />
                    <p className="text-xs text-muted-foreground">
                      Sent when a pending booking is confirmed
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Reschedule Message</Label>
                      <Button variant="ghost" size="sm" onClick={() => setRescheduleMessage(getDefaultRescheduleMessage())} data-testid="button-reset-reschedule">
                        <RotateCcw className="w-3 h-3 mr-1" /> Reset
                      </Button>
                    </div>
                    <Textarea
                      value={rescheduleMessage}
                      onChange={(e) => setRescheduleMessage(e.target.value)}
                      placeholder="Your booking has been rescheduled..."
                      rows={5}
                      data-testid="textarea-reschedule-message"
                    />
                    <p className="text-xs text-muted-foreground">
                      Sent when a booking is rescheduled
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Cancellation Message</Label>
                      <Button variant="ghost" size="sm" onClick={() => setCancelMessage(getDefaultCancelMessage())} data-testid="button-reset-cancel">
                        <RotateCcw className="w-3 h-3 mr-1" /> Reset
                      </Button>
                    </div>
                    <Textarea
                      value={cancelMessage}
                      onChange={(e) => setCancelMessage(e.target.value)}
                      placeholder="Your booking has been cancelled..."
                      rows={5}
                      data-testid="textarea-cancel-message"
                    />
                    <p className="text-xs text-muted-foreground">
                      Sent when a booking is cancelled
                    </p>
                  </div>

                  <Button
                    onClick={() => updateNotificationSettingsMutation.mutate({
                      confirmMessage,
                      rescheduleMessage,
                      cancelMessage,
                      customDayNames: useCustomDayNames ? customDayNames : null,
                    })}
                    disabled={updateNotificationSettingsMutation.isPending}
                    data-testid="button-save-notification-settings"
                  >
                    {updateNotificationSettingsMutation.isPending ? "Saving..." : "Save Settings"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Custom Day Names Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Day Names Customization</CardTitle>
              <CardDescription>
                Customize the weekday names shown in time slot dropdowns for different languages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="use-custom-days"
                  checked={useCustomDayNames}
                  onCheckedChange={(checked) => setUseCustomDayNames(checked === true)}
                  data-testid="checkbox-use-custom-days"
                />
                <Label htmlFor="use-custom-days">Use custom day names</Label>
              </div>

              {useCustomDayNames && (
                <div className="space-y-4">
                  <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-md">
                    <p className="text-xs text-muted-foreground">
                      Enter custom names for each day of the week. Leave as English or customize for Arabic/other languages.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {DAY_NAMES.map((defaultDay, i) => (
                      <div key={i} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{defaultDay}</Label>
                        <Input
                          value={customDayNames[i] || ''}
                          onChange={(e) => {
                            const newNames = [...customDayNames];
                            newNames[i] = e.target.value;
                            setCustomDayNames(newNames);
                          }}
                          placeholder={defaultDay}
                          data-testid={`input-custom-day-${i}`}
                        />
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCustomDayNames([...DAY_NAMES])}
                    data-testid="button-reset-day-names"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" /> Reset to English
                  </Button>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Custom day names will be reflected in the "Add Time Slot" dropdown and slot displays.
              </p>
            </CardContent>
          </Card>
          <CustomFieldsSettings />
        </div>
      )}

      {/* Import Departments Dialog */}
      <Dialog open={importDeptOpen} onOpenChange={setImportDeptOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Departments</DialogTitle>
            <DialogDescription>
              Review the data before importing. {importPreview.length} department(s) found.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {importPreview.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.slice(0, 10).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row.name || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{row.description || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {importPreview.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    + {importPreview.length - 10} more rows
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportDeptOpen(false); setImportPreview([]); }}>Cancel</Button>
            <Button
              onClick={() => importDeptMutation.mutate({ rows: importPreview, serviceId: selectedService?.id })}
              disabled={importDeptMutation.isPending || importPreview.length === 0}
              data-testid="button-confirm-import-departments"
            >
              {importDeptMutation.isPending ? 'Importing...' : `Import ${importPreview.length} Department(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Staff Dialog */}
      <Dialog open={importStaffOpen} onOpenChange={setImportStaffOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Staff to {selectedDepartment?.name}</DialogTitle>
            <DialogDescription>
              Review the data before importing. {importPreview.length} staff member(s) found.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {importPreview.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.slice(0, 10).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row.name || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{row.phone || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{row.email || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {importPreview.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    + {importPreview.length - 10} more rows
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportStaffOpen(false); setImportPreview([]); }}>Cancel</Button>
            <Button
              onClick={() => selectedDepartment && importStaffMutation.mutate({ rows: importPreview, departmentId: selectedDepartment.id })}
              disabled={importStaffMutation.isPending || importPreview.length === 0 || !selectedDepartment}
              data-testid="button-confirm-import-staff"
            >
              {importStaffMutation.isPending ? 'Importing...' : `Import ${importPreview.length} Staff Member(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Slots Dialog */}
      <Dialog open={importSlotsOpen} onOpenChange={setImportSlotsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Time Slots for {selectedStaff?.name}</DialogTitle>
            <DialogDescription>
              Review the data before importing. {importPreview.length} time slot(s) found.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {importPreview.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Capacity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.slice(0, 10).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row.day || '-'}</TableCell>
                        <TableCell>{row.starttime || '-'}</TableCell>
                        <TableCell>{row.endtime || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{row.slotduration || '30'} min</TableCell>
                        <TableCell className="text-muted-foreground">{row.capacity || '1'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {importPreview.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    + {importPreview.length - 10} more rows
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportSlotsOpen(false); setImportPreview([]); }}>Cancel</Button>
            <Button
              onClick={() => selectedStaff && importSlotsMutation.mutate({ rows: importPreview, staffId: selectedStaff.id })}
              disabled={importSlotsMutation.isPending || importPreview.length === 0 || !selectedStaff}
              data-testid="button-confirm-import-slots"
            >
              {importSlotsMutation.isPending ? 'Importing...' : `Import ${importPreview.length} Time Slot(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Booking Dialog */}
      <ManualBookingDialog open={newBookingOpen} onOpenChange={setNewBookingOpen} />

      {/* Booking Detail Drawer */}
      <BookingDetailDrawer
        booking={drawerBooking}
        customFields={sortedCustomFields}
        onClose={() => setDrawerBooking(null)}
        onEdit={(b) => { setDrawerBooking(null); openEditBookingModal(b); }}
        onCancel={(b) => { setDrawerBooking(null); openCancelModal(b); }}
      />

      {/* Edit Booking Dialog */}
      <Dialog open={editBookingOpen} onOpenChange={setEditBookingOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Booking</DialogTitle>
            <DialogDescription>
              Update booking details for {actionBooking?.customerName || actionBooking?.customerPhone}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto py-4 space-y-5">
            {/* Current reference */}
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <div><span className="font-medium">Customer:</span> {actionBooking?.customerName || actionBooking?.customerPhone}</div>
              <div><span className="font-medium">Current:</span> {formatDateRangeLong(actionBooking?.slotDate ?? '', actionBooking?.endDate)} at {actionBooking?.startTime} ({actionBooking?.departmentName} - {actionBooking?.staffName})</div>
            </div>

            {/* Customer */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-customer-name">Customer Name</Label>
                  <Input
                    id="edit-customer-name"
                    value={editCustomerName}
                    onChange={(e) => setEditCustomerName(e.target.value)}
                    placeholder="Customer name"
                    data-testid="input-edit-customer-name"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-customer-phone">Customer Phone</Label>
                  <Input
                    id="edit-customer-phone"
                    value={editCustomerPhone}
                    onChange={(e) => setEditCustomerPhone(e.target.value)}
                    placeholder="Customer phone"
                    data-testid="input-edit-customer-phone"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-booking-label">Booking Label</Label>
                <Input
                  id="edit-booking-label"
                  value={editBookingLabel}
                  onChange={(e) => setEditBookingLabel(e.target.value)}
                  placeholder="Label (optional)"
                  data-testid="input-edit-booking-label"
                />
              </div>
            </div>

            {/* Appointment */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appointment</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-department">Department</Label>
                  <Select
                    value={editDepartmentId}
                    onValueChange={async (val) => {
                      setEditDepartmentId(val);
                      setEditStaffId('');
                      setEditSlot('');
                      setEditAvailableSlots([]);
                      const staffList = await fetchStaffForDepartment(parseInt(val));
                      setEditAvailableStaff(staffList);
                    }}
                  >
                    <SelectTrigger data-testid="select-edit-department">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={String(dept.id)}>{dept.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-staff">Staff</Label>
                  <Select
                    value={editStaffId}
                    onValueChange={async (val) => {
                      setEditStaffId(val);
                      setEditSlot('');
                      if (editDate) {
                        await fetchAvailableSlotsForEdit(parseInt(val), editDate, actionBooking?.id);
                      }
                    }}
                    disabled={!editDepartmentId}
                  >
                    <SelectTrigger data-testid="select-edit-staff">
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {editAvailableStaff.filter(s => s.isActive).map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger data-testid="select-edit-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="no_show">No Show</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-date">Date</Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editDate}
                    onChange={async (e) => {
                      setEditDate(e.target.value);
                      setEditSlot('');
                      // Auto-clear endDate if it now precedes the new start date
                      if (editEndDate && editEndDate < e.target.value) setEditEndDate('');
                      if (editStaffId && e.target.value) {
                        await fetchAvailableSlotsForEdit(parseInt(editStaffId), e.target.value, actionBooking?.id);
                      }
                    }}
                    min={new Date().toISOString().split('T')[0]}
                    data-testid="input-edit-date"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-end-date">End Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="edit-end-date"
                    type="date"
                    min={editDate || undefined}
                    disabled={!editDate}
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    data-testid="input-edit-end-date"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-slot">Time Slot</Label>
                {editAvailableSlots.length === 0 && editDate ? (
                  <p className="text-sm text-muted-foreground mt-2">No available slots</p>
                ) : (
                  <Select value={editSlot} onValueChange={setEditSlot} disabled={!editStaffId || !editDate}>
                    <SelectTrigger data-testid="select-edit-slot">
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      {editAvailableSlots.map((slot: any) => (
                        <SelectItem key={`${slot.startTime}-${slot.endTime}`} value={`${slot.startTime}|${slot.endTime}`}>
                          {slot.startTime} - {slot.endTime}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Send notification (only when appointment changed) */}
            {appointmentChanged && (
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="edit-send-notification">Send Notification</Label>
                  <p className="text-xs text-muted-foreground">Notify customer via WhatsApp</p>
                </div>
                <Switch
                  id="edit-send-notification"
                  checked={sendRescheduleNotification}
                  onCheckedChange={setSendRescheduleNotification}
                  data-testid="switch-edit-notification"
                />
              </div>
            )}

            {/* Details (dynamic custom fields) */}
            {sortedCustomFields.filter(f => f.fieldType !== 'calculation').length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</h3>
                {sortedCustomFields.filter(f => f.fieldType !== 'calculation').map((field) => {
                  const value = editCustomFieldValues[String(field.id)] ?? '';
                  return (
                    <div key={field.id}>
                      <Label htmlFor={`edit-cf-${field.id}`}>
                        {field.name}{field.isRequired && <span className="text-destructive"> *</span>}
                      </Label>
                      {field.fieldType === 'boolean' ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`edit-cf-${field.id}`}
                            checked={(value || 'false') === 'true'}
                            onCheckedChange={(c) => setEditCustomFieldValues((prev) => ({ ...prev, [String(field.id)]: c ? 'true' : 'false' }))}
                            data-testid={`edit-cf-${field.id}`}
                          />
                          <Label htmlFor={`edit-cf-${field.id}`}>Yes</Label>
                        </div>
                      ) : field.fieldType === 'select' ? (
                        <Select
                          value={value || undefined}
                          onValueChange={(v) => setEditCustomFieldValues((prev) => ({ ...prev, [String(field.id)]: v }))}
                        >
                          <SelectTrigger id={`edit-cf-${field.id}`} data-testid={`edit-cf-${field.id}`}>
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {(field.options || []).map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={`edit-cf-${field.id}`}
                          type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text'}
                          value={value}
                          onChange={(e) => setEditCustomFieldValues((prev) => ({ ...prev, [String(field.id)]: e.target.value }))}
                          data-testid={`edit-cf-${field.id}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Calculated (read-only) */}
            {sortedCustomFields.filter(f => f.fieldType === 'calculation').length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calculated</h3>
                {sortedCustomFields.filter(f => f.fieldType === 'calculation').map((field) => {
                  const a = field.calcFieldAId != null ? editCustomFieldValues[String(field.calcFieldAId)] : undefined;
                  const b = field.calcFieldBId != null ? editCustomFieldValues[String(field.calcFieldBId)] : undefined;
                  const result = computeCalcValue(field.calcOperation, a, b);
                  return (
                    <div key={field.id} className="rounded-md border bg-muted/40 px-3 py-2" data-testid={`edit-calc-${field.id}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{field.name}</span>
                        <span className="text-sm font-semibold">
                          {result == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(result)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legacy fields (chatbot) */}
            {(actionBooking?.customField1Label || actionBooking?.customField2Label) && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Legacy Fields (chatbot)</h3>
                {actionBooking?.customField1Label && (
                  <div>
                    <Label htmlFor="edit-custom-field-1">{actionBooking.customField1Label}</Label>
                    <Input
                      id="edit-custom-field-1"
                      value={editCustomField1}
                      onChange={(e) => setEditCustomField1(e.target.value)}
                      placeholder={actionBooking.customField1Label}
                      data-testid="input-edit-custom-field-1"
                    />
                  </div>
                )}
                {actionBooking?.customField2Label && (
                  <div>
                    <Label htmlFor="edit-custom-field-2">{actionBooking.customField2Label}</Label>
                    <Input
                      id="edit-custom-field-2"
                      value={editCustomField2}
                      onChange={(e) => setEditCustomField2(e.target.value)}
                      placeholder={actionBooking.customField2Label}
                      data-testid="input-edit-custom-field-2"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBookingOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!actionBooking) return;
                if (editEndDate && editEndDate < editDate) {
                  toast({ title: 'Invalid date range', description: 'End date must be on or after the start date', variant: 'destructive' });
                  return;
                }
                if (editEndDate) {
                  const spanDays = Math.round(
                    (new Date(editEndDate + 'T00:00:00Z').getTime() - new Date(editDate + 'T00:00:00Z').getTime()) / 86400000
                  );
                  if (spanDays > 31) {
                    toast({ title: 'Invalid date range', description: 'Booking cannot span more than 31 days', variant: 'destructive' });
                    return;
                  }
                }
                const customFieldValues: Record<string, string> = {};
                for (const f of sortedCustomFields) {
                  if (f.fieldType === 'calculation') continue;
                  const raw = editCustomFieldValues[String(f.id)];
                  if (f.fieldType === 'boolean') {
                    customFieldValues[String(f.id)] = raw ?? 'false';
                  } else if (raw !== undefined && raw.trim() !== '') {
                    customFieldValues[String(f.id)] = raw.trim();
                  }
                }
                const payload: any = {
                  id: actionBooking.id,
                  customerName: editCustomerName,
                  customerPhone: editCustomerPhone,
                  bookingLabel: editBookingLabel,
                  customField1Value: editCustomField1,
                  customField2Value: editCustomField2,
                  status: editStatus || undefined,
                  customFieldValues,
                  sendNotification: appointmentChanged ? sendRescheduleNotification : false,
                };
                if (appointmentChanged) {
                  const [startTime, endTime] = editSlot ? editSlot.split('|') : [actionBooking.startTime, actionBooking.endTime];
                  payload.departmentId = editDepartmentId ? parseInt(editDepartmentId) : undefined;
                  payload.staffId = editStaffId ? parseInt(editStaffId) : undefined;
                  payload.slotDate = editDate || undefined;
                  payload.endDate = editEndDate || null;
                  payload.startTime = startTime || undefined;
                  payload.endTime = endTime || undefined;
                }
                editBookingMutation.mutate(payload);
              }}
              disabled={editBookingMutation.isPending}
              data-testid="button-save-edit"
            >
              {editBookingMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Booking Dialog */}
      <Dialog open={confirmBookingOpen} onOpenChange={setConfirmBookingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Booking</DialogTitle>
            <DialogDescription>
              Confirm this booking for {actionBooking?.customerName || actionBooking?.customerPhone}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
              <div><span className="font-medium">Date:</span> {actionBooking?.slotDate}</div>
              <div><span className="font-medium">Time:</span> {actionBooking?.startTime} - {actionBooking?.endTime}</div>
              <div><span className="font-medium">Department:</span> {actionBooking?.departmentName}</div>
              <div><span className="font-medium">Staff:</span> {actionBooking?.staffName}</div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="send-confirm-notification">Send Notification</Label>
                <p className="text-xs text-muted-foreground">Notify customer via WhatsApp</p>
              </div>
              <Switch
                id="send-confirm-notification"
                checked={sendConfirmNotification}
                onCheckedChange={setSendConfirmNotification}
                data-testid="switch-confirm-notification"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBookingOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!actionBooking) return;
                confirmBookingMutation.mutate({
                  id: actionBooking.id,
                  sendNotification: sendConfirmNotification,
                });
              }}
              disabled={confirmBookingMutation.isPending}
              data-testid="button-confirm-booking"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {confirmBookingMutation.isPending ? 'Confirming...' : 'Confirm Booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Booking Dialog */}
      <Dialog open={cancelBookingOpen} onOpenChange={setCancelBookingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Booking</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this booking?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
              <div><span className="font-medium">Customer:</span> {actionBooking?.customerName || actionBooking?.customerPhone}</div>
              <div><span className="font-medium">Date:</span> {actionBooking?.slotDate}</div>
              <div><span className="font-medium">Time:</span> {actionBooking?.startTime} - {actionBooking?.endTime}</div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="send-cancel-notification">Send Notification</Label>
                <p className="text-xs text-muted-foreground">Notify customer via WhatsApp</p>
              </div>
              <Switch
                id="send-cancel-notification"
                checked={sendCancelNotification}
                onCheckedChange={setSendCancelNotification}
                data-testid="switch-cancel-notification"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelBookingOpen(false)}>Keep Booking</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!actionBooking) return;
                cancelBookingMutation.mutate({
                  id: actionBooking.id,
                  sendNotification: sendCancelNotification,
                });
              }}
              disabled={cancelBookingMutation.isPending}
              data-testid="button-cancel-booking"
            >
              <XCircle className="h-4 w-4 mr-2" />
              {cancelBookingMutation.isPending ? 'Cancelling...' : 'Cancel Booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
