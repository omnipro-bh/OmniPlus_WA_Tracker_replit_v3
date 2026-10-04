import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, Loader2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { computeCalcValue, OPERATION_SYMBOLS, type CalcOperation } from "@/lib/calc";
import { format } from "date-fns";

// ---- local types (mirror server responses) ----
interface Department { id: number; name: string; }
interface Staff { id: number; departmentId: number; name: string; }

type FieldType = "text" | "number" | "date" | "boolean" | "select" | "calculation";

interface CustomField {
  id: number;
  name: string;
  fieldType: FieldType;
  isRequired: boolean;
  displayOrder: number;
  options: string[] | null;
  defaultValue: string | null;
  calcOperation: CalcOperation | null;
  calcFieldAId: number | null;
  calcFieldBId: number | null;
  isActive: boolean;
}

interface Slot { startTime: string; endTime: string; }

interface FormState {
  departmentId: string;
  staffId: string;
  slotDate: string;
  slot: Slot | null;
  customerName: string;
  customerPhone: string;
  bookingLabel: string;
  customFieldValues: Record<string, string>;
}

const INITIAL_FORM: FormState = {
  departmentId: "",
  staffId: "",
  slotDate: "",
  slot: null,
  customerName: "",
  customerPhone: "",
  bookingLabel: "",
  customFieldValues: {},
};

export function ManualBookingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Slot[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  // Tenant-scoped data (authenticated queries)
  const { data: departments = [] } = useQuery<Department[]>({ queryKey: ["/api/booking/departments"] });
  const { data: customFields = [] } = useQuery<CustomField[]>({ queryKey: ["/api/booking/custom-fields"] });
  const { data: staff = [], isFetching: loadingStaff } = useQuery<Staff[]>({
    queryKey: ["/api/booking/departments", form.departmentId, "staff"],
    enabled: !!form.departmentId,
  });

  const sortedDepartments = useMemo(
    () => [...departments].sort((a, b) => a.name.localeCompare(b.name)),
    [departments],
  );
  const sortedStaff = useMemo(
    () => [...staff].sort((a, b) => a.name.localeCompare(b.name)),
    [staff],
  );
  const activeFields = useMemo(
    () => customFields.filter((f) => f.isActive).sort((a, b) => a.displayOrder - b.displayOrder),
    [customFields],
  );
  const fieldNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const f of customFields) m.set(f.id, f.name);
    return m;
  }, [customFields]);

  // Fetch available slots fresh whenever staff + date are both selected
  const fetchAvailability = useCallback(async (staffId: string, date: string) => {
    setLoadingAvailability(true);
    try {
      const res = await fetch(`/api/booking/staff/${staffId}/available-slots?date=${date}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch slots");
      const slots = await res.json();
      setAvailability(Array.isArray(slots) ? slots : []);
    } catch {
      setAvailability([]);
    } finally {
      setLoadingAvailability(false);
    }
  }, []);

  useEffect(() => {
    if (form.staffId && form.slotDate) {
      fetchAvailability(form.staffId, form.slotDate);
    } else {
      setAvailability([]);
    }
  }, [form.staffId, form.slotDate, fetchAvailability]);

  // Form helpers
  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const updateCustomField = (fieldId: number, value: string) =>
    setForm((f) => ({ ...f, customFieldValues: { ...f.customFieldValues, [String(fieldId)]: value } }));

  const selectDepartment = (val: string) =>
    setForm((f) => ({ ...f, departmentId: val, staffId: "", slot: null }));

  const selectStaff = (val: string) =>
    setForm((f) => ({ ...f, staffId: val, slot: null }));

  const selectDate = (val: string) =>
    setForm((f) => ({ ...f, slotDate: val, slot: null }));

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setFormError(null);
    setAvailability([]);
  };

  // Client validation
  const validate = (): string | null => {
    if (!form.departmentId) return "Please select a department";
    if (!form.staffId) return "Please select a staff member";
    if (!form.slotDate) return "Please select a date";
    if (!form.slot) return "Please select a time slot";
    if (!form.customerName.trim()) return "Customer name is required";
    if (!form.customerPhone.trim()) return "Customer phone is required";
    for (const field of activeFields) {
      if (field.fieldType === "calculation") continue;
      const value = form.customFieldValues[String(field.id)] ?? "";
      if (field.isRequired && value.trim() === "") return `"${field.name}" is required`;
      if (value.trim() === "") continue;
      if (field.fieldType === "number" && !Number.isFinite(Number(value))) return `"${field.name}" must be a number`;
      if (field.fieldType === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return `"${field.name}" must be a date`;
      if (field.fieldType === "boolean" && value !== "true" && value !== "false") return `"${field.name}" must be true or false`;
      if (field.fieldType === "select" && (!field.options || !field.options.includes(value))) return `"${field.name}" has an invalid option`;
    }
    return null;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // Build customFieldValues map (skip calculation fields — computed, not submitted)
      const customFieldValues: Record<string, string> = {};
      for (const field of activeFields) {
        if (field.fieldType === "calculation") continue;
        const raw = form.customFieldValues[String(field.id)];
        if (field.fieldType === "boolean") {
          customFieldValues[String(field.id)] = raw ?? "false";
        } else if (raw !== undefined && raw.trim() !== "") {
          customFieldValues[String(field.id)] = raw.trim();
        }
      }

      const res = await fetch("/api/booking/bookings/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          departmentId: Number(form.departmentId),
          staffId: Number(form.staffId),
          slotDate: form.slotDate,
          startTime: form.slot!.startTime,
          endTime: form.slot!.endTime,
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          bookingLabel: form.bookingLabel.trim() || undefined,
          customFieldValues,
        }),
      });

      if (!res.ok) {
        let msg = res.statusText;
        try {
          const j = await res.json();
          msg = j.error || j.message || msg;
        } catch {
          /* keep statusText */
        }
        const err: any = new Error(msg);
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/booking/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/booking/calendar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/booking/staff"] });
      toast({ title: "Booking created" });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      if (error?.status === 409) {
        setFormError("That time slot was just taken. Please choose another time.");
        if (form.staffId && form.slotDate) fetchAvailability(form.staffId, form.slotDate);
      } else if (error?.status === 404) {
        toast({ title: "Not found", description: error.message || "The selected resource was not found", variant: "destructive" });
      } else {
        setFormError(error?.message || "Failed to create booking");
        toast({ title: "Error", description: error?.message || "Failed to create booking", variant: "destructive" });
      }
    },
  });

  const handleSubmit = () => {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    createMutation.mutate();
  };

  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Booking</DialogTitle>
          <DialogDescription>Create a manual booking for a customer.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Appointment */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">Appointment</h3>

            <div className="space-y-1.5">
              <Label htmlFor="mb-department">Department</Label>
              <Select value={form.departmentId || undefined} onValueChange={selectDepartment}>
                <SelectTrigger id="mb-department" data-testid="select-department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {sortedDepartments.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mb-staff">Staff</Label>
              <Select value={form.staffId || undefined} onValueChange={selectStaff} disabled={!form.departmentId || loadingStaff}>
                <SelectTrigger id="mb-staff" data-testid="select-staff">
                  <SelectValue placeholder={loadingStaff ? "Loading…" : !form.departmentId ? "Select department first" : "Select staff"} />
                </SelectTrigger>
                <SelectContent>
                  {sortedStaff.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.departmentId && !loadingStaff && sortedStaff.length === 0 && (
                <p className="text-xs text-muted-foreground">No staff in this department.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mb-date">Date</Label>
              <Input
                id="mb-date"
                type="date"
                min={today}
                value={form.slotDate}
                onChange={(e) => selectDate(e.target.value)}
                data-testid="input-date"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Time</Label>
              {loadingAvailability ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading available times…
                </div>
              ) : !form.staffId || !form.slotDate ? (
                <p className="text-xs text-muted-foreground">Select staff and date to see available times.</p>
              ) : availability.length === 0 ? (
                <p className="text-sm text-muted-foreground">No available times on this date. Try another date.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {availability.map((s) => {
                    const isSelected = form.slot?.startTime === s.startTime && form.slot?.endTime === s.endTime;
                    return (
                      <Button
                        key={s.startTime}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => updateField("slot", s)}
                        data-testid={`slot-${s.startTime}`}
                      >
                        {s.startTime}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Customer */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">Customer</h3>
            <div className="space-y-1.5">
              <Label htmlFor="mb-name">Name</Label>
              <Input
                id="mb-name"
                value={form.customerName}
                onChange={(e) => updateField("customerName", e.target.value)}
                placeholder="Customer name"
                data-testid="input-customer-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-phone">Phone</Label>
              <Input
                id="mb-phone"
                value={form.customerPhone}
                onChange={(e) => updateField("customerPhone", e.target.value)}
                placeholder="Customer phone"
                data-testid="input-customer-phone"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-label">Label / Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="mb-label"
                value={form.bookingLabel}
                onChange={(e) => updateField("bookingLabel", e.target.value)}
                placeholder="Optional label"
                data-testid="input-booking-label"
              />
            </div>
          </div>

          {/* Custom fields */}
          {activeFields.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Details</h3>
              {activeFields.map((field) => {
                const value = form.customFieldValues[String(field.id)] ?? "";

                if (field.fieldType === "calculation") {
                  const a = field.calcFieldAId == null ? undefined : form.customFieldValues[String(field.calcFieldAId)];
                  const b = field.calcFieldBId == null ? undefined : form.customFieldValues[String(field.calcFieldBId)];
                  const result = computeCalcValue(field.calcOperation, a, b);
                  const symbol = OPERATION_SYMBOLS[field.calcOperation ?? "add"];
                  const aName = fieldNameById.get(field.calcFieldAId ?? -1) ?? "?";
                  const bName = fieldNameById.get(field.calcFieldBId ?? -1) ?? "?";
                  return (
                    <div key={field.id} className="rounded-md border bg-muted/40 px-3 py-2" data-testid={`calc-${field.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{field.name}</span>
                        <span className="text-xs text-muted-foreground">{aName} {symbol} {bName}</span>
                      </div>
                      <div className="text-lg font-semibold">{result == null ? "—" : result}</div>
                    </div>
                  );
                }

                const required = field.isRequired;
                return (
                  <div key={field.id} className="space-y-1.5">
                    <Label htmlFor={`mb-cf-${field.id}`}>
                      {field.name}{required && <span className="text-destructive"> *</span>}
                    </Label>

                    {field.fieldType === "boolean" ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`mb-cf-${field.id}`}
                          checked={(value || "false") === "true"}
                          onCheckedChange={(c) => updateCustomField(field.id, c ? "true" : "false")}
                          data-testid={`cf-${field.id}`}
                        />
                        <Label htmlFor={`mb-cf-${field.id}`}>Yes</Label>
                      </div>
                    ) : field.fieldType === "select" ? (
                      <Select value={value || undefined} onValueChange={(v) => updateCustomField(field.id, v)}>
                        <SelectTrigger id={`mb-cf-${field.id}`} data-testid={`cf-${field.id}`}>
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
                        id={`mb-cf-${field.id}`}
                        type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
                        value={value}
                        onChange={(e) => updateCustomField(field.id, e.target.value)}
                        placeholder={field.fieldType === "number" ? "0" : ""}
                        data-testid={`cf-${field.id}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {formError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="booking-form-error">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-booking">
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-booking">
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {createMutation.isPending ? "Creating…" : "Create Booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
