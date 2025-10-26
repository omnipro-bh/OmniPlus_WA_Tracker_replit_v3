import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, QrCode, Trash2, Radio, Calendar, CheckCircle2, Copy, Check, RefreshCw, LogOut } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import type { Channel } from "@shared/schema";
import { Link } from "wouter";

export default function Channels() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newChannel, setNewChannel] = useState({ label: "", phone: "" });
  const [qrDialogChannel, setQrDialogChannel] = useState<Channel | null>(null);
  const [qrCodeData, setQrCodeData] = useState<{ httpStatus?: number; base64?: string; expire?: number; alreadyAuthenticated?: boolean; error?: boolean; message?: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);

  const { data: channels = [], isLoading } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
    enabled: !!user,
  });

  const addChannelMutation = useMutation({
    mutationFn: async (data: { label: string; phone: string }) => {
      return await apiRequest("POST", "/api/channels", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      setIsAddDialogOpen(false);
      setNewChannel({ label: "", phone: "" });
      toast({
        title: "Channel added",
        description: "Your new channel has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add channel",
        description: error.message || "Could not create channel",
        variant: "destructive",
      });
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/channels/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      toast({
        title: "Channel deleted",
        description: "Channel has been removed.",
      });
    },
  });

  const authorizeChannelMutation = useMutation({
    mutationFn: async (channelId: number) => {
      return await apiRequest("PATCH", `/api/channels/${channelId}/authorize`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      setQrDialogChannel(null);
      toast({
        title: "Success",
        description: "Channel connected successfully and now active.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to authorize channel",
        description: error.message || "Could not update channel status",
        variant: "destructive",
      });
    },
  });

  const logoutChannelMutation = useMutation({
    mutationFn: async (channelId: number) => {
      return await apiRequest("POST", `/api/channels/${channelId}/logout`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({
        title: "Channel logged out",
        description: "Channel has been disconnected from WhatsApp. You can scan QR code again to reconnect.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to logout channel",
        description: error.message || "Could not logout channel",
        variant: "destructive",
      });
    },
  });

  const fetchQrCodeMutation = useMutation({
    mutationFn: async (channelId: number): Promise<{ httpStatus?: number; base64?: string; expire?: number; alreadyAuthenticated?: boolean; error?: boolean; message?: string }> => {
      const response = await fetch(`/api/channels/${channelId}/qr`, {
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch QR code");
      }
      return await response.json();
    },
    onSuccess: (data, channelId) => {
      // 409 = Channel already authenticated
      if (data.httpStatus === 409 || data.alreadyAuthenticated) {
        authorizeChannelMutation.mutate(channelId);
        return;
      }
      
      // 406/422 = QR expired or error
      if (data.httpStatus === 406 || data.httpStatus === 422 || data.error) {
        toast({
          title: "QR Code Expired",
          description: data.message || "Please try again.",
          variant: "destructive",
        });
        setQrDialogChannel(null);
        return;
      }
      
      // 200 = QR code available, show it
      if (data.httpStatus === 200 && data.base64) {
        setQrCodeData(data);
        if (data.expire) {
          setCountdown(data.expire);
        }
        return;
      }
      
      // Unexpected response
      toast({
        title: "QR Error",
        description: "Unexpected response from WHAPI",
        variant: "destructive",
      });
      setQrDialogChannel(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to fetch QR code",
        description: error.message || "Could not retrieve QR code from WHAPI",
        variant: "destructive",
      });
      setQrDialogChannel(null);
    },
  });

  // Countdown timer for QR code expiration
  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  // QR status polling - poll for 409 (already authenticated)
  useEffect(() => {
    // Only start polling after initial QR data is loaded (httpStatus: 200 with base64)
    if (!qrDialogChannel || !qrCodeData || qrCodeData.httpStatus !== 200 || !qrCodeData.base64) return;

    // Store the deadline for QR expiration
    const expirationTime = Date.now() + (qrCodeData.expire || 60) * 1000;

    // Poll every 2 seconds to check if QR was scanned (looking for 409 response)
    const pollInterval = setInterval(async () => {
      // Stop polling if QR expired
      if (Date.now() >= expirationTime) {
        clearInterval(pollInterval);
        setCountdown(0);
        toast({
          title: "QR Code Expired",
          description: "Please click 'Refresh QR Code' to generate a new one.",
          variant: "destructive",
        });
        return;
      }

      try {
        const response = await fetch(`/api/channels/${qrDialogChannel.id}/qr`, {
          credentials: "include",
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // 409 = Channel already authenticated (success!)
          if (data.httpStatus === 409 || data.alreadyAuthenticated) {
            clearInterval(pollInterval);
            authorizeChannelMutation.mutate(qrDialogChannel.id);
            return;
          }
          
          // 406/422 = QR expired or error
          if (data.httpStatus === 406 || data.httpStatus === 422 || data.error) {
            clearInterval(pollInterval);
            setCountdown(0);
            toast({
              title: "QR Code Expired",
              description: data.message || "Please click 'Refresh QR Code' to try again.",
              variant: "destructive",
            });
            return;
          }
          
          // 200 = Still waiting, keep showing current QR (don't update unless explicit refresh)
          // Just continue polling
        }
      } catch (error) {
        console.error("QR status poll error:", error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [qrDialogChannel?.id, qrCodeData?.httpStatus, qrCodeData?.base64]);

  const handleShowQrCode = (channel: Channel) => {
    setQrDialogChannel(channel);
    setQrCodeData(null);
    fetchQrCodeMutation.mutate(channel.id);
  };

  const handleCopyToken = async (channelId: number, token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(channelId);
      toast({
        title: "Token copied",
        description: "Channel token copied to clipboard",
      });
      setTimeout(() => setCopiedToken(null), 2000);
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Could not copy token to clipboard",
        variant: "destructive",
      });
    }
  };

  const hasActivePlan = user?.currentSubscription?.status === "ACTIVE";
  const canAddChannel = hasActivePlan && (user?.channelsUsed || 0) < (user?.channelsLimit || 0);

  return (
    <div className="space-y-6">
      {/* Info Bar */}
      <Card>
        <CardContent className="py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Radio className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Channel Limit</span>
                </div>
                <div className="text-3xl font-bold" data-testid="text-channel-limit">
                  {user?.channelsUsed || 0} / {user?.channelsLimit || 0}
                </div>
              </div>
            </div>
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              disabled={!canAddChannel}
              data-testid="button-add-channel"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Channel
            </Button>
          </div>

          {!hasActivePlan && (
            <div className="mt-4 text-sm text-muted-foreground">
              You need an active plan to add channels.{" "}
              <Link href="/pricing">
                <a className="text-primary hover:underline">View plans</a>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Channels Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : channels.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Radio className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">No channels yet</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Add your first WhatsApp channel to start sending messages
            </p>
            {canAddChannel && (
              <Button className="mt-4" onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-channel">
                <Plus className="h-4 w-4 mr-2" />
                Add First Channel
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => (
            <Card key={channel.id} className="flex flex-col" data-testid={`channel-${channel.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{channel.label}</CardTitle>
                    <CardDescription className="font-mono text-sm mt-1">
                      {channel.phone}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <StatusBadge status={channel.status} />
                    {channel.authStatus === "AUTHORIZED" && (
                      <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/20">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Authorized
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                {/* Days Remaining - Prominently displayed for all channels */}
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
                  <span className="text-sm font-medium text-muted-foreground">Days Remaining</span>
                  <span 
                    className={`text-2xl font-bold ${
                      (channel.daysRemaining || 0) > 7 
                        ? "text-success" 
                        : (channel.daysRemaining || 0) > 0 
                          ? "text-warning" 
                          : "text-error"
                    }`}
                    data-testid={`text-channel-days-${channel.id}`}
                  >
                    {channel.daysRemaining || 0}
                  </span>
                </div>

                {/* Status message based on channel state */}
                {channel.status === "PENDING" && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Channel is pending activation by administrator
                    </p>
                    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                      Awaiting Admin Activation
                    </Badge>
                  </div>
                )}
                
                {channel.status === "ACTIVE" && channel.authStatus === "PENDING" && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Scan QR code to authenticate this channel with WhatsApp
                    </p>
                    {(() => {
                      const isExpired = channel.expiresAt && new Date(channel.expiresAt) < new Date();
                      const canShowQr = channel.status === "ACTIVE" && !isExpired;
                      const disabledReason = isExpired 
                        ? "Channel has expired. Please extend to use QR authorization."
                        : "Channel must be active to show QR code.";

                      return canShowQr ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full" 
                          onClick={() => handleShowQrCode(channel)}
                          disabled={fetchQrCodeMutation.isPending}
                          data-testid={`button-qr-${channel.id}`}
                        >
                          <QrCode className="h-4 w-4 mr-2" />
                          Show QR Code
                        </Button>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-block w-full">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="w-full" 
                                disabled
                                data-testid={`button-qr-${channel.id}`}
                              >
                                <QrCode className="h-4 w-4 mr-2" />
                                Show QR Code
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{disabledReason}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })()}
                  </div>
                )}
                
                {channel.status === "ACTIVE" && channel.authStatus === "AUTHORIZED" && (
                  <div className="space-y-2">
                    <p className="text-sm text-success flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Channel is connected and ready
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full" 
                      onClick={() => {
                        if (confirm("Are you sure you want to logout this channel from WhatsApp? You will need to scan the QR code again to reconnect.")) {
                          logoutChannelMutation.mutate(channel.id);
                        }
                      }}
                      disabled={logoutChannelMutation.isPending}
                      data-testid={`button-logout-${channel.id}`}
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout from WhatsApp
                    </Button>
                  </div>
                )}

                {/* WHAPI Channel Details */}
                {channel.whapiChannelId && (
                  <div className="space-y-2 pt-2 border-t">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase">Channel Details</h4>
                    <div className="grid gap-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Channel Ref:</span>
                        <span className="font-mono" data-testid="text-channel-ref">{channel.whapiChannelId}</span>
                      </div>
                      {channel.whapiChannelToken && (
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground">Channel Token:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs break-all flex-1" data-testid="text-channel-token">
                              {channel.whapiChannelToken}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => handleCopyToken(channel.id, channel.whapiChannelToken!)}
                              data-testid={`button-copy-token-${channel.id}`}
                            >
                              {copiedToken === channel.id ? (
                                <Check className="h-3 w-3 text-success" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">WhatsApp Number:</span>
                        <span className="font-mono" data-testid="text-whatsapp-number">{channel.phone}</span>
                      </div>
                      {channel.whapiStatus && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">WHAPI Status:</span>
                          <span className="font-mono" data-testid="text-whapi-status">{channel.whapiStatus}</span>
                        </div>
                      )}
                      {channel.stopped !== null && channel.stopped !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Stopped:</span>
                          <span className="font-mono" data-testid="text-stopped">{channel.stopped ? "Yes" : "No"}</span>
                        </div>
                      )}
                      {channel.creationTS && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Created At:</span>
                          <span className="font-mono text-xs" data-testid="text-created-at">
                            {new Date(channel.creationTS).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {channel.expiresAt && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Expires At:</span>
                          <span className="font-mono text-xs" data-testid="text-expires-at">
                            {new Date(channel.expiresAt).toLocaleString()}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Days Remaining:</span>
                        <span 
                          className={`font-mono font-semibold ${
                            (channel.daysRemaining || 0) > 7 
                              ? "text-success" 
                              : (channel.daysRemaining || 0) > 0 
                                ? "text-warning" 
                                : "text-error"
                          }`}
                          data-testid="text-days-remaining"
                        >
                          {channel.daysRemaining || 0} days
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm("Are you sure you want to logout this channel from WhatsApp? You will need to scan the QR code again to reconnect.")) {
                      logoutChannelMutation.mutate(channel.id);
                    }
                  }}
                  disabled={logoutChannelMutation.isPending || !channel.whapiChannelToken}
                  data-testid={`button-logout-${channel.id}`}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this channel? This action cannot be undone.")) {
                      deleteChannelMutation.mutate(channel.id);
                    }
                  }}
                  disabled={deleteChannelMutation.isPending}
                  data-testid={`button-delete-${channel.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Add Channel Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Channel</DialogTitle>
            <DialogDescription>
              Connect a new WhatsApp channel to your account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="label">Channel Label</Label>
              <Input
                id="label"
                placeholder="e.g., Customer Support"
                value={newChannel.label}
                onChange={(e) => setNewChannel({ ...newChannel, label: e.target.value })}
                data-testid="input-channel-label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                placeholder="e.g., +1234567890"
                value={newChannel.phone}
                onChange={(e) => setNewChannel({ ...newChannel, phone: e.target.value })}
                data-testid="input-channel-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addChannelMutation.mutate(newChannel)}
              disabled={!newChannel.label || !newChannel.phone || addChannelMutation.isPending}
              data-testid="button-create-channel"
            >
              Create Channel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={!!qrDialogChannel} onOpenChange={(open) => !open && setQrDialogChannel(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>WhatsApp Authentication</DialogTitle>
            <DialogDescription>
              Scan this QR code with WhatsApp to connect {qrDialogChannel?.label}
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            {fetchQrCodeMutation.isPending ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">Loading QR code...</p>
                </div>
              </div>
            ) : qrCodeData ? (
              <div className="space-y-4">
                {/* Countdown Timer */}
                {countdown > 0 && (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <Badge variant="outline" className="font-mono">
                      {countdown}s
                    </Badge>
                    <span className="text-muted-foreground">remaining</span>
                  </div>
                )}
                
                {/* QR Code Display */}
                <div className="flex items-center justify-center bg-white rounded-lg p-6">
                  {qrCodeData.base64 ? (
                    <img 
                      src={qrCodeData.base64} 
                      alt="WhatsApp QR Code" 
                      className="max-w-full h-auto"
                      data-testid="img-qr-code"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">QR code data not available</p>
                  )}
                </div>

                {/* Instructions */}
                <div className="text-sm space-y-2">
                  <p className="font-medium text-foreground">How to scan:</p>
                  <ol className="list-decimal list-inside space-y-1 pl-2 text-muted-foreground">
                    <li>Open WhatsApp → Settings → Linked Devices</li>
                    <li>Tap "Link a device"</li>
                    <li>Scan this QR code with your phone</li>
                  </ol>
                </div>

                {/* Refresh Button */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => qrDialogChannel && fetchQrCodeMutation.mutate(qrDialogChannel.id)}
                  disabled={fetchQrCodeMutation.isPending}
                  data-testid="button-refresh-qr"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh QR Code
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64">
                <p className="text-sm text-muted-foreground">Failed to load QR code</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setQrDialogChannel(null)}
              className="w-full"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
