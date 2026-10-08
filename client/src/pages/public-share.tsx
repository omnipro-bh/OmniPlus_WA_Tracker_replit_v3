import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  authenticate,
  cancelBooking,
  confirmBooking,
  downloadCsv,
  fetchBookings,
  logout,
  retryAfterMessage,
  type ShareBooking,
  type ShareListResponse,
} from "@/lib/share-api";
import {
  STANDARD_FIELD_LABELS,
  STATUS_LABELS,
  statusBadgeVariant,
  visibleCustomFieldIds,
  visibleFieldKeys,
  hasWritableField,
  customFieldLabel,
} from "@/lib/share-fields";
import { ShareEditDialog } from "@/components/share-edit-dialog";
import { formatLongDate } from "@/lib/booking-date";

const PAGE_SIZE = 50;

function renderStandardCell(key: string, b: ShareBooking): ReactNode {
  switch (key) {
    case "slotDate":
      return <span className="font-medium">{formatLongDate(b.slotDate ?? "")}</span>;
    case "endDate":
      return <span>{b.endDate ? formatLongDate(b.endDate) : "—"}</span>;
    case "startTime":
      return <span>{b.startTime ?? "—"}</span>;
    case "endTime":
      return <span>{b.endTime ?? "—"}</span>;
    case "endDayTime":
      return (
        <span>
          {b.endDayStartTime && b.endDayEndTime ? `${b.endDayStartTime}–${b.endDayEndTime}` : "—"}
        </span>
      );
    case "status":
      return (
        <Badge variant={statusBadgeVariant(b.status ?? "")}>
          {STATUS_LABELS[b.status ?? ""] ?? b.status ?? "—"}
        </Badge>
      );
    case "bookingLabel":
      return <span>{b.bookingLabel || "—"}</span>;
    case "customerName":
      return <span>{b.customerName || "—"}</span>;
    case "customerPhone":
      return <span>{b.customerPhone || "—"}</span>;
    case "service":
      return <span>{b.service || "—"}</span>;
    case "provider":
      return <span>{b.provider || "—"}</span>;
    case "customField1": {
      const label = b.customField1Label;
      const value = b.customField1Value;
      return <span>{label ? `${label}: ${value ?? ""}` : (value ?? "—")}</span>;
    }
    case "customField2": {
      const label = b.customField2Label;
      const value = b.customField2Value;
      return <span>{label ? `${label}: ${value ?? ""}` : (value ?? "—")}</span>;
    }
    default:
      return <span>—</span>;
  }
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      {children}
    </div>
  );
}

function LoadingShell() {
  return (
    <Shell>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading…</span>
      </div>
    </Shell>
  );
}

function UnavailableShell() {
  return (
    <Shell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <CardTitle>Link unavailable</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>This link is no longer available.</p>
          <p>If you believe this is an error, please contact the person who shared this link.</p>
        </CardContent>
      </Card>
    </Shell>
  );
}

function ErrorShell({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Shell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <CardTitle>Something went wrong</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {message || "Something went wrong. Try again."}
          </p>
          <Button onClick={onRetry} data-testid="button-share-retry">
            Try again
          </Button>
        </CardContent>
      </Card>
    </Shell>
  );
}

function GateShell({
  password,
  onPasswordChange,
  authError,
  locked,
  pending,
  onSubmit,
}: {
  password: string;
  onPasswordChange: (v: string) => void;
  authError: string | null;
  locked: boolean;
  pending: boolean;
  onSubmit: () => void;
}) {
  return (
    <Shell>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-center">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-center text-xl">Password required</CardTitle>
          <CardDescription className="text-center">
            Enter the password to view these bookings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="share-password">Password</Label>
              <Input
                id="share-password"
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="••••••••"
                autoFocus
                data-testid="input-share-password"
              />
            </div>
            {authError && (
              <div
                className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                data-testid="share-auth-error"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{authError}</span>
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={pending || locked || !password.trim()}
              data-testid="button-share-submit"
            >
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}

export default function PublicSharePage() {
  const [, params] = useRoute("/share/:token");
  const token = params?.token ?? "";
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [unavailable, setUnavailable] = useState(false);

  // Password gate state
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  // Row action state
  const [editingBooking, setEditingBooking] = useState<ShareBooking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ShareBooking | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ShareBooking | null>(null);

  // Re-enable the password submit once the rate-limit lock expires.
  useEffect(() => {
    if (lockedUntil == null) return;
    const remaining = lockedUntil - Date.now();
    if (remaining <= 0) {
      setLockedUntil(null);
      return;
    }
    const t = setTimeout(() => setLockedUntil(null), remaining);
    return () => clearTimeout(t);
  }, [lockedUntil]);

  const bookingsQuery = useQuery<ShareListResponse>({
    queryKey: ["share", token, "bookings", page],
    queryFn: () => fetchBookings(token, page),
    enabled: !!token,
    retry: false,
  });

  const data = bookingsQuery.data;
  const config = data?.config;
  const bookings = data?.bookings ?? [];
  const count = data?.count ?? 0;
  const customFieldNames = data?.customFieldNames ?? {};

  function handleSessionExpired() {
    setEditingBooking(null);
    setCancelTarget(null);
    setConfirmTarget(null);
    queryClient.invalidateQueries({ queryKey: ["share", token, "bookings"] });
  }

  function handleUnavailable() {
    setEditingBooking(null);
    setCancelTarget(null);
    setConfirmTarget(null);
    setUnavailable(true);
  }

  function handleWriteError(e: any, fallback: string) {
    const status = e?.status;
    if (status === 401) {
      handleSessionExpired();
    } else if (status === 404) {
      handleUnavailable();
    } else if (status === 429) {
      toast({
        title: "Too many writes",
        description: retryAfterMessage(e?.retryAfter),
        variant: "destructive",
      });
    } else {
      toast({ title: "Error", description: e?.message || fallback, variant: "destructive" });
    }
  }

  const authMutation = useMutation({
    mutationFn: () => authenticate(token, password),
    onSuccess: () => {
      setAuthError(null);
      setPassword("");
      setLockedUntil(null);
      queryClient.invalidateQueries({ queryKey: ["share", token, "bookings"] });
    },
    onError: (e: any) => {
      const status = e?.status;
      if (status === 401) {
        setAuthError("Incorrect password");
      } else if (status === 404) {
        setUnavailable(true);
      } else if (status === 429) {
        setAuthError(retryAfterMessage(e?.retryAfter));
        setLockedUntil(Date.now() + (e?.retryAfter ?? 60) * 1000);
      } else {
        setAuthError(e?.message || "Something went wrong. Try again.");
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => cancelBooking(token, id),
    onSuccess: () => {
      setCancelTarget(null);
      toast({ title: "Booking cancelled" });
      queryClient.invalidateQueries({ queryKey: ["share", token, "bookings"] });
    },
    onError: (e: any) => handleWriteError(e, "Failed to cancel booking"),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => confirmBooking(token, id),
    onSuccess: () => {
      setConfirmTarget(null);
      toast({ title: "Booking confirmed" });
      queryClient.invalidateQueries({ queryKey: ["share", token, "bookings"] });
    },
    onError: (e: any) => handleWriteError(e, "Failed to confirm booking"),
  });

  const logoutMutation = useMutation({
    mutationFn: () => logout(token),
    onSuccess: () => {
      setPassword("");
      setAuthError(null);
      setLockedUntil(null);
      queryClient.invalidateQueries({ queryKey: ["share", token, "bookings"] });
    },
    onError: () => {
      toast({ title: "Sign out failed", description: "Please try again.", variant: "destructive" });
    },
  });

  async function handleCsv() {
    try {
      await downloadCsv(token);
    } catch (e: any) {
      const status = e?.status;
      if (status === 401) {
        handleSessionExpired();
      } else if (status === 404) {
        handleUnavailable();
      } else {
        toast({ title: "Export failed", description: e?.message || "Failed to export CSV", variant: "destructive" });
      }
    }
  }

  // ----- view resolution -----

  const errorStatus = (bookingsQuery.error as any)?.status;

  if (!token || unavailable || errorStatus === 404) {
    return <UnavailableShell />;
  }
  if (bookingsQuery.isPending) {
    return <LoadingShell />;
  }
  if (errorStatus === 401) {
    return (
      <GateShell
        password={password}
        onPasswordChange={setPassword}
        authError={authError}
        locked={!!lockedUntil}
        pending={authMutation.isPending}
        onSubmit={() => {
          if (!lockedUntil && password.trim()) authMutation.mutate();
        }}
      />
    );
  }
  if (bookingsQuery.error) {
    return (
      <ErrorShell
        message={(bookingsQuery.error as any)?.message || "Something went wrong. Try again."}
        onRetry={() => bookingsQuery.refetch()}
      />
    );
  }
  if (!data || !config) {
    return <LoadingShell />;
  }

  // ----- ready: booking list -----

  const standardCols = visibleFieldKeys(config);
  const customColIds = visibleCustomFieldIds(config, customFieldNames);
  const showEdit = !!config.allowedActions?.edit && hasWritableField(config);
  const showCancel = !!config.allowedActions?.cancel;
  const showConfirm = !!config.allowedActions?.confirm;
  const showActions = showEdit || showCancel || showConfirm;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Shared bookings</h1>
            <p className="text-sm text-muted-foreground">Bookings shared with you.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => bookingsQuery.refetch()}
              data-testid="button-share-refresh"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            {config.allowedActions?.exportCsv && (
              <Button variant="outline" size="sm" onClick={handleCsv} data-testid="button-share-export-csv">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              data-testid="button-share-sign-out"
            >
              {logoutMutation.isPending ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bookings ({count})</CardTitle>
          </CardHeader>
          <CardContent>
            {bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No bookings to show for this link.
              </p>
            ) : (
              <div className="overflow-x-auto md:overflow-visible">
                <Table className="[&_td]:px-3 [&_th]:px-3">
                  <TableHeader>
                    <TableRow>
                      {standardCols.map((k) => (
                        <TableHead key={k} className="whitespace-nowrap">
                          {STANDARD_FIELD_LABELS[k] ?? k}
                        </TableHead>
                      ))}
                      {customColIds.map((id) => (
                        <TableHead key={`custom:${id}`} className="whitespace-nowrap">
                          {customFieldLabel(id, customFieldNames)}
                        </TableHead>
                      ))}
                      {showActions && <TableHead className="whitespace-nowrap">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.map((b) => {
                      const values = new Map(
                        (b.customFieldValues ?? []).map((v) => [v.fieldId, v.value]),
                      );
                      return (
                        <TableRow key={b.id} data-testid={`share-booking-row-${b.id}`}>
                          {standardCols.map((k) => (
                            <TableCell key={k} className="whitespace-nowrap">
                              {renderStandardCell(k, b)}
                            </TableCell>
                          ))}
                          {customColIds.map((id) => (
                            <TableCell key={`custom:${id}`} className="whitespace-nowrap">
                              {values.get(id) ?? "—"}
                            </TableCell>
                          ))}
                          {showActions && (
                            <TableCell className="whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                {showEdit && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditingBooking(b)}
                                    aria-label="Edit booking"
                                    data-testid={`share-action-edit-${b.id}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                {showConfirm && b.status === "pending" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setConfirmTarget(b)}
                                    aria-label="Confirm booking"
                                    data-testid={`share-action-confirm-${b.id}`}
                                  >
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  </Button>
                                )}
                                {showCancel && b.status !== "cancelled" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setCancelTarget(b)}
                                    aria-label="Cancel booking"
                                    data-testid={`share-action-cancel-${b.id}`}
                                  >
                                    <XCircle className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {count > 0 && (
          <div className="flex items-center justify-between px-2">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages} ({count} bookings)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                data-testid="button-share-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                data-testid="button-share-next-page"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit dialog */}
      {editingBooking && (
        <ShareEditDialog
          open={!!editingBooking}
          onOpenChange={(o) => {
            if (!o) setEditingBooking(null);
          }}
          token={token}
          booking={editingBooking}
          config={config}
          customFieldNames={customFieldNames}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["share", token, "bookings"] })}
          onSessionExpired={handleSessionExpired}
          onUnavailable={handleUnavailable}
        />
      )}

      {/* Cancel booking confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel booking?</AlertDialogTitle>
            <AlertDialogDescription>This booking will be marked as cancelled.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (cancelTarget) cancelMutation.mutate(cancelTarget.id); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-share-confirm-cancel"
            >
              Cancel booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm booking confirmation */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => { if (!o) setConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm booking?</AlertDialogTitle>
            <AlertDialogDescription>This booking will be marked as confirmed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmTarget) confirmMutation.mutate(confirmTarget.id); }}
              data-testid="button-share-confirm-confirm"
            >
              Confirm booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
