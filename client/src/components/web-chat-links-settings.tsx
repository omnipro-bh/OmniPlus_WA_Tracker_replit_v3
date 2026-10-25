import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, RefreshCw, Copy, Trash2, ExternalLink, AlertTriangle, MessageSquare } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Phase 4A-4 — owner-facing UI for web chat links.
//
// Mirrors `share-links-settings.tsx` (same card / row / reveal-dialog pattern),
// but web chat links differ in three ways that shape this component:
//   1. one link per workflow (the DB has a unique index on workflow_id), so
//      there is no "count / max" and no link list — a workflow picker instead;
//   2. a link is created DISABLED (`web_chat_links.is_enabled` defaults false),
//      hence the [Enable now] action on the create reveal dialog;
//   3. the plaintext token is stored only as a SHA-256 hash, so the URL can be
//      shown exactly once (create/rotate) and can never be re-read afterwards.
//
// The booking switch is workflow-scoped (`workflows.web_chat_booking_enabled`),
// not a link field, which is why it sits in its own section and is hidden while
// no link exists (an allowBooking-only PATCH 404s without a link row).
// ---------------------------------------------------------------------------

interface WorkflowSummary {
  id: number;
  name: string;
  isActive: boolean;
  webChatBookingEnabled: boolean;
  definitionJson: {
    nodes?: Array<{ id: string; type?: string; data?: { label?: string } }>;
  };
}

// GET merges `sessionCount` / `lastMessageAt` into the serialized link; POST,
// PATCH and rotate return the link without them (hence optional).
interface WebChatLinkRow {
  id: number;
  label: string | null;
  isEnabled: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sessionCount?: number;
  lastMessageAt?: string | null;
}

interface WebChatLinkResponse {
  link: WebChatLinkRow | null;
  allowBooking: boolean;
}

interface WebChatReveal {
  url: string;
  token: string;
  mode: "create" | "rotate";
}

function fmtDate(iso: string | null | undefined, fallback = "Never"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return format(d, "MMM d, yyyy");
}

export function WebChatLinksSettings() {
  const { toast } = useToast();

  const { data: workflows = [], isLoading: workflowsLoading } = useQuery<WorkflowSummary[]>({
    queryKey: ["/api/workflows"],
  });

  // Workflow picker (auto-selects the first workflow; hidden when there is only one).
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);

  useEffect(() => {
    if (workflows.length === 0) {
      if (selectedWorkflowId !== null) setSelectedWorkflowId(null);
      return;
    }
    if (selectedWorkflowId == null || !workflows.some((w) => w.id === selectedWorkflowId)) {
      setSelectedWorkflowId(workflows[0].id);
    }
  }, [workflows, selectedWorkflowId]);

  // `getQueryFn` joins the key with "/" (see queryClient.ts), so this resolves
  // to `/api/workflows/:id/web-chat`.
  const linkKey = useMemo(
    () => ["/api/workflows", String(selectedWorkflowId ?? ""), "web-chat"],
    [selectedWorkflowId],
  );

  const { data, isLoading: linkLoading } = useQuery<WebChatLinkResponse>({
    queryKey: linkKey,
    enabled: selectedWorkflowId != null,
  });

  const workflow = workflows.find((w) => w.id === selectedWorkflowId) ?? null;
  const link = data?.link ?? null;
  const allowBooking = data?.allowBooking ?? false;
  const isExpired = !!link?.expiresAt && new Date(link.expiresAt).getTime() <= Date.now();
  const hasBookingNode =
    workflow?.definitionJson?.nodes?.some((n) => n.type === "booking.book_appointment") ?? false;
  const isLoading = workflowsLoading || (selectedWorkflowId != null && linkLoading);

  // Form / dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [reveal, setReveal] = useState<WebChatReveal | null>(null);
  const [rotateTarget, setRotateTarget] = useState<WebChatLinkRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebChatLinkRow | null>(null);

  const invalidateLink = () => {
    if (selectedWorkflowId == null) return;
    queryClient.invalidateQueries({
      queryKey: ["/api/workflows", String(selectedWorkflowId), "web-chat"],
      exact: true,
    });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: { label: string | null; expiresAt: string | null }) => {
      const res = await apiRequest("POST", `/api/workflows/${selectedWorkflowId}/web-chat`, payload);
      return (await res.json()) as { url: string; token: string };
    },
    onSuccess: (res) => {
      invalidateLink();
      setCreateOpen(false);
      setLabel("");
      setExpiresAt("");
      setReveal({ url: res.url, token: res.token, mode: "create" });
      toast({ title: "Web chat link created", description: "It stays disabled until you enable it." });
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message || "Failed to create link", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (isEnabled: boolean) => {
      await apiRequest("PATCH", `/api/workflows/${selectedWorkflowId}/web-chat`, { isEnabled });
    },
    onSuccess: () => invalidateLink(),
    onError: (e: any) =>
      toast({ title: "Error", description: e.message || "Failed to toggle link", variant: "destructive" }),
  });

  const allowBookingMutation = useMutation({
    mutationFn: async (next: boolean) => {
      await apiRequest("PATCH", `/api/workflows/${selectedWorkflowId}/web-chat`, { allowBooking: next });
    },
    onSuccess: (_res, next) => {
      invalidateLink();
      // The flag lives on the workflow row, so refresh the workflow list too.
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"], exact: true });
      toast({ title: next ? "Booking enabled in web chat" : "Booking disabled in web chat" });
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message || "Failed to update booking", variant: "destructive" }),
  });

  const rotateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/workflows/${selectedWorkflowId}/web-chat/rotate`);
      return (await res.json()) as { url: string; token: string };
    },
    onSuccess: (res) => {
      invalidateLink();
      setRotateTarget(null);
      setReveal({ url: res.url, token: res.token, mode: "rotate" });
      toast({ title: "Web chat link rotated" });
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message || "Failed to rotate link", variant: "destructive" }),
  });

  const enableNowMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/workflows/${selectedWorkflowId}/web-chat`, { isEnabled: true });
    },
    onSuccess: () => {
      invalidateLink();
      toast({ title: "Web chat link enabled", description: "Visitors can open the link now." });
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message || "Failed to enable link", variant: "destructive" }),
  });

  // A link that expired can never resolve again (rotate does not clear expiry),
  // so offer the only in-API way back without deleting the link + its sessions.
  const clearExpiryMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/workflows/${selectedWorkflowId}/web-chat`, { expiresAt: null });
    },
    onSuccess: () => {
      invalidateLink();
      toast({ title: "Expiry removed" });
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message || "Failed to clear expiry", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/workflows/${selectedWorkflowId}/web-chat`);
    },
    onSuccess: () => {
      invalidateLink();
      setDeleteTarget(null);
      toast({ title: "Web chat link deleted" });
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message || "Failed to delete link", variant: "destructive" }),
  });

  function openCreate() {
    setLabel("");
    setExpiresAt("");
    setCreateOpen(true);
  }

  function handleCreate() {
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      toast({ title: "Error", description: "Expiry must be in the future", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      label: label.trim() || null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
  }

  async function copyUrl() {
    if (!reveal) return;
    try {
      await navigator.clipboard.writeText(reveal.url);
      toast({ title: "Copied", description: "Link copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", description: "Select the link manually", variant: "destructive" });
    }
  }

  function openUrl() {
    if (!reveal) return;
    window.open(reveal.url, "_blank", "noopener,noreferrer");
  }

  const sessions = deleteTarget?.sessionCount ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Web Chat Links</CardTitle>
          <CardDescription>Let customers chat with a workflow directly from your website</CardDescription>
        </div>
        {!isLoading && !link && selectedWorkflowId != null && (
          <Button size="sm" onClick={openCreate} data-testid="button-add-web-chat-link">
            <Plus className="h-4 w-4 mr-1" />
            Create Link
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {workflows.length > 1 && (
          <div className="mb-4 max-w-sm space-y-1">
            <Label htmlFor="wc-workflow" className="text-xs text-muted-foreground">Workflow</Label>
            <Select
              value={selectedWorkflowId != null ? String(selectedWorkflowId) : ""}
              onValueChange={(v) => setSelectedWorkflowId(Number(v))}
            >
              <SelectTrigger id="wc-workflow" data-testid="select-web-chat-workflow">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading web chat link...</div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">
              No workflows yet — create a workflow before you can add a web chat link.
            </p>
          </div>
        ) : !link ? (
          <div className="text-center py-8">
            <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground mb-4">
              No web chat link for {workflow?.name ?? "this workflow"} yet — create one to let customers chat from your website. Each workflow can have one link.
            </p>
            <Button size="sm" onClick={openCreate} data-testid="button-create-first-web-chat-link">
              <Plus className="h-4 w-4 mr-1" />
              Create Web Chat Link
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2 p-3 rounded-lg border">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{link.label || `Web chat link #${link.id}`}</span>
                  <Badge variant={link.isEnabled ? "default" : "secondary"}>
                    {link.isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  {isExpired && (
                    <Badge variant="outline" className="border-destructive text-destructive">Expired</Badge>
                  )}
                  {workflow && !workflow.isActive && (
                    <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
                      Workflow inactive
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground mt-0.5">
                  <span>Created {fmtDate(link.createdAt)}</span>
                  <span>Last used {fmtDate(link.lastUsedAt)}</span>
                  <span>{link.sessionCount ?? 0} session{(link.sessionCount ?? 0) === 1 ? "" : "s"}</span>
                  <span>Last message {fmtDate(link.lastMessageAt, "None yet")}</span>
                  <span>Expires {fmtDate(link.expiresAt)}</span>
                </div>
                {isExpired && (
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    <p className="text-xs text-destructive">
                      This link has expired — visitors get "Chat unavailable".
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => clearExpiryMutation.mutate()}
                      disabled={clearExpiryMutation.isPending}
                      data-testid="button-clear-web-chat-expiry"
                    >
                      Clear expiry
                    </Button>
                  </div>
                )}
                {workflow && !workflow.isActive && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                    This workflow is inactive — visitors currently get "Chat temporarily unavailable" until you activate it.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Switch
                  checked={link.isEnabled}
                  disabled={toggleMutation.isPending}
                  onCheckedChange={(checked) => toggleMutation.mutate(checked)}
                  aria-label={link.isEnabled ? "Disable link" : "Enable link"}
                  data-testid="switch-web-chat-link"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRotateTarget(link)}
                  aria-label="Rotate link"
                  data-testid="button-rotate-web-chat-link"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTarget(link)}
                  aria-label="Delete link"
                  data-testid="button-delete-web-chat-link"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Label htmlFor="wc-booking" className="text-sm">Booking in web chat</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Applies to workflow "{workflow?.name ?? ""}" for every visitor on this link. It is a workflow
                    setting and survives deleting the link.
                  </p>
                </div>
                <Switch
                  id="wc-booking"
                  checked={allowBooking}
                  disabled={allowBookingMutation.isPending}
                  onCheckedChange={(checked) => allowBookingMutation.mutate(checked)}
                  aria-label={allowBooking ? "Disable booking in web chat" : "Enable booking in web chat"}
                  data-testid="switch-web-chat-booking"
                />
              </div>
              {allowBooking && !hasBookingNode && (
                <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 p-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    This workflow has no booking node, so this switch currently has no effect. Add a
                    "Book appointment" node to the flow to use it.
                  </span>
                </div>
              )}
              {allowBooking && hasBookingNode && (
                <p className="text-xs text-muted-foreground">
                  Booking nodes must be reached from a button reply (not a text message), otherwise the
                  visitor is stopped with no explanation.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setLabel(""); setExpiresAt(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Web Chat Link</DialogTitle>
            <DialogDescription>
              One link per workflow. It starts disabled — you'll turn it on after copying the URL.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="wc-label">Label (optional)</Label>
              <Input
                id="wc-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={255}
                placeholder="e.g., Website chat"
                data-testid="input-web-chat-label"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wc-expires">Expires (optional)</Label>
              <Input
                id="wc-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                data-testid="input-web-chat-expires"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-save-web-chat-link">
              {createMutation.isPending ? "Creating..." : "Create link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Token reveal dialog — the plaintext URL exists only at this moment */}
      <Dialog open={!!reveal} onOpenChange={(open) => { if (!open) setReveal(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{reveal?.mode === "create" ? "Web chat link created" : "Web chat link rotated"}</DialogTitle>
            <DialogDescription>
              Share this URL with your customers. It opens the chat for "{workflow?.name ?? "this workflow"}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-md text-sm text-amber-600 dark:text-amber-400">
              Save this link now. For security it can't be shown again — if you lose it you'll have to rotate
              it, which creates a new URL.
            </div>
            <div className="flex items-center gap-2">
              <Input readOnly value={reveal?.url ?? ""} data-testid="input-web-chat-url" />
              <Button onClick={copyUrl} data-testid="button-copy-web-chat-url">
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
              <Button variant="outline" onClick={openUrl} data-testid="button-open-web-chat-url">
                <ExternalLink className="h-4 w-4 mr-1" /> Open
              </Button>
            </div>
            {reveal?.mode === "create" && (
              <p className="text-xs text-muted-foreground">
                This link is disabled. Turn it on to let visitors in.
              </p>
            )}
            {reveal?.mode === "rotate" && (
              <p className="text-xs text-muted-foreground">
                The old URL no longer starts new chats. Conversations already open keep working until they end.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReveal(null)}>Done</Button>
            {reveal?.mode === "create" && (
              <Button
                onClick={() => enableNowMutation.mutate()}
                disabled={enableNowMutation.isPending}
                data-testid="button-enable-web-chat-now"
              >
                {enableNowMutation.isPending ? "Enabling..." : "Enable now"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete web chat link?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {deleteTarget?.label || (deleteTarget ? `Web chat link #${deleteTarget.id}` : "")}.
              The public URL will stop working
              {sessions > 0
                ? ` and ${sessions} visitor session${sessions === 1 ? "" : "s"} with their transcripts will be deleted`
                : " and all its visitor sessions with their transcripts will be deleted"}.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-web-chat-link"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rotate confirmation */}
      <AlertDialog open={!!rotateTarget} onOpenChange={(open) => { if (!open) setRotateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate web chat link?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a new URL for {rotateTarget?.label || (rotateTarget ? `Web chat link #${rotateTarget.id}` : "")}.
              Anyone with the old URL will no longer be able to start a chat. Conversations already in progress
              keep working until they end.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rotateMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-rotate-web-chat-link"
            >
              Rotate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
