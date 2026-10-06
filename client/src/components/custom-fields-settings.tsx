import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { CUSTOM_FIELDS_DEFAULT_LIMIT, CUSTOM_FIELDS_MAX_LIMIT } from "@shared/schema";

const MAX_OPTIONS = 20;

const TYPE_LABELS: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes/No",
  select: "Select",
  calculation: "Calculation",
};

const OPERATION_LABELS: Record<string, string> = {
  add: "Add", subtract: "Subtract", multiply: "Multiply", divide: "Divide",
};

const OPERATION_SYMBOLS: Record<string, string> = {
  add: "+", subtract: "−", multiply: "×", divide: "÷",
};

interface CustomField {
  id: number;
  name: string;
  fieldType: "text" | "number" | "date" | "boolean" | "select" | "calculation";
  isRequired: boolean;
  displayOrder: number;
  options: string[] | null;
  defaultValue: string | null;
  calcOperation: "add" | "subtract" | "multiply" | "divide" | null;
  calcFieldAId: number | null;
  calcFieldBId: number | null;
  isActive: boolean;
}

export function CustomFieldsSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const limit = Math.min(
    (user as any)?.customFieldsLimit ?? CUSTOM_FIELDS_DEFAULT_LIMIT,
    CUSTOM_FIELDS_MAX_LIMIT
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);

  // Form state (shared by add + edit)
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [isRequired, setIsRequired] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [defaultValue, setDefaultValue] = useState("");
  const [calcOperation, setCalcOperation] = useState("add");
  const [calcFieldAId, setCalcFieldAId] = useState<number | null>(null);
  const [calcFieldBId, setCalcFieldBId] = useState<number | null>(null);

  const { data: fields = [], isLoading } = useQuery<CustomField[]>({
    queryKey: ["/api/booking/custom-fields"],
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/booking/custom-fields"] });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      await apiRequest("POST", "/api/booking/custom-fields", data);
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      resetForm();
      toast({ title: "Custom field added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to add field", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, any> }) => {
      await apiRequest("PATCH", `/api/booking/custom-fields/${id}`, data);
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      resetForm();
      toast({ title: "Custom field updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to update field", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/booking/custom-fields/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Custom field deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to delete field", variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("PATCH", "/api/booking/custom-fields/reorder", { ids });
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to reorder fields", variant: "destructive" }),
  });

  // Active numeric fields available as calculation operands (excluding self when editing)
  const numericFields = fields.filter(
    (f) => f.fieldType === "number" && (!editingField || f.id !== editingField.id),
  );

  function fieldNameById(id: number | null): string {
    if (id == null) return "—";
    const f = fields.find((f) => f.id === id);
    return f ? f.name : "—";
  }

  function resetForm() {
    setName("");
    setFieldType("text");
    setIsRequired(false);
    setOptions([]);
    setDefaultValue("");
    setCalcOperation("add");
    setCalcFieldAId(null);
    setCalcFieldBId(null);
    setEditingField(null);
  }

  function openAdd() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(field: CustomField) {
    setEditingField(field);
    setName(field.name);
    setFieldType(field.fieldType);
    setIsRequired(field.isRequired);
    setOptions(field.options || []);
    setDefaultValue(field.defaultValue || "");
    setCalcOperation(field.calcOperation || "add");
    setCalcFieldAId(field.calcFieldAId ?? null);
    setCalcFieldBId(field.calcFieldBId ?? null);
    setDialogOpen(true);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const newIds = fields.map((f) => f.id);
    [newIds[index], newIds[target]] = [newIds[target], newIds[index]];
    reorderMutation.mutate(newIds);
  }

  function handleDelete(field: CustomField) {
    if (confirm(`Delete custom field "${field.name}"?`)) {
      deleteMutation.mutate(field.id);
    }
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    setOptions([...options, ""]);
  }

  function updateOption(i: number, value: string) {
    const next = [...options];
    next[i] = value;
    setOptions(next);
  }

  function removeOption(i: number) {
    setOptions(options.filter((_, idx) => idx !== i));
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Error", description: "Field name is required", variant: "destructive" });
      return;
    }
    if (fieldType === "select") {
      const cleaned = options.map((o) => o.trim()).filter(Boolean);
      if (cleaned.length === 0) {
        toast({ title: "Error", description: "Select fields require at least one option", variant: "destructive" });
        return;
      }
    }
    if (fieldType === "calculation") {
      if (calcFieldAId == null || calcFieldBId == null) {
        toast({ title: "Error", description: "Calculation fields require two referenced fields", variant: "destructive" });
        return;
      }
      if (calcFieldAId === calcFieldBId) {
        toast({ title: "Error", description: "Calculation fields must reference two different fields", variant: "destructive" });
        return;
      }
    }

    const payload = {
      name: trimmed,
      fieldType,
      isRequired: fieldType === "calculation" ? false : isRequired,
      options: fieldType === "select" ? options.map((o) => o.trim()).filter(Boolean) : null,
      defaultValue: defaultValue.trim() || null,
      calcOperation: fieldType === "calculation" ? calcOperation : null,
      calcFieldAId: fieldType === "calculation" ? calcFieldAId : null,
      calcFieldBId: fieldType === "calculation" ? calcFieldBId : null,
    };

    if (editingField) {
      updateMutation.mutate({ id: editingField.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Custom Fields</CardTitle>
          <CardDescription>Collect extra info on bookings; up to {limit} fields</CardDescription>
        </div>
        <Button
          size="sm"
          onClick={openAdd}
          disabled={fields.length >= limit}
          data-testid="button-add-custom-field"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Field ({fields.length} / {limit})
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading custom fields...</div>
        ) : fields.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No custom fields yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add fields to collect extra information on bookings</p>
          </div>
        ) : (
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex flex-col shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => move(index, -1)}
                      disabled={index === 0 || reorderMutation.isPending}
                      aria-label="Move up"
                      data-testid={`button-move-up-${field.id}`}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => move(index, 1)}
                      disabled={index === fields.length - 1 || reorderMutation.isPending}
                      aria-label="Move down"
                      data-testid={`button-move-down-${field.id}`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{field.name}</span>
                      {field.isRequired && field.fieldType !== "calculation" && <Badge variant="secondary">Required</Badge>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {field.fieldType === "calculation" ? (
                        <Badge variant="outline">
                          calc: {fieldNameById(field.calcFieldAId)} {OPERATION_SYMBOLS[field.calcOperation ?? "add"]} {fieldNameById(field.calcFieldBId)}
                        </Badge>
                      ) : (
                        <Badge variant="outline">{TYPE_LABELS[field.fieldType] || field.fieldType}</Badge>
                      )}
                      {field.fieldType === "select" && field.options && field.options.length > 0 && (
                        <span className="truncate">{field.options.join(", ")}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(field)} aria-label="Edit" data-testid={`button-edit-custom-field-${field.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(field)} aria-label="Delete" data-testid={`button-delete-custom-field-${field.id}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingField ? "Edit Custom Field" : "Add Custom Field"}</DialogTitle>
            <DialogDescription>Define a field to collect on bookings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cf-name">Name</Label>
              <Input
                id="cf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={255}
                placeholder="e.g., Villa, Booking Price"
                data-testid="input-custom-field-name"
              />
            </div>
            <div>
              <Label htmlFor="cf-type">Type</Label>
              <Select value={fieldType} onValueChange={setFieldType}>
                <SelectTrigger id="cf-type" data-testid="select-custom-field-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="boolean">Yes/No</SelectItem>
                  <SelectItem value="select">Select</SelectItem>
                  <SelectItem value="calculation" disabled={numericFields.length < 2}>Calculation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {fieldType !== "calculation" && (
              <div className="flex items-center gap-3">
                <Switch
                  id="cf-required"
                  checked={isRequired}
                  onCheckedChange={(checked) => setIsRequired(checked === true)}
                  data-testid="switch-custom-field-required"
                />
                <Label htmlFor="cf-required">Required</Label>
              </div>
            )}

            {fieldType === "calculation" ? (
              <div className="space-y-3">
                <div>
                  <Label>Operation</Label>
                  <Select value={calcOperation} onValueChange={setCalcOperation}>
                    <SelectTrigger data-testid="select-calc-operation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add">Add (+)</SelectItem>
                      <SelectItem value="subtract">Subtract (−)</SelectItem>
                      <SelectItem value="multiply">Multiply (×)</SelectItem>
                      <SelectItem value="divide">Divide (÷)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Field A</Label>
                  <Select
                    value={calcFieldAId != null ? String(calcFieldAId) : ""}
                    onValueChange={(v) => setCalcFieldAId(parseInt(v))}
                  >
                    <SelectTrigger data-testid="select-calc-field-a">
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                      {numericFields.map((f) => (
                        <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Field B</Label>
                  <Select
                    value={calcFieldBId != null ? String(calcFieldBId) : ""}
                    onValueChange={(v) => setCalcFieldBId(parseInt(v))}
                  >
                    <SelectTrigger data-testid="select-calc-field-b">
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                      {numericFields.map((f) => (
                        <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  {name.trim() || "Field"} = {fieldNameById(calcFieldAId)} {OPERATION_SYMBOLS[calcOperation]} {fieldNameById(calcFieldBId)}
                </p>
              </div>
            ) : fieldType === "select" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Options (up to {MAX_OPTIONS})</Label>
                  <Button size="sm" variant="outline" onClick={addOption} disabled={options.length >= MAX_OPTIONS} data-testid="button-add-option">
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={opt}
                      onChange={(e) => updateOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                      data-testid={`input-option-${i}`}
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeOption(i)} aria-label="Remove option" data-testid={`button-remove-option-${i}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <Label htmlFor="cf-default">Default value (optional)</Label>
                <Input
                  id="cf-default"
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                  placeholder="Default value"
                  data-testid="input-custom-field-default"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-custom-field"
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
