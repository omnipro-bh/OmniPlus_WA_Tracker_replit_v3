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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, Users, Clock, Calendar, Plus, Trash2, Edit, ChevronDown, ChevronRight, Phone, Mail, Download, RefreshCw, Filter, ChevronLeft, Search, CheckCircle, XCircle, CalendarClock, Send, MoreHorizontal, Bell, Settings, RotateCcw, MessageSquare } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface BookingDepartment {
  id: number;
  userId: number;
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

interface Booking {
  id: number;
  departmentId: number;
  staffId: number;
  slotDate: string;
  startTime: string;
  endTime: string;
  customerPhone: string;
  customerName: string | null;
  status: string;
  bookingLabel: string | null;
  createdAt: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function BookingScheduler() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("departments");
  const [selectedDepartment, setSelectedDepartment] = useState<BookingDepartment | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<BookingStaff | null>(null);
  
  // Dialog states
  const [newDeptOpen, setNewDeptOpen] = useState(false);
  const [newStaffOpen, setNewStaffOpen] = useState(false);
  const [newSlotOpen, setNewSlotOpen] = useState(false);
  
  // Form states
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
  const [bookingsStatusFilter, setBookingsStatusFilter] = useState<string>("all");
  const [bookingsSearch, setBookingsSearch] = useState("");
  const [selectedBookings, setSelectedBookings] = useState<Set<number>>(new Set());
  const BOOKINGS_PAGE_SIZE = 10;

  // Booking action modal states
  const [editBookingOpen, setEditBookingOpen] = useState(false);
  const [rescheduleBookingOpen, setRescheduleBookingOpen] = useState(false);
  const [cancelBookingOpen, setCancelBookingOpen] = useState(false);
  const [confirmBookingOpen, setConfirmBookingOpen] = useState(false);
  const [actionBooking, setActionBooking] = useState<any>(null);
  
  // Edit booking form
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editBookingLabel, setEditBookingLabel] = useState("");
  const [editCustomField1, setEditCustomField1] = useState("");
  const [editCustomField2, setEditCustomField2] = useState("");
  const [editDepartmentId, setEditDepartmentId] = useState<string>("");
  const [editStaffId, setEditStaffId] = useState<string>("");
  const [editDate, setEditDate] = useState("");
  const [editSlot, setEditSlot] = useState("");
  const [editAvailableStaff, setEditAvailableStaff] = useState<BookingStaff[]>([]);
  const [editAvailableSlots, setEditAvailableSlots] = useState<any[]>([]);
  
  // Reschedule form
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleDepartmentId, setRescheduleDepartmentId] = useState<string>("");
  const [rescheduleStaffId, setRescheduleStaffId] = useState<string>("");
  const [rescheduleSlot, setRescheduleSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [rescheduleAvailableStaff, setRescheduleAvailableStaff] = useState<BookingStaff[]>([]);
  
  // Notification toggles
  const [sendConfirmNotification, setSendConfirmNotification] = useState(true);
  const [sendCancelNotification, setSendCancelNotification] = useState(true);
  const [sendRescheduleNotification, setSendRescheduleNotification] = useState(true);

  // Queries
  const { data: departments = [], isLoading: loadingDepts } = useQuery<BookingDepartment[]>({
    queryKey: ['/api/booking/departments'],
  });

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

  const { data: bookingsData, isLoading: loadingBookings, refetch: refetchBookings, isFetching: fetchingBookings } = useQuery<{ bookings: Booking[]; total: number }>({
    queryKey: ['/api/booking/bookings', bookingsPage, bookingsStatusFilter, bookingsSearch],
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
      const res = await fetch(`/api/booking/bookings?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch bookings');
      return res.json();
    },
  });

  // Mutations
  const createDeptMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
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

  // Reschedule booking mutation (with optional notification)
  const rescheduleBookingMutation = useMutation({
    mutationFn: async ({ id, newDate, newStartTime, newEndTime, newStaffId, newDepartmentId, sendNotification }: { id: number; newDate: string; newStartTime: string; newEndTime: string; newStaffId?: number; newDepartmentId?: number; sendNotification: boolean }) => {
      return await apiRequest('POST', `/api/booking/bookings/${id}/reschedule`, { newDate, newStartTime, newEndTime, newStaffId, newDepartmentId, sendNotification });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/bookings'] });
      setRescheduleBookingOpen(false);
      setActionBooking(null);
      toast({ title: "Booking rescheduled" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to reschedule booking", variant: "destructive" });
    },
  });

  // Fetch available slots for reschedule
  const fetchAvailableSlotsForReschedule = async (staffId: number, date: string) => {
    try {
      const res = await fetch(`/api/booking/staff/${staffId}/available-slots?date=${date}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch slots');
      const slots = await res.json();
      setAvailableSlots(slots);
    } catch (err) {
      setAvailableSlots([]);
    }
  };

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
  const fetchAvailableSlotsForEdit = async (staffId: number, date: string) => {
    try {
      const res = await fetch(`/api/booking/staff/${staffId}/available-slots?date=${date}`, { credentials: 'include' });
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
    setEditSlot(`${booking.startTime}|${booking.endTime}`);
    // Fetch staff for the current department
    const staffList = await fetchStaffForDepartment(booking.departmentId);
    setEditAvailableStaff(staffList);
    // Fetch available slots for current staff and date
    await fetchAvailableSlotsForEdit(booking.staffId, booking.slotDate);
    setEditBookingOpen(true);
  };

  // Helper to open reschedule modal
  const openRescheduleModal = async (booking: any) => {
    setActionBooking(booking);
    setRescheduleDepartmentId(String(booking.departmentId));
    setRescheduleStaffId(String(booking.staffId));
    setRescheduleDate(booking.slotDate);
    setRescheduleSlot('');
    setAvailableSlots([]);
    // Fetch staff for the current department
    const staffList = await fetchStaffForDepartment(booking.departmentId);
    setRescheduleAvailableStaff(staffList);
    setRescheduleBookingOpen(true);
    // Fetch available slots for current date
    fetchAvailableSlotsForReschedule(booking.staffId, booking.slotDate);
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

  const exportBookingsToExcel = () => {
    if (!bookingsData?.bookings || bookingsData.bookings.length === 0) return;
    
    const headers = [
      'Date', 
      'Start Time', 
      'End Time', 
      'Department',
      'Staff',
      'Customer Name', 
      'Customer Phone', 
      'Booking Label', 
      'Custom Question 1 Label',
      'Custom Question 1 Answer',
      'Custom Question 2 Label',
      'Custom Question 2 Answer',
      'Status', 
      'Created At'
    ];
    const rows = bookingsData.bookings.map((booking: any) => [
      booking.slotDate,
      booking.startTime,
      booking.endTime,
      booking.departmentName || '',
      booking.staffName || '',
      booking.customerName || 'Unknown',
      booking.customerPhone,
      booking.bookingLabel || '',
      booking.customField1Label || '',
      booking.customField1Value || '',
      booking.customField2Label || '',
      booking.customField2Value || '',
      booking.status,
      booking.createdAt ? format(new Date(booking.createdAt), 'yyyy-MM-dd HH:mm') : '',
    ]);
    
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Calendar className="h-6 w-6" />
            Booking Scheduler
          </h1>
          <p className="text-muted-foreground">Manage departments, staff, and appointment bookings</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="departments" data-testid="tab-departments">
            <Building2 className="h-4 w-4 mr-2" />
            Departments
          </TabsTrigger>
          <TabsTrigger value="bookings" data-testid="tab-bookings">
            <Calendar className="h-4 w-4 mr-2" />
            Bookings
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Departments List */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">Departments</CardTitle>
                  <CardDescription>Organize staff by department</CardDescription>
                </div>
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
                        onClick={() => createDeptMutation.mutate({ name: deptName, description: deptDesc || undefined })}
                        disabled={!deptName.trim() || createDeptMutation.isPending}
                        data-testid="button-submit-department"
                      >
                        {createDeptMutation.isPending ? "Creating..." : "Create"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {departments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No departments yet</p>
                  ) : (
                    <div className="space-y-2">
                      {departments.map((dept) => (
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
                          <Label>Day of Week</Label>
                          <Select value={slotDay} onValueChange={setSlotDay}>
                            <SelectTrigger data-testid="select-slot-day">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DAY_NAMES.map((day, i) => (
                                <SelectItem key={i} value={String(i)}>{day}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                              <span className="font-medium">{DAY_NAMES[slot.dayOfWeek]}</span>
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
        </TabsContent>

        <TabsContent value="bookings" className="space-y-4">
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
              {selectedBookings.size > 0 && (
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={bookingsData.bookings.length > 0 && selectedBookings.size === bookingsData.bookings.length}
                          onCheckedChange={handleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Staff</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookingsData.bookings.map((booking: any) => (
                      <TableRow key={booking.id} data-testid={`booking-row-${booking.id}`}>
                        <TableCell>
                          <Checkbox
                            checked={selectedBookings.has(booking.id)}
                            onCheckedChange={() => handleSelectBooking(booking.id)}
                            data-testid={`checkbox-booking-${booking.id}`}
                          />
                        </TableCell>
                        <TableCell>{booking.slotDate}</TableCell>
                        <TableCell>{booking.startTime} - {booking.endTime}</TableCell>
                        <TableCell>{booking.departmentName || '-'}</TableCell>
                        <TableCell>{booking.staffName || '-'}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{booking.customerName || 'Unknown'}</div>
                            <div className="text-sm text-muted-foreground">{booking.customerPhone}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            {booking.bookingLabel && (
                              <div className="text-muted-foreground">{booking.bookingLabel}</div>
                            )}
                            {booking.customField1Label && booking.customField1Value && (
                              <div>
                                <span className="font-medium">{booking.customField1Label}:</span>{' '}
                                {booking.customField1Value}
                              </div>
                            )}
                            {booking.customField2Label && booking.customField2Value && (
                              <div>
                                <span className="font-medium">{booking.customField2Label}:</span>{' '}
                                {booking.customField2Value}
                              </div>
                            )}
                            {!booking.bookingLabel && !booking.customField1Value && !booking.customField2Value && '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(booking.status)}>
                            {booking.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
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
                                <DropdownMenuItem onClick={() => openRescheduleModal(booking)} data-testid={`action-reschedule-${booking.id}`}>
                                  <CalendarClock className="h-4 w-4 mr-2" />
                                  Reschedule
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
                    ))}
                  </TableBody>
                </Table>
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
        </TabsContent>
      </Tabs>

      {/* Edit Booking Dialog */}
      <Dialog open={editBookingOpen} onOpenChange={setEditBookingOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Booking</DialogTitle>
            <DialogDescription>
              Update booking details for {actionBooking?.customerName || actionBooking?.customerPhone}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
            
            <div className="border-t pt-4 mt-4">
              <p className="text-sm font-medium mb-3">Appointment Details</p>
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
                        <SelectItem key={dept.id} value={String(dept.id)}>
                          {dept.name}
                        </SelectItem>
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
                        await fetchAvailableSlotsForEdit(parseInt(val), editDate);
                      }
                    }}
                    disabled={!editDepartmentId}
                  >
                    <SelectTrigger data-testid="select-edit-staff">
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {editAvailableStaff.filter(s => s.isActive).map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <Label htmlFor="edit-date">Date</Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editDate}
                    onChange={async (e) => {
                      setEditDate(e.target.value);
                      setEditSlot('');
                      if (editStaffId && e.target.value) {
                        await fetchAvailableSlotsForEdit(parseInt(editStaffId), e.target.value);
                      }
                    }}
                    min={new Date().toISOString().split('T')[0]}
                    data-testid="input-edit-date"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-slot">Time Slot</Label>
                  {editAvailableSlots.length === 0 && editDate ? (
                    <p className="text-sm text-muted-foreground mt-2">No available slots</p>
                  ) : (
                    <Select
                      value={editSlot}
                      onValueChange={setEditSlot}
                      disabled={!editStaffId || !editDate}
                    >
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBookingOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!actionBooking) return;
                const [startTime, endTime] = editSlot ? editSlot.split('|') : [actionBooking.startTime, actionBooking.endTime];
                editBookingMutation.mutate({
                  id: actionBooking.id,
                  customerName: editCustomerName,
                  customerPhone: editCustomerPhone,
                  bookingLabel: editBookingLabel,
                  customField1Value: editCustomField1,
                  customField2Value: editCustomField2,
                  departmentId: editDepartmentId ? parseInt(editDepartmentId) : undefined,
                  staffId: editStaffId ? parseInt(editStaffId) : undefined,
                  slotDate: editDate || undefined,
                  startTime: startTime || undefined,
                  endTime: endTime || undefined,
                });
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

      {/* Reschedule Booking Dialog */}
      <Dialog open={rescheduleBookingOpen} onOpenChange={setRescheduleBookingOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reschedule Booking</DialogTitle>
            <DialogDescription>
              Choose a new department, staff, date and time for this booking
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
              <div><span className="font-medium">Customer:</span> {actionBooking?.customerName || actionBooking?.customerPhone}</div>
              <div><span className="font-medium">Current:</span> {actionBooking?.slotDate} at {actionBooking?.startTime} ({actionBooking?.departmentName} - {actionBooking?.staffName})</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reschedule-department">Department</Label>
                <Select
                  value={rescheduleDepartmentId}
                  onValueChange={async (val) => {
                    setRescheduleDepartmentId(val);
                    setRescheduleStaffId('');
                    setRescheduleSlot('');
                    setAvailableSlots([]);
                    const staffList = await fetchStaffForDepartment(parseInt(val));
                    setRescheduleAvailableStaff(staffList);
                  }}
                >
                  <SelectTrigger data-testid="select-reschedule-department">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={String(dept.id)}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="reschedule-staff">Staff</Label>
                <Select
                  value={rescheduleStaffId}
                  onValueChange={(val) => {
                    setRescheduleStaffId(val);
                    setRescheduleSlot('');
                    if (rescheduleDate) {
                      fetchAvailableSlotsForReschedule(parseInt(val), rescheduleDate);
                    }
                  }}
                  disabled={!rescheduleDepartmentId}
                >
                  <SelectTrigger data-testid="select-reschedule-staff">
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {rescheduleAvailableStaff.filter(s => s.isActive).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reschedule-date">New Date</Label>
                <Input
                  id="reschedule-date"
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => {
                    setRescheduleDate(e.target.value);
                    setRescheduleSlot('');
                    if (rescheduleStaffId && e.target.value) {
                      fetchAvailableSlotsForReschedule(parseInt(rescheduleStaffId), e.target.value);
                    }
                  }}
                  min={new Date().toISOString().split('T')[0]}
                  disabled={!rescheduleStaffId}
                  data-testid="input-reschedule-date"
                />
              </div>
              <div>
                <Label htmlFor="reschedule-slot">Time Slot</Label>
                {availableSlots.length === 0 && rescheduleDate ? (
                  <p className="text-sm text-muted-foreground mt-2">No available slots</p>
                ) : (
                  <Select
                    value={rescheduleSlot}
                    onValueChange={setRescheduleSlot}
                    disabled={!rescheduleStaffId || !rescheduleDate}
                  >
                    <SelectTrigger data-testid="select-reschedule-slot">
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSlots.map((slot: any) => (
                        <SelectItem key={`${slot.startTime}-${slot.endTime}`} value={`${slot.startTime}|${slot.endTime}`}>
                          {slot.startTime} - {slot.endTime}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="send-reschedule-notification">Send Notification</Label>
                <p className="text-xs text-muted-foreground">Notify customer via WhatsApp</p>
              </div>
              <Switch
                id="send-reschedule-notification"
                checked={sendRescheduleNotification}
                onCheckedChange={setSendRescheduleNotification}
                data-testid="switch-reschedule-notification"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleBookingOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!actionBooking || !rescheduleSlot) return;
                const [newStartTime, newEndTime] = rescheduleSlot.split('|');
                rescheduleBookingMutation.mutate({
                  id: actionBooking.id,
                  newDate: rescheduleDate,
                  newStartTime,
                  newEndTime,
                  newStaffId: rescheduleStaffId ? parseInt(rescheduleStaffId) : undefined,
                  newDepartmentId: rescheduleDepartmentId ? parseInt(rescheduleDepartmentId) : undefined,
                  sendNotification: sendRescheduleNotification,
                });
              }}
              disabled={rescheduleBookingMutation.isPending || !rescheduleSlot}
              data-testid="button-reschedule-booking"
            >
              <CalendarClock className="h-4 w-4 mr-2" />
              {rescheduleBookingMutation.isPending ? 'Rescheduling...' : 'Reschedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
