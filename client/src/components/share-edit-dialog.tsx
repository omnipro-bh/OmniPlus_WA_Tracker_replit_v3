import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { patchBooking, retryAfterMessage, type ShareBooking } from "@/lib/share-api";
import { orderedWritableFieldKeys, customFieldLabel } from "@/lib/share-fields";
import type { ShareLinkConfig } from "@shared/schema";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

interface Control {
  wireKey: string; // actual payload key sent to the server
  label: string;
  type: "date" | "time" | "text" | "number" | "select";
  nullable: boolean; // empty input -> null
  required: boolean;
  options?: string[]; // only for "select" (custom select + boolean)
}

// Standard writable permission keys -> their input controls (payload wire keys).
const STANDARD_CONTROLS: Record<string, Control[]> = {
  slotDate: [{ wireKey: "slotDate", label: "Date", type: "date", nullable: false, required: true }],
  endDate: [{ wireKey: "endDate", label: "End date", type: "date", nullable: true, required: false }],
  startTime: [{ wireKey: "startTime", label: "Start time", type: "time", nullable: false, required: true }],
  endTime: [{ wireKey: "endTime", label: "End time", type: "time", nullable: false, required: true }],
  endDayTime: [
    { wireKey: "endDayStartTime", label: "Last day start time", type: "time", nullable: true, required: false },
    { wireKey: "endDayEndTime", label: "Last day end time", type: "time", nullable: true, required: false },
  ],
  bookingLabel: [{ wireKey: "bookingLabel", label: "Booking label", type: "text", nullable: true, required: false }],
  customerName: [{ wireKey: "customerName", label: "Customer name", type: "text", nullable: true, required: false }],
  customerPhone: [{ wireKey: "customerPhone", label: "Customer phone", type: "text", nullable: false, required: true }],
};

function writableControls(
  config: ShareLinkConfig,
  customFieldNames: Record<number, string>,
  customFieldTypes: Record<number, string>,
  customFieldOptions: Record<number, string[]>,
  customFieldOrder: number[],
): Control[] {
  const names = customFieldNames || {};
  const types = customFieldTypes || {};
  const options = customFieldOptions || {};
  const out: Control[] = [];
  for (const key of orderedWritableFieldKeys(config, names, types, customFieldOrder)) {
    if (key.startsWith("custom:")) {
      const id = parseInt(key.slice("custom:".length), 10);
      // Calculation fields are read-only; never render an input for them (a
      // legacy link could still carry a stale "write" permission).
      if (types[id] === "calculation") continue;
      const label = customFieldLabel(id, names);
      const fieldType = types[id] ?? "text";
      if (fieldType === "boolean") {
        out.push({ wireKey: `custom:${id}`, label, type: "select", nullable: false, required: false, options: ["true", "false"] });
      } else if (fieldType === "select") {
        out.push({ wireKey: `custom:${id}`, label, type: "select", nullable: false, required: false, options: options[id] ?? [] });
      } else if (fieldType === "number") {
        out.push({ wireKey: `custom:${id}`, label, type: "number", nullable: false, required: false });
      } else if (fieldType === "date") {
        out.push({ wireKey: `custom:${id}`, label, type: "date", nullable: false, required: false });
      } else {
        out.push({ wireKey: `custom:${id}`, label, type: "text", nullable: false, required: false });
      }
    } else {
      out.push(...(STANDARD_CONTROLS[key] ?? []));
    }
  }
  return out;
}

function initialValue(booking: ShareBooking, wireKey: string): string {
  if (wireKey.startsWith("custom:")) {
    const id = parseInt(wireKey.slice("custom:".length), 10);
    const v = (booking.customFieldValues ?? []).find((x) => x.fieldId === id);
    return v?.value ?? "";
  }
  const raw = (booking as unknown as Record<string, unknown>)[wireKey];
  return raw == null ? "" : String(raw);
}

interface ShareEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  booking: ShareBooking;
  config: ShareLinkConfig;
  customFieldNames: Record<number, string>;
  customFieldTypes: Record<number, string>;
  customFieldOptions: Record<number, string[]>;
  customFieldOrder: number[];
  onSaved: () => void;
  onSessionExpired: () => void;
  onUnavailable: () => void;
}

export function ShareEditDialog({
  open,
  onOpenChange,
  token,
  booking,
  config,
  customFieldNames,
  customFieldTypes,
  customFieldOptions,
  customFieldOrder,
  onSaved,
  onSessionExpired,
  onUnavailable,
}: ShareEditDialogProps) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const controls = useMemo(
    () => writableControls(config, customFieldNames, customFieldTypes, customFieldOptions, customFieldOrder),
    [config, customFieldNames, customFieldTypes, customFieldOptions, customFieldOrder],
  );

  // (Re)initialize the form whenever the dialog opens for a booking.
  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    for (const c of controls) init[c.wireKey] = initialValue(booking, c.wireKey);
    setInitial(init);
    setValues(init);
    setFormError(null);
  }, [open, booking, controls]);

  const hasChanges = useMemo(() => {
    for (const c of controls) {
      if ((values[c.wireKey] ?? "") !== (initial[c.wireKey] ?? "")) return true;
    }
    return false;
  }, [controls, values, initial]);

  function validate(): string | null {
    for (const c of controls) {
      const v = values[c.wireKey] ?? "";
      if (c.required && v.trim() === "") return `${c.label} is required`;
      if (v !== "") {
        if (c.type === "date" && !DATE_RE.test(v)) return `${c.label} must be a valid date`;
        if (c.type === "time" && !TIME_RE.test(v)) return `${c.label} must be a valid time (HH:MM)`;
      }
    }
    return null;
  }

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const c of controls) {
      const prev = initial[c.wireKey] ?? "";
      const next = values[c.wireKey] ?? "";
      if (prev === next) continue;
      if (c.nullable) {
        payload[c.wireKey] = next === "" ? null : next;
      } else {
        payload[c.wireKey] = next;
      }
    }
    return payload;
  }

  const saveMutation = useMutation({
    mutationFn: async () => patchBooking(token, booking.id, buildPayload()),
    onSuccess: () => {
      toast({ title: "Booking updated" });
      onOpenChange(false);
      onSaved();
    },
    onError: (e: any) => {
      const status = e?.status;
      if (status === 401) {
        onSessionExpired();
        return;
      }
      if (status === 404) {
        onUnavailable();
        return;
      }
      if (status === 429) {
        toast({
          title: "Too many writes",
          description: retryAfterMessage(e?.retryAfter),
          variant: "destructive",
        });
        return;
      }
      if (status === 409) {
        setFormError("That time slot was just taken. Please choose another time.");
        return;
      }
      setFormError(e?.message || "Failed to update booking");
    },
  });

  function handleSave() {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    saveMutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Booking</DialogTitle>
          <DialogDescription>Update the fields you have permission to edit.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {controls.map((c) => (
            <div key={c.wireKey} className="space-y-1.5">
              <Label htmlFor={`share-edit-${c.wireKey}`}>
                {c.label}
                {c.required && <span className="text-destructive"> *</span>}
              </Label>
              {c.type === "select" ? (
                <Select
                  value={values[c.wireKey] || undefined}
                  onValueChange={(v) => setValues((prev) => ({ ...prev, [c.wireKey]: v }))}
                >
                  <SelectTrigger id={`share-edit-${c.wireKey}`} data-testid={`input-share-edit-${c.wireKey}`}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(c.options ?? []).map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`share-edit-${c.wireKey}`}
                  type={c.type}
                  step={c.type === "time" ? 60 : undefined}
                  value={values[c.wireKey] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [c.wireKey]: e.target.value }))}
                  data-testid={`input-share-edit-${c.wireKey}`}
                />
              )}
            </div>
          ))}

          {formError && (
            <div
              className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              data-testid="share-edit-error"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-share-edit-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending || !hasChanges}
            data-testid="button-share-edit-save"
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
