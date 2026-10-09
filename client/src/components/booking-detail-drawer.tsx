import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { resolveCalcValues, OPERATION_SYMBOLS, rehydrateFormula } from "@/lib/calc";
import type { Booking, CustomField } from "@/lib/booking-types";
import { formatDateRangeLong, dayCount, formatEndDayWindow } from "@/lib/booking-date";

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case 'confirmed': return 'default';
    case 'pending': return 'secondary';
    case 'cancelled': return 'destructive';
    case 'completed': return 'outline';
    case 'no_show': return 'destructive';
    default: return 'secondary';
  }
}

function formatFullDate(s: string): string {
  const parts = s.split('-').map(Number);
  if (parts.length !== 3 || !Number.isFinite(parts[1]) || !Number.isFinite(parts[2])) return s;
  return `${MONTHS[parts[1] - 1]} ${parts[2]}, ${parts[0]}`;
}

function formatValue(field: CustomField, value: string | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  switch (field.fieldType) {
    case 'number':
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value));
    case 'date':
      return formatFullDate(value);
    case 'boolean':
      return value === 'true' ? 'Yes' : 'No';
    default:
      return value;
  }
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{label}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right">{value || '—'}</span>
    </div>
  );
}

interface Props {
  booking: Booking | null;
  customFields: CustomField[];
  onClose: () => void;
  onEdit: (b: Booking) => void;
  onCancel: (b: Booking) => void;
}

export function BookingDetailDrawer({ booking, customFields, onClose, onEdit, onCancel }: Props) {
  if (!booking) return null;

  const values = new Map<number, string>((booking.customFieldValues ?? []).map((v) => [v.fieldId, v.value]));
  const fieldNameById = new Map<number, string>(customFields.map((f) => [f.id, f.name]));
  const regularFields = customFields.filter((f) => f.fieldType !== 'calculation');
  const calcFields = customFields.filter((f) => f.fieldType === 'calculation');
  const resolvedCalc = resolveCalcValues(customFields, values);

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[560px] p-0 flex flex-col">
        {/* Header */}
        <div className="border-b px-6 py-4 pr-12">
          <SheetHeader className="text-left space-y-1">
            <SheetTitle data-testid="drawer-customer-name">{booking.customerName || 'Unknown'}</SheetTitle>
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant(booking.status)}>{booking.status}</Badge>
              {booking.endDate && booking.endDate !== booking.slotDate && (
                <Badge variant="secondary" data-testid="drawer-days-badge">{dayCount(booking.slotDate, booking.endDate)} days</Badge>
              )}
            </div>
          </SheetHeader>
        </div>

        {/* Top actions */}
        <div className="border-b px-6 py-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(booking)} data-testid="drawer-action-edit">Edit</Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => onCancel(booking)} data-testid="drawer-action-cancel">Cancel</Button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <Section label="Appointment">
            <Field label="Date" value={formatDateRangeLong(booking.slotDate, booking.endDate)} />
            <Field label="Time" value={`${booking.startTime} – ${booking.endTime}`} />
            {formatEndDayWindow(booking) && <Field label="Last day" value={formatEndDayWindow(booking)!} />}
            <Field label="Service" value={booking.departmentName} />
            <Field label="Provider" value={booking.staffName} />
            <Field label="Label" value={booking.bookingLabel} />
          </Section>

          <Section label="Customer">
            <Field label="Phone" value={booking.customerPhone} />
          </Section>

          {regularFields.length > 0 && (
            <Section label="Details">
              {regularFields.map((f) => (
                <Field key={f.id} label={f.name} value={formatValue(f, values.get(f.id))} />
              ))}
            </Section>
          )}

          {calcFields.length > 0 && (
            <Section label="Calculated">
              {calcFields.map((f) => {
                const result = resolvedCalc.get(f.id) ?? null;
                const label = f.calcFormula
                  ? `${f.name} = ${rehydrateFormula(f.calcFormula, fieldNameById)}`
                  : `${f.name} = ${fieldNameById.get(f.calcFieldAId ?? -1) ?? '?'} ${OPERATION_SYMBOLS[f.calcOperation ?? 'add']} ${fieldNameById.get(f.calcFieldBId ?? -1) ?? '?'}`;
                return (
                  <div key={f.id} className="flex items-center justify-between gap-4 py-1" data-testid={`drawer-calc-${f.id}`}>
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-semibold text-right">
                      {result == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(result)}
                    </span>
                  </div>
                );
              })}
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-3 text-xs text-muted-foreground space-y-0.5">
          <div>Created {booking.createdAt ? format(new Date(booking.createdAt), 'MMM d, yyyy HH:mm') : '—'}</div>
          <div>Updated {booking.updatedAt ? format(new Date(booking.updatedAt), 'MMM d, yyyy HH:mm') : '—'}</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
