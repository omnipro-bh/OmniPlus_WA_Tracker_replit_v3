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
import { Shield, Plus, Minus, CheckCircle, XCircle, ChevronDown, ChevronRight, Zap, Copy, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { User, OfflinePayment, Channel, Plan } from "@shared/schema";

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

  // Offline payments tab state
  const [paymentStatusTab, setPaymentStatusTab] = useState<"PENDING" | "APPROVED" | "REJECTED">("PENDING");

  // Plan editor dialog state
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState({
    name: "",
    currency: "USD",
    price: "",
    billingPeriod: "MONTHLY" as "MONTHLY" | "SEMI_ANNUAL" | "ANNUAL",
    requestType: "PAID" as "PAID" | "REQUEST_QUOTE" | "BOOK_DEMO",
    published: false,
    sortOrder: "",
    dailyMessagesLimit: "",
    bulkMessagesLimit: "",
    channelsLimit: "",
    chatbotsLimit: "",
    pageAccess: {
      dashboard: true,
      pricing: true,
      channels: false,
      send: false,
      templates: false,
      workflows: false,
      outbox: false,
    },
    features: [] as string[],
  });
  const [newFeature, setNewFeature] = useState("");

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: allPayments = [] } = useQuery<OfflinePayment[]>({
    queryKey: ["/api/admin/offline-payments"],
  });

  // Filter payments by status
  const filteredPayments = allPayments.filter(payment => payment.status === paymentStatusTab);

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/admin/plans"],
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

  // Plan mutations
  const createPlanMutation = useMutation({
    mutationFn: async (planData: any) => {
      return await apiRequest("POST", "/api/admin/plans", planData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      resetPlanForm();
      setIsPlanDialogOpen(false);
      toast({ title: "Plan created successfully" });
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest("PUT", `/api/admin/plans/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      resetPlanForm();
      setIsPlanDialogOpen(false);
      toast({ title: "Plan updated successfully" });
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/plans/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      toast({ title: "Plan deleted successfully" });
    },
  });

  const duplicatePlanMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/admin/plans/${id}/duplicate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      toast({ title: "Plan duplicated successfully" });
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/admin/plans/${id}/toggle-publish`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
    },
  });

  // Plan form helpers
  const resetPlanForm = () => {
    setEditingPlan(null);
    setPlanForm({
      name: "",
      currency: "USD",
      price: "",
      billingPeriod: "MONTHLY",
      requestType: "PAID",
      published: false,
      sortOrder: "",
      dailyMessagesLimit: "",
      bulkMessagesLimit: "",
      channelsLimit: "",
      chatbotsLimit: "",
      pageAccess: {
        dashboard: true,
        pricing: true,
        channels: false,
        send: false,
        templates: false,
        workflows: false,
        outbox: false,
      },
      features: [],
    });
    setNewFeature("");
  };

  const openCreatePlanDialog = () => {
    resetPlanForm();
    setIsPlanDialogOpen(true);
  };

  const openEditPlanDialog = (plan: Plan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      currency: plan.currency,
      price: String(plan.price / 100),
      billingPeriod: plan.billingPeriod,
      requestType: plan.requestType,
      published: plan.published,
      sortOrder: String(plan.sortOrder),
      dailyMessagesLimit: String(plan.dailyMessagesLimit),
      bulkMessagesLimit: String(plan.bulkMessagesLimit),
      channelsLimit: String(plan.channelsLimit),
      chatbotsLimit: String(plan.chatbotsLimit || ""),
      pageAccess: (plan.pageAccess || {
        dashboard: true,
        pricing: true,
        channels: false,
        send: false,
        templates: false,
        workflows: false,
        outbox: false,
      }) as any,
      features: plan.features || [],
    });
    setNewFeature("");
    setIsPlanDialogOpen(true);
  };

  const handleSavePlan = () => {
    // Validate required numeric fields
    const price = parseFloat(planForm.price);
    const sortOrder = parseInt(planForm.sortOrder) || 0;
    const dailyMessagesLimit = parseInt(planForm.dailyMessagesLimit);
    const bulkMessagesLimit = parseInt(planForm.bulkMessagesLimit);
    const channelsLimit = parseInt(planForm.channelsLimit);
    const chatbotsLimit = planForm.chatbotsLimit ? parseInt(planForm.chatbotsLimit) : null;

    // Check for invalid numeric values
    if (!planForm.name.trim()) {
      toast({ title: "Validation error", description: "Plan name is required", variant: "destructive" });
      return;
    }
    if (isNaN(price) || price <= 0) {
      toast({ title: "Validation error", description: "Valid price is required", variant: "destructive" });
      return;
    }
    if (isNaN(dailyMessagesLimit) || dailyMessagesLimit <= 0) {
      toast({ title: "Validation error", description: "Valid daily messages limit is required", variant: "destructive" });
      return;
    }
    if (isNaN(bulkMessagesLimit) || bulkMessagesLimit <= 0) {
      toast({ title: "Validation error", description: "Valid bulk messages limit is required", variant: "destructive" });
      return;
    }
    if (isNaN(channelsLimit) || channelsLimit <= 0) {
      toast({ title: "Validation error", description: "Valid channels limit is required", variant: "destructive" });
      return;
    }
    if (planForm.chatbotsLimit && (isNaN(chatbotsLimit!) || chatbotsLimit! <= 0)) {
      toast({ title: "Validation error", description: "Valid chatbots limit is required", variant: "destructive" });
      return;
    }

    const planData = {
      name: planForm.name.trim(),
      currency: planForm.currency,
      price: Math.round(price * 100),
      billingPeriod: planForm.billingPeriod,
      requestType: planForm.requestType,
      published: planForm.published,
      sortOrder,
      dailyMessagesLimit,
      bulkMessagesLimit,
      channelsLimit,
      chatbotsLimit,
      pageAccess: planForm.pageAccess,
      features: planForm.features.filter(f => f.trim()).map(f => f.trim()),
    };

    if (editingPlan) {
      updatePlanMutation.mutate({ id: editingPlan.id, data: planData });
    } else {
      createPlanMutation.mutate(planData);
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">Users & Billing</TabsTrigger>
          <TabsTrigger value="payments">Offline Payments</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
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
              <CardTitle>Offline Payments</CardTitle>
              <CardDescription>
                Review payment submissions, quote requests, and demo bookings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={paymentStatusTab} onValueChange={(v) => setPaymentStatusTab(v as typeof paymentStatusTab)}>
                <TabsList className="grid w-full grid-cols-3 mb-4">
                  <TabsTrigger value="PENDING" data-testid="tab-pending-payments">
                    Pending ({allPayments.filter(p => p.status === "PENDING").length})
                  </TabsTrigger>
                  <TabsTrigger value="APPROVED" data-testid="tab-approved-payments">
                    Approved ({allPayments.filter(p => p.status === "APPROVED").length})
                  </TabsTrigger>
                  <TabsTrigger value="REJECTED" data-testid="tab-rejected-payments">
                    Rejected ({allPayments.filter(p => p.status === "REJECTED").length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value={paymentStatusTab}>
                  {filteredPayments.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium">No {paymentStatusTab.toLowerCase()} payments</h3>
                      <p className="text-sm text-muted-foreground mt-2">
                        {paymentStatusTab === "PENDING" && "All payments have been processed"}
                        {paymentStatusTab === "APPROVED" && "No payments have been approved yet"}
                        {paymentStatusTab === "REJECTED" && "No payments have been rejected"}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <div className="max-h-[600px] overflow-y-auto">
                        <table className="w-full">
                          <thead className="sticky top-0 bg-card border-b">
                            <tr className="text-left">
                              <th className="px-4 py-3 text-xs font-semibold uppercase">User</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase">Plan</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase">Type</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase">Amount</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase">Details</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase">Date</th>
                              {paymentStatusTab === "PENDING" && (
                                <th className="px-4 py-3 text-xs font-semibold uppercase text-right">Actions</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredPayments.map((payment: any) => (
                              <tr key={payment.id} className="border-b hover-elevate" data-testid={`payment-${payment.id}`}>
                                <td className="px-4 py-3 text-sm">{payment.user?.email}</td>
                                <td className="px-4 py-3 text-sm">{payment.plan?.name}</td>
                                <td className="px-4 py-3">
                                  <Badge variant={payment.requestType === "PAID" ? "default" : "outline"}>
                                    {payment.requestType || "PAID"}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-sm font-mono">
                                  {payment.requestType === "PAID" 
                                    ? `${payment.currency} ${(payment.amount / 100).toFixed(2)}`
                                    : "-"}
                                </td>
                                <td className="px-4 py-3 text-sm max-w-xs">
                                  {payment.requestType === "PAID" ? (
                                    <div className="text-xs text-muted-foreground">
                                      Ref: {payment.reference || "-"}
                                    </div>
                                  ) : payment.metadata ? (
                                    <div className="text-xs space-y-1">
                                      {payment.metadata.name && (
                                        <div><span className="font-medium">Name:</span> {payment.metadata.name}</div>
                                      )}
                                      {payment.metadata.email && (
                                        <div><span className="font-medium">Email:</span> {payment.metadata.email}</div>
                                      )}
                                      {payment.metadata.phone && (
                                        <div><span className="font-medium">Phone:</span> {payment.metadata.phone}</div>
                                      )}
                                      {payment.metadata.company && (
                                        <div><span className="font-medium">Company:</span> {payment.metadata.company}</div>
                                      )}
                                      {payment.metadata.preferredDate && (
                                        <div><span className="font-medium">Preferred Date:</span> {payment.metadata.preferredDate}</div>
                                      )}
                                      {payment.metadata.message && (
                                        <div className="text-xs text-muted-foreground mt-1 italic truncate">
                                          "{payment.metadata.message}"
                                        </div>
                                      )}
                                    </div>
                                  ) : "-"}
                                </td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                  {new Date(payment.createdAt).toLocaleDateString()}
                                </td>
                                {paymentStatusTab === "PENDING" && (
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
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Plans Management</CardTitle>
                  <CardDescription>Create and manage subscription plans</CardDescription>
                </div>
                <Button onClick={openCreatePlanDialog} data-testid="button-create-plan">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Plan
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <div className="max-h-[600px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-card border-b">
                      <tr className="text-left">
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Plan Name</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Price</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Billing</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Type</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Limits</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase">Status</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plans.sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => (
                        <tr key={plan.id} className="border-b hover-elevate" data-testid={`plan-${plan.id}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium">{plan.name}</div>
                            {plan.features && plan.features.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {plan.features.length} features
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-sm">
                            {plan.currency} {(plan.price / 100).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {plan.billingPeriod === "MONTHLY" && "Monthly"}
                            {plan.billingPeriod === "SEMI_ANNUAL" && "6 Months"}
                            {plan.billingPeriod === "ANNUAL" && "Annual"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-xs">
                              {plan.requestType === "PAID" && "Paid"}
                              {plan.requestType === "REQUEST_QUOTE" && "Quote"}
                              {plan.requestType === "BOOK_DEMO" && "Demo"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="space-y-1">
                              <div className="text-xs">
                                <span className="text-muted-foreground">Daily:</span> {plan.dailyMessagesLimit}
                              </div>
                              <div className="text-xs">
                                <span className="text-muted-foreground">Channels:</span> {plan.channelsLimit}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => togglePublishMutation.mutate(plan.id)}
                              data-testid={`button-toggle-publish-${plan.id}`}
                            >
                              {plan.published ? (
                                <>
                                  <Eye className="h-3 w-3 mr-1 text-success" />
                                  <span className="text-success text-xs">Published</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="h-3 w-3 mr-1 text-muted-foreground" />
                                  <span className="text-muted-foreground text-xs">Draft</span>
                                </>
                              )}
                            </Button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditPlanDialog(plan)}
                                data-testid={`button-edit-plan-${plan.id}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => duplicatePlanMutation.mutate(plan.id)}
                                data-testid={`button-duplicate-plan-${plan.id}`}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (confirm(`Delete plan "${plan.name}"?`)) {
                                    deletePlanMutation.mutate(plan.id);
                                  }
                                }}
                                data-testid={`button-delete-plan-${plan.id}`}
                              >
                                <Trash2 className="h-3 w-3 text-error" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
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

      {/* Plan Editor Dialog */}
      <Dialog open={isPlanDialogOpen} onOpenChange={setIsPlanDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Edit Plan" : "Create New Plan"}</DialogTitle>
            <DialogDescription>
              {editingPlan ? "Update plan details and settings" : "Configure a new subscription plan"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Basic Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="plan-name">Plan Name</Label>
                  <Input
                    id="plan-name"
                    placeholder="e.g., Professional Plan"
                    value={planForm.name}
                    onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                    data-testid="input-plan-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-sort-order">Sort Order</Label>
                  <Input
                    id="plan-sort-order"
                    type="number"
                    placeholder="0"
                    value={planForm.sortOrder}
                    onChange={(e) => setPlanForm({ ...planForm, sortOrder: e.target.value })}
                    data-testid="input-plan-sort-order"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="plan-currency">Currency</Label>
                  <Select
                    value={planForm.currency}
                    onValueChange={(value) => setPlanForm({ ...planForm, currency: value })}
                  >
                    <SelectTrigger id="plan-currency" data-testid="select-plan-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="BHD">BHD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-price">Price</Label>
                  <Input
                    id="plan-price"
                    type="number"
                    step="0.01"
                    placeholder="99.00"
                    value={planForm.price}
                    onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
                    data-testid="input-plan-price"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-billing-period">Billing Period</Label>
                  <Select
                    value={planForm.billingPeriod}
                    onValueChange={(value: any) => setPlanForm({ ...planForm, billingPeriod: value })}
                  >
                    <SelectTrigger id="plan-billing-period" data-testid="select-plan-billing-period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="SEMI_ANNUAL">Semi-Annual (6 months)</SelectItem>
                      <SelectItem value="ANNUAL">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="plan-request-type">Request Type</Label>
                  <Select
                    value={planForm.requestType}
                    onValueChange={(value: any) => setPlanForm({ ...planForm, requestType: value })}
                  >
                    <SelectTrigger id="plan-request-type" data-testid="select-plan-request-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PAID">Paid (PayPal + Offline)</SelectItem>
                      <SelectItem value="REQUEST_QUOTE">Request Quote</SelectItem>
                      <SelectItem value="BOOK_DEMO">Book Demo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 flex items-center gap-3 pt-8">
                  <Switch
                    id="plan-published"
                    checked={planForm.published}
                    onCheckedChange={(checked) => setPlanForm({ ...planForm, published: checked })}
                    data-testid="switch-plan-published"
                  />
                  <Label htmlFor="plan-published">Published (visible to users)</Label>
                </div>
              </div>
            </div>

            {/* Limits */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Usage Limits</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="plan-daily-messages">Daily Messages Limit</Label>
                  <Input
                    id="plan-daily-messages"
                    type="number"
                    placeholder="1000"
                    value={planForm.dailyMessagesLimit}
                    onChange={(e) => setPlanForm({ ...planForm, dailyMessagesLimit: e.target.value })}
                    data-testid="input-plan-daily-messages"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-bulk-messages">Bulk Messages Limit</Label>
                  <Input
                    id="plan-bulk-messages"
                    type="number"
                    placeholder="5000"
                    value={planForm.bulkMessagesLimit}
                    onChange={(e) => setPlanForm({ ...planForm, bulkMessagesLimit: e.target.value })}
                    data-testid="input-plan-bulk-messages"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-channels">Channels Limit</Label>
                  <Input
                    id="plan-channels"
                    type="number"
                    placeholder="5"
                    value={planForm.channelsLimit}
                    onChange={(e) => setPlanForm({ ...planForm, channelsLimit: e.target.value })}
                    data-testid="input-plan-channels"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-chatbots">Chatbots Limit (optional)</Label>
                  <Input
                    id="plan-chatbots"
                    type="number"
                    placeholder="10"
                    value={planForm.chatbotsLimit}
                    onChange={(e) => setPlanForm({ ...planForm, chatbotsLimit: e.target.value })}
                    data-testid="input-plan-chatbots"
                  />
                </div>
              </div>
            </div>

            {/* Page Access */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Page Access</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-dashboard"
                    checked={planForm.pageAccess.dashboard}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, dashboard: !!checked },
                      })
                    }
                    data-testid="checkbox-page-dashboard"
                  />
                  <Label htmlFor="page-dashboard" className="text-sm font-normal cursor-pointer">
                    Dashboard
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-pricing"
                    checked={planForm.pageAccess.pricing}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, pricing: !!checked },
                      })
                    }
                    data-testid="checkbox-page-pricing"
                  />
                  <Label htmlFor="page-pricing" className="text-sm font-normal cursor-pointer">
                    Pricing
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-channels"
                    checked={planForm.pageAccess.channels}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, channels: !!checked },
                      })
                    }
                    data-testid="checkbox-page-channels"
                  />
                  <Label htmlFor="page-channels" className="text-sm font-normal cursor-pointer">
                    Channels
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-send"
                    checked={planForm.pageAccess.send}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, send: !!checked },
                      })
                    }
                    data-testid="checkbox-page-send"
                  />
                  <Label htmlFor="page-send" className="text-sm font-normal cursor-pointer">
                    Send Messages
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-templates"
                    checked={planForm.pageAccess.templates}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, templates: !!checked },
                      })
                    }
                    data-testid="checkbox-page-templates"
                  />
                  <Label htmlFor="page-templates" className="text-sm font-normal cursor-pointer">
                    Templates
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-workflows"
                    checked={planForm.pageAccess.workflows}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, workflows: !!checked },
                      })
                    }
                    data-testid="checkbox-page-workflows"
                  />
                  <Label htmlFor="page-workflows" className="text-sm font-normal cursor-pointer">
                    Workflows
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-outbox"
                    checked={planForm.pageAccess.outbox}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, outbox: !!checked },
                      })
                    }
                    data-testid="checkbox-page-outbox"
                  />
                  <Label htmlFor="page-outbox" className="text-sm font-normal cursor-pointer">
                    Outbox
                  </Label>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Features List</h3>
              <div className="space-y-2">
                {planForm.features.map((feature, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={feature}
                      onChange={(e) => {
                        const newFeatures = [...planForm.features];
                        newFeatures[index] = e.target.value;
                        setPlanForm({ ...planForm, features: newFeatures });
                      }}
                      placeholder="Enter feature description"
                      data-testid={`input-feature-${index}`}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newFeatures = planForm.features.filter((_, i) => i !== index);
                        setPlanForm({ ...planForm, features: newFeatures });
                      }}
                      data-testid={`button-remove-feature-${index}`}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    placeholder="Add new feature"
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newFeature.trim()) {
                        setPlanForm({ ...planForm, features: [...planForm.features, newFeature.trim()] });
                        setNewFeature("");
                      }
                    }}
                    data-testid="input-new-feature"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (newFeature.trim()) {
                        setPlanForm({ ...planForm, features: [...planForm.features, newFeature.trim()] });
                        setNewFeature("");
                      }
                    }}
                    data-testid="button-add-feature"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsPlanDialogOpen(false);
                resetPlanForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePlan}
              disabled={
                !planForm.name ||
                !planForm.price ||
                !planForm.dailyMessagesLimit ||
                !planForm.bulkMessagesLimit ||
                !planForm.channelsLimit ||
                createPlanMutation.isPending ||
                updatePlanMutation.isPending
              }
              data-testid="button-save-plan"
            >
              {editingPlan ? "Update Plan" : "Create Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
