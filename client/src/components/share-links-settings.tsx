import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, RefreshCw, Copy } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { ShareLinkConfig } from "@shared/schema";

type FieldPerm = "hidden" | "read" | "write";
type Visibility = "all" | "statuses" | "confirmed_upcoming";

interface ShareLink {
  id: number;
  userId: number;
  slot: number;
  description: string | null;
  config: ShareLinkConfig;
  configVersion: number;
  isEnabled: boolean;
  expiresAt: string | null;
  lastAccessedAt: string | null;
  tokenCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tokenPreview: string;
}

interface CustomFieldDef {
  id: number;
  name: string;
  displayOrder: number | null;
}

const MAX_LINKS = 2;

const STATUSES = ["pending", "confirmed", "cancelled", "completed", "no_show"] as const;
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
};

type Status = (typeof STATUSES)[number];

type FieldGroup = "Scheduling" | "Customer" | "Details" | "Legacy";

const STANDARD_FIELDS: Array<{ key: string; label: string; group: FieldGroup; writable: boolean }> = [
  { key: "slotDate", label: "Date", group: "Scheduling", writable: true },
  { key: "endDate", label: "End date", group: "Scheduling", writable: true },
  { key: "startTime", label: "Start time", group: "Scheduling", writable: true },
  { key: "endTime", label: "End time", group: "Scheduling", writable: true },
  { key: "endDayTime", label: "Last day time", group: "Scheduling", writable: true },
  { key: "bookingLabel", label: "Booking label", group: "Customer", writable: true },
  { key: "customerName", label: "Customer name", group: "Customer", writable: true },
  { key: "customerPhone", label: "Customer phone", group: "Customer", writable: true },
  { key: "status", label: "Status", group: "Details", writable: false },
  { key: "service", label: "Service", group: "Details", writable: false },
  { key: "provider", label: "Provider", group: "Details", writable: false },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return format(new Date(iso), "MMM d, yyyy");
}

export function ShareLinksSettings() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ links: ShareLink[]; count: number; max: number }>({
    queryKey: ["/api/booking/share-links"],
  });
  const links = data?.links ?? [];
  const count = data?.count ?? 0;

  const { data: customFields = [] } = useQuery<CustomFieldDef[]>({
    queryKey: ["/api/booking/custom-fields"],
  });

  // Dialog / form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<ShareLink | null>(null);
  const [password, setPassword] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("all");
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, FieldPerm>>({});
  const [actions, setActions] = useState({ edit: false, cancel: false, confirm: false, exportCsv: false });
  const [expiresAt, setExpiresAt] = useState("");

  // Reveal + destructive-action state
  const [revealUrl, setRevealUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ShareLink | null>(null);
  const [regenerateTarget, setRegenerateTarget] = useState<ShareLink | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/booking/share-links"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/booking/share-links", data);
      return res.json() as Promise<{ link: ShareLink; token: string }>;
    },
    onSuccess: (res) => {
      invalidate();
      setDialogOpen(false);
      resetForm();
      setRevealUrl(`${window.location.origin}/share/${res.token}`);
      toast({ title: "Share link created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to create link", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, any> }) => {
      await apiRequest("PATCH", `/api/booking/share-links/${id}`, data);
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      resetForm();
      toast({ title: "Share link updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to update link", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/booking/share-links/${id}/toggle`);
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to toggle link", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/booking/share-links/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Share link deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to delete link", variant: "destructive" }),
  });

  const regenerateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/booking/share-links/${id}/regenerate`);
      return res.json() as Promise<{ link: ShareLink; token: string }>;
    },
    onSuccess: (res) => {
      invalidate();
      setRegenerateTarget(null);
      setRevealUrl(`${window.location.origin}/share/${res.token}`);
      toast({ title: "Share link regenerated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to regenerate link", variant: "destructive" }),
  });

  // Custom-field permission rows, ordered by displayOrder (fallback id).
  const customFieldRows = [...customFields]
    .sort((a, b) => (a.displayOrder ?? a.id) - (b.displayOrder ?? b.id))
    .map((cf) => ({ key: `custom:${cf.id}`, label: cf.name, writable: true }));

  const groups: Array<{ name: string; fields: Array<{ key: string; label: string; writable: boolean }> }> = [
    { name: "Scheduling", fields: STANDARD_FIELDS.filter((f) => f.group === "Scheduling") },
    { name: "Customer", fields: STANDARD_FIELDS.filter((f) => f.group === "Customer") },
    { name: "Details (read-only)", fields: STANDARD_FIELDS.filter((f) => f.group === "Details") },
    { name: "Legacy custom fields", fields: STANDARD_FIELDS.filter((f) => f.group === "Legacy") },
    { name: "Custom fields", fields: customFieldRows },
  ];

  function emptyFieldPermissions(): Record<string, FieldPerm> {
    const perms: Record<string, FieldPerm> = {};
    for (const f of STANDARD_FIELDS) perms[f.key] = "hidden";
    for (const cf of customFields) perms[`custom:${cf.id}`] = "hidden";
    return perms;
  }

  function resetForm() {
    setEditingLink(null);
    setPassword("");
    setDescription("");
    setVisibility("all");
    setStatuses([]);
    setDateFrom("");
    setDateTo("");
    setFieldPermissions({});
    setActions({ edit: false, cancel: false, confirm: false, exportCsv: false });
    setExpiresAt("");
  }

  function openAdd() {
    resetForm();
    setFieldPermissions(emptyFieldPermissions());
    setDialogOpen(true);
  }

  function openEdit(link: ShareLink) {
    resetForm();
    setEditingLink(link);
    setDescription(link.description || "");
    setVisibility(link.config.visibility || "all");
    setStatuses(link.config.statuses || []);
    setDateFrom(link.config.dateRange?.from || "");
    setDateTo(link.config.dateRange?.to || "");
    setFieldPermissions({ ...emptyFieldPermissions(), ...(link.config.fieldPermissions || {}) });
    setActions({
      edit: link.config.allowedActions?.edit ?? false,
      cancel: link.config.allowedActions?.cancel ?? false,
      confirm: link.config.allowedActions?.confirm ?? false,
      exportCsv: link.config.allowedActions?.exportCsv ?? false,
    });
    setExpiresAt(link.expiresAt ? format(new Date(link.expiresAt), "yyyy-MM-dd") : "");
    setDialogOpen(true);
  }

  function toggleStatus(s: Status, checked: boolean) {
    setStatuses((prev) => (checked ? [...prev, s] : prev.filter((x) => x !== s)));
  }

  function setAllRead() {
    setFieldPermissions((prev) => {
      const next: Record<string, FieldPerm> = {};
      for (const k of Object.keys(prev)) next[k] = "read";
      return next;
    });
  }

  function setPerm(key: string, value: FieldPerm) {
    setFieldPermissions((prev) => ({ ...prev, [key]: value }));
  }

  async function copyUrl() {
    if (!revealUrl) return;
    try {
      await navigator.clipboard.writeText(revealUrl);
      toast({ title: "Copied", description: "Link copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", description: "Select the link manually", variant: "destructive" });
    }
  }

  function handleSave() {
    if (!editingLink && !password.trim()) {
      toast({ title: "Error", description: "Password is required", variant: "destructive" });
      return;
    }
    if (visibility === "statuses" && statuses.length === 0) {
      toast({ title: "Error", description: "Select at least one status", variant: "destructive" });
      return;
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      toast({ title: "Error", description: "Date range start must be before end", variant: "destructive" });
      return;
    }

    const config: ShareLinkConfig = {
      visibility,
      statuses: visibility === "statuses" ? statuses : [],
      dateRange: dateFrom || dateTo ? { from: dateFrom || null, to: dateTo || null } : null,
      fieldPermissions,
      allowedActions: actions,
    };

    const payload: Record<string, any> = {
      description: description.trim() || null,
      config,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    };
    if (!editingLink) {
      payload.password = password;
    } else if (password) {
      payload.password = password;
    }

    if (editingLink) {
      updateMutation.mutate({ id: editingLink.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Share Links</CardTitle>
          <CardDescription>Create password-protected links to share bookings with external partners</CardDescription>
        </div>
        <Button
          size="sm"
          onClick={openAdd}
          disabled={count >= MAX_LINKS}
          data-testid="button-add-share-link"
        >
          <Plus className="h-4 w-4 mr-1" />
          Create Link ({count} / {MAX_LINKS})
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading share links...</div>
        ) : links.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No share links yet — create a link to share bookings with an external partner.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {links.map((link) => (
              <div key={link.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{link.description || `Share link #${link.id}`}</span>
                    <Badge variant={link.isEnabled ? "default" : "secondary"}>{link.isEnabled ? "Enabled" : "Disabled"}</Badge>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{link.tokenPreview}</span>
                    <span>Created {fmtDate(link.createdAt)}</span>
                    <span>Accessed {fmtDate(link.lastAccessedAt)}</span>
                    <span>Expires {fmtDate(link.expiresAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch
                    checked={link.isEnabled}
                    onCheckedChange={() => toggleMutation.mutate(link.id)}
                    aria-label={link.isEnabled ? "Disable link" : "Enable link"}
                    data-testid={`switch-share-link-${link.id}`}
                  />
                  <Button variant="ghost" size="icon" onClick={() => setRegenerateTarget(link)} aria-label="Regenerate link" data-testid={`button-regenerate-share-link-${link.id}`}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(link)} aria-label="Edit link" data-testid={`button-edit-share-link-${link.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(link)} aria-label="Delete link" data-testid={`button-delete-share-link-${link.id}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLink ? "Edit Share Link" : "Create Share Link"}</DialogTitle>
            <DialogDescription>
              {editingLink
                ? "Update who can see which bookings, and what they can do."
                : "Choose a password and which bookings + fields to share."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-1">
              <Label htmlFor="sl-description">Description</Label>
              <Input
                id="sl-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={255}
                placeholder="e.g., Receptionist (Adliya branch)"
                data-testid="input-share-description"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="sl-password">Password{editingLink ? " (leave blank to keep current)" : ""}</Label>
              <Input
                id="sl-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={128}
                placeholder="Required to open the link"
                data-testid="input-share-password"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="sl-visibility">Which bookings</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
                <SelectTrigger id="sl-visibility" data-testid="select-share-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All bookings</SelectItem>
                  <SelectItem value="statuses">By status</SelectItem>
                  <SelectItem value="confirmed_upcoming">Confirmed + upcoming only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {visibility === "statuses" && (
              <div className="space-y-2">
                <Label>Statuses</Label>
                <div className="flex flex-wrap gap-3">
                  {STATUSES.map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <Checkbox id={`sl-status-${s}`} checked={statuses.includes(s)} onCheckedChange={(c) => toggleStatus(s, c === true)} data-testid={`checkbox-share-status-${s}`} />
                      <Label htmlFor={`sl-status-${s}`}>{STATUS_LABELS[s]}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sl-from">Date from (optional)</Label>
                <Input id="sl-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="input-share-date-from" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sl-to">Date to (optional)</Label>
                <Input id="sl-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="input-share-date-to" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Field permissions</Label>
                <Button type="button" variant="outline" size="sm" onClick={setAllRead} data-testid="button-set-all-read">
                  Set all visible to Read
                </Button>
              </div>
              <div className="space-y-3 rounded-md border p-3">
                {groups.map((group) =>
                  group.fields.length === 0 ? null : (
                    <div key={group.name} className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">{group.name}</p>
                      {group.fields.map((f) => (
                        <div key={f.key} className="flex items-center justify-between gap-2">
                          <span className="text-sm">{f.label}</span>
                          <Select value={fieldPermissions[f.key] ?? "hidden"} onValueChange={(v) => setPerm(f.key, v as FieldPerm)}>
                            <SelectTrigger className="w-28" data-testid={`select-share-perm-${f.key}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="hidden">Hidden</SelectItem>
                              <SelectItem value="read">Read</SelectItem>
                              {f.writable && <SelectItem value="write">Write</SelectItem>}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Allowed actions</Label>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox id="sl-act-edit" checked={actions.edit} onCheckedChange={(c) => setActions((a) => ({ ...a, edit: c === true }))} data-testid="checkbox-share-action-edit" />
                  <Label htmlFor="sl-act-edit">Edit</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="sl-act-cancel" checked={actions.cancel} onCheckedChange={(c) => setActions((a) => ({ ...a, cancel: c === true }))} data-testid="checkbox-share-action-cancel" />
                  <Label htmlFor="sl-act-cancel">Cancel</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="sl-act-confirm" checked={actions.confirm} onCheckedChange={(c) => setActions((a) => ({ ...a, confirm: c === true }))} data-testid="checkbox-share-action-confirm" />
                  <Label htmlFor="sl-act-confirm">Confirm</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="sl-act-export" checked={actions.exportCsv} onCheckedChange={(c) => setActions((a) => ({ ...a, exportCsv: c === true }))} data-testid="checkbox-share-action-export" />
                  <Label htmlFor="sl-act-export">Export CSV</Label>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="sl-expires">Expires (optional)</Label>
              <Input id="sl-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} data-testid="input-share-expires" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-share-link">
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Token reveal dialog */}
      <Dialog open={!!revealUrl} onOpenChange={(open) => { if (!open) setRevealUrl(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share link ready</DialogTitle>
            <DialogDescription>Share this URL with your partner. It's protected by the password you set.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-md text-sm text-amber-600 dark:text-amber-400">
              Save this link now. For security it can't be shown again — if you lose it, you'll need to regenerate a new link.
            </div>
            <div className="flex items-center gap-2">
              <Input readOnly value={revealUrl ?? ""} data-testid="input-share-url" />
              <Button onClick={copyUrl} data-testid="button-copy-share-url">
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevealUrl(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete share link?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteTarget?.description || (deleteTarget ? `Share link #${deleteTarget.id}` : "")}. The public URL will stop working. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-share-link"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate confirmation */}
      <AlertDialog open={!!regenerateTarget} onOpenChange={(open) => { if (!open) setRegenerateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate share link?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new URL for {regenerateTarget?.description || (regenerateTarget ? `Share link #${regenerateTarget.id}` : "")}. The current URL will stop working immediately — anyone using it will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (regenerateTarget) regenerateMutation.mutate(regenerateTarget.id); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-regenerate-share-link"
            >
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
