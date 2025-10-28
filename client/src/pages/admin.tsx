import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield, Plus, Minus, CheckCircle, XCircle, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import type { User, OfflinePayment, Channel } from "@shared/schema";

export default function Admin() {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [daysToAdd, setDaysToAdd] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [action, setAction] = useState<"add" | "remove">("add");
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  
  // Channel activation dialog state
  const [isActivationDialogOpen, setIsActivationDialogOpen] = useState(false);
  const [activationChannelId, setActivationChannelId] = useState<number | null>(null);
  const [activationUserId, setActivationUserId] = useState<number | null>(null);
  const [activationDays, setActivationDays] = useState("30");

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: pendingPayments = [] } = useQuery<OfflinePayment[]>({
    queryKey: ["/api/admin/offline-payments"],
  });

  // Fetch admin main balance
  const { data: mainBalance = 0 } = useQuery<number>({
    queryKey: ["/api/admin/balance"],
    queryFn: async () => {
      const response = await fetch("/api/admin/balance", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch main balance");
      const data = await response.json();
      return data.balance || 0;
    },
  });

  // Fetch channels for expanded user
  const { data: userChannels = [] } = useQuery<Channel[]>({
    queryKey: ["/api/admin/users", expandedUserId, "channels"],
    queryFn: async () => {
      if (!expandedUserId) return [];
      const response = await fetch(`/api/admin/users/${expandedUserId}/channels`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch channels");
      return response.json();
    },
    enabled: !!expandedUserId,
  });

  const adjustDaysMutation = useMutation({
    mutationFn: async ({ userId, days, action }: { userId: number; days: number; action: "add" | "remove" }) => {
      const endpoint = action === "add" ? "add-days" : "remove-days";
      return await apiRequest("POST", `/api/admin/users/${userId}/${endpoint}`, { days });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setIsDialogOpen(false);
      setDaysToAdd("");
      toast({ title: "Days balance updated" });
    },
  });

  const approvePaymentMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/admin/offline-payments/${id}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/offline-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Payment approved", description: "Days have been credited to the user." });
    },
  });

  const rejectPaymentMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/admin/offline-payments/${id}/reject`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/offline-payments"] });
      toast({ title: "Payment rejected" });
    },
  });

  const activateChannelMutation = useMutation({
    mutationFn: async ({ userId, channelId, days }: { userId: number; channelId: number; days: number }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/channels/${channelId}/activate`, { days });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", expandedUserId, "channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] }); // Refresh user data across all pages
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] }); // Refresh channels in user view
      setIsActivationDialogOpen(false);
      setActivationDays("30");
      setActivationChannelId(null);
      setActivationUserId(null);
      toast({ 
        title: "Days added successfully", 
        description: "Channel days have been updated and main balance deducted." 
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add days",
        description: error.message || "Could not add days to channel",
        variant: "destructive",
      });
    },
  });

  const handleActivateChannel = () => {
    if (activationChannelId && activationUserId && activationDays) {
      const days = parseInt(activationDays);
      
      if (days < 1) {
        toast({
          title: "Invalid input",
          description: "Days must be at least 1",
          variant: "destructive",
        });
        return;
      }
      
      if (days > mainBalance) {
        toast({
          title: "Insufficient balance",
          description: `Main balance only has ${mainBalance} days available. Cannot add ${days} days.`,
          variant: "destructive",
        });
        return;
      }
      
      activateChannelMutation.mutate({ userId: activationUserId, channelId: activationChannelId, days });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage users and billing</p>
        </div>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="users">Users & Billing</TabsTrigger>
          <TabsTrigger value="payments">Offline Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Billing & Balances</CardTitle>
              <CardDescription>
                Manage user subscriptions and days balance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <div className="max-h-[600px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-card border-b">
                      <tr className="text-left">
                        <th className="px-4 py-3 text-xs font-semibold uppercase w-10"></th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">User</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Email</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Plan</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Channels</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Days</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Status</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <>
                          <tr key={user.id} className="border-b hover-elevate" data-testid={`user-${user.id}`}>
                            <td className="px-4 py-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}
                                data-testid={`button-expand-${user.id}`}
                              >
                                {expandedUserId === user.id ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium">{user.name}</td>
                            <td className="px-4 py-3 text-sm">{user.email}</td>
                            <td className="px-4 py-3 text-sm">
                              {user.currentPlan?.name || "None"}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {user.channelsUsed} / {user.channelsLimit || 0}
                            </td>
                            <td className="px-4 py-3 text-sm font-mono">
                              <span className={user.daysBalance > 0 ? "text-success" : "text-error"}>
                                {user.daysBalance}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={user.status.toUpperCase() as any} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setAction("add");
                                    setIsDialogOpen(true);
                                  }}
                                  data-testid={`button-add-days-${user.id}`}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Days
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setAction("remove");
                                    setIsDialogOpen(true);
                                  }}
                                  data-testid={`button-remove-days-${user.id}`}
                                >
                                  <Minus className="h-3 w-3 mr-1" />
                                  Days
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expandedUserId === user.id && (
                            <tr className="bg-muted/30">
                              <td colSpan={8} className="px-4 py-4">
                                <div className="space-y-2">
                                  <h4 className="text-sm font-semibold">Channels</h4>
                                  {userChannels.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No channels found</p>
                                  ) : (
                                    <div className="grid gap-2">
                                      {userChannels.map((channel) => (
                                        <div
                                          key={channel.id}
                                          className="flex items-center justify-between bg-card p-3 rounded-md border"
                                          data-testid={`admin-channel-${channel.id}`}
                                        >
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium">{channel.label}</span>
                                              <StatusBadge status={channel.status} />
                                              {channel.authStatus === "AUTHORIZED" && (
                                                <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/20">
                                                  Authorized
                                                </Badge>
                                              )}
                                            </div>
                                            <p className="text-sm text-muted-foreground font-mono">{channel.phone}</p>
                                          </div>
                                          <Button
                                            variant={channel.status === "PENDING" ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => {
                                              setActivationChannelId(channel.id);
                                              setActivationUserId(user.id);
                                              setActivationDays("30");
                                              setIsActivationDialogOpen(true);
                                            }}
                                            data-testid={`button-admin-add-days-${channel.id}`}
                                          >
                                            <Zap className="h-3 w-3 mr-1" />
                                            {channel.status === "PENDING" ? "Activate" : "Add Days"}
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Offline Payments</CardTitle>
              <CardDescription>
                Review and approve payment submissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingPayments.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium">No pending payments</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    All payments have been processed
                  </p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <table className="w-full">
                    <thead className="bg-card border-b">
                      <tr className="text-left">
                        <th className="px-4 py-3 text-xs font-semibold uppercase">User</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Plan</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Amount</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Reference</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Status</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingPayments.map((payment: any) => (
                        <tr key={payment.id} className="border-b hover-elevate">
                          <td className="px-4 py-3 text-sm">{payment.user?.email}</td>
                          <td className="px-4 py-3 text-sm">{payment.plan?.name}</td>
                          <td className="px-4 py-3 text-sm font-mono">
                            {payment.currency} {(payment.amount / 100).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm">{payment.reference || "-"}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={payment.status} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => approvePaymentMutation.mutate(payment.id)}
                                data-testid={`button-approve-${payment.id}`}
                              >
                                <CheckCircle className="h-3 w-3 mr-1 text-success" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (confirm("Reject this payment?")) {
                                    rejectPaymentMutation.mutate(payment.id);
                                  }
                                }}
                                data-testid={`button-reject-${payment.id}`}
                              >
                                <XCircle className="h-3 w-3 mr-1 text-error" />
                                Reject
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Adjust Days Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === "add" ? "Add" : "Remove"} Days</DialogTitle>
            <DialogDescription>
              {action === "add" ? "Credit" : "Debit"} days for {selectedUser?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="days">Number of Days</Label>
              <Input
                id="days"
                type="number"
                min="1"
                placeholder="Enter days"
                value={daysToAdd}
                onChange={(e) => setDaysToAdd(e.target.value)}
                data-testid="input-days"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedUser && daysToAdd) {
                  adjustDaysMutation.mutate({
                    userId: selectedUser.id,
                    days: parseInt(daysToAdd),
                    action,
                  });
                }
              }}
              disabled={!daysToAdd || adjustDaysMutation.isPending}
              data-testid="button-confirm-days"
            >
              {action === "add" ? "Add" : "Remove"} Days
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Days to Channel Dialog */}
      <Dialog open={isActivationDialogOpen} onOpenChange={setIsActivationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Days to Channel</DialogTitle>
            <DialogDescription>
              Specify the number of days to add to this channel. Days will be deducted from the admin main balance pool.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {activationUserId && (() => {
              const channel = userChannels.find(c => c.id === activationChannelId);
              const days = parseInt(activationDays) || 0;
              const hasError = days < 1 || days > mainBalance;
              const errorMessage = days < 1 
                ? "Days must be at least 1" 
                : days > mainBalance 
                  ? `Main balance only has ${mainBalance} days available` 
                  : "";
              
              return (
                <>
                  <div className="bg-muted/30 p-3 rounded-md">
                    <p className="text-sm text-muted-foreground">Admin Main Balance Pool</p>
                    <p className="text-2xl font-semibold text-success">{mainBalance} days</p>
                  </div>
                  {channel && (
                    <div className="bg-muted/30 p-3 rounded-md">
                      <p className="text-sm text-muted-foreground">Channel Current Days</p>
                      <p className="text-2xl font-semibold text-primary">{channel.daysRemaining || 0} days</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="activation-days">Number of Days to Add</Label>
                    <Input
                      id="activation-days"
                      type="number"
                      min="1"
                      max={mainBalance}
                      placeholder="Enter days"
                      value={activationDays}
                      onChange={(e) => setActivationDays(e.target.value)}
                      className={hasError ? "border-error" : ""}
                      data-testid="input-activation-days"
                      autoFocus
                    />
                    {hasError && activationDays ? (
                      <p className="text-xs text-error">{errorMessage}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Recommended: 30 days minimum
                      </p>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsActivationDialogOpen(false);
                setActivationDays("30");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleActivateChannel}
              disabled={
                !activationDays || 
                parseInt(activationDays) < 1 || 
                parseInt(activationDays) > mainBalance ||
                activateChannelMutation.isPending
              }
              data-testid="button-confirm-activation"
            >
              <Zap className="h-3 w-3 mr-1" />
              Add Days
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
