import { useState, useEffect } from "react";
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

function BulkSpeedSettings() {
  const { toast } = useToast();
  const [minDelay, setMinDelay] = useState("");
  const [maxDelay, setMaxDelay] = useState("");

  const { data: settings, isLoading } = useQuery<{minDelay?: string; maxDelay?: string}>({
    queryKey: ["/api/admin/settings/bulk-speed"],
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      setMinDelay(settings.minDelay || "10");
      setMaxDelay(settings.maxDelay || "20");
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { minDelay: string; maxDelay: string }) => {
      return await apiRequest("PUT", "/api/admin/settings/bulk-speed", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/bulk-speed"] });
      toast({
        title: "Settings updated",
        description: "Bulk send speed settings have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update settings",
        description: error.error || error.message || "Could not update settings",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    const min = parseInt(minDelay);
    const max = parseInt(maxDelay);

    if (min < 1 || max < 1) {
      toast({
        title: "Invalid values",
        description: "Both values must be at least 1 second",
        variant: "destructive",
      });
      return;
    }

    if (min > max) {
      toast({
        title: "Invalid range",
        description: "Minimum delay cannot be greater than maximum delay",
        variant: "destructive",
      });
      return;
    }

    updateSettingsMutation.mutate({ minDelay, maxDelay });
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="min-delay">Minimum Delay (seconds)</Label>
          <Input
            id="min-delay"
            type="number"
            min="1"
            placeholder="10"
            value={minDelay}
            onChange={(e) => setMinDelay(e.target.value)}
            data-testid="input-min-delay"
          />
          <p className="text-xs text-muted-foreground">
            Minimum random delay between messages
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="max-delay">Maximum Delay (seconds)</Label>
          <Input
            id="max-delay"
            type="number"
            min="1"
            placeholder="20"
            value={maxDelay}
            onChange={(e) => setMaxDelay(e.target.value)}
            data-testid="input-max-delay"
          />
          <p className="text-xs text-muted-foreground">
            Maximum random delay between messages
          </p>
        </div>
      </div>

      <div className="bg-muted/30 p-4 rounded-md">
        <p className="text-sm text-muted-foreground">
          When bulk messages are sent, the system will wait a random time between {minDelay || "10"} and {maxDelay || "20"} seconds before sending each message. This helps avoid rate limiting and makes the sending pattern look more natural.
        </p>
      </div>

      <Button
        onClick={handleSave}
        disabled={updateSettingsMutation.isPending}
        data-testid="button-save-bulk-speed"
      >
        {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}

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

  // Plan requests tab state
  const [requestStatusTab, setRequestStatusTab] = useState<"PENDING" | "REVIEWED" | "CONTACTED" | "CONVERTED" | "REJECTED">("PENDING");

  // User details drawer state
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [selectedUserForDrawer, setSelectedUserForDrawer] = useState<any | null>(null);
  const [userOverrides, setUserOverrides] = useState({
    dailyMessagesLimit: "",
    bulkMessagesLimit: "",
    channelsLimit: "",
    chatbotsLimit: "",
    pageAccess: {} as Record<string, boolean>,
  });

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
    publishedOnHomepage: false,
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
      logs: false,
    },
    features: [] as string[],
  });
  const [newFeature, setNewFeature] = useState("");

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const { data: allPayments = [] } = useQuery<OfflinePayment[]>({
    queryKey: ["/api/admin/offline-payments"],
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Filter payments by status
  const filteredPayments = allPayments.filter(payment => payment.status === paymentStatusTab);

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/admin/plans"],
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const { data: planRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/plan-requests"],
    refetchOnMount: true,
    refetchOnWindowFocus: true,
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

  const updateRequestStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return await apiRequest("PATCH", `/api/admin/plan-requests/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plan-requests"] });
      toast({ title: "Request status updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update status",
        description: error.error || "An error occurred",
        variant: "destructive",
      });
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

  // Ban/Unban mutations
  const banUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/ban`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User banned", description: "User has been suspended and cannot access the platform." });
      setIsUserDrawerOpen(false);
    },
  });

  const unbanUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/unban`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User unbanned", description: "User can now access the platform." });
      setIsUserDrawerOpen(false);
    },
  });

  // User overrides mutation
  const updateOverridesMutation = useMutation({
    mutationFn: async ({ userId, overrides }: { userId: number; overrides: any }) => {
      return await apiRequest("PATCH", `/api/admin/users/${userId}/overrides`, overrides);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Overrides updated", description: "User subscription overrides have been saved." });
      setIsUserDrawerOpen(false);
    },
  });

  // Fetch effective limits for user (only when drawer is open)
  const { data: effectiveLimits } = useQuery({
    queryKey: ["/api/admin/users", selectedUserForDrawer?.id, "effective-limits"],
    queryFn: async () => {
      if (!selectedUserForDrawer?.id) return null;
      const response = await fetch(`/api/admin/users/${selectedUserForDrawer.id}/effective-limits`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch effective limits");
      return response.json();
    },
    enabled: isUserDrawerOpen && !!selectedUserForDrawer?.id,
  });

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
      publishedOnHomepage: false,
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
        logs: false,
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
      price: plan.price ? String(plan.price / 100) : "",
      billingPeriod: plan.billingPeriod,
      requestType: plan.requestType,
      published: plan.published,
      publishedOnHomepage: (plan as any).publishedOnHomepage || false,
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
        logs: false,
      }) as any,
      features: Array.isArray(plan.features) ? plan.features : [],
    });
    setNewFeature("");
    setIsPlanDialogOpen(true);
  };

  const handleSavePlan = () => {
    // Validate required numeric fields
    const price = planForm.price ? parseFloat(planForm.price) : null;
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
    // Price is required for PAID plans, optional for REQUEST_QUOTE and BOOK_DEMO
    if (planForm.requestType === "PAID" && (!price || price <= 0)) {
      toast({ title: "Validation error", description: "Valid price is required for paid plans", variant: "destructive" });
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
      price: price ? Math.round(price * 100) : null,
      billingPeriod: planForm.billingPeriod,
      requestType: planForm.requestType,
      published: planForm.published,
      publishedOnHomepage: planForm.publishedOnHomepage,
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

  // User drawer handlers
  const openUserDrawer = (user: any) => {
    setSelectedUserForDrawer(user);
    // Initialize overrides form with current values from user's subscription
    const subscription = user.activeSubscription;
    setUserOverrides({
      dailyMessagesLimit: subscription?.dailyMessagesLimit ? String(subscription.dailyMessagesLimit) : "",
      bulkMessagesLimit: subscription?.bulkMessagesLimit ? String(subscription.bulkMessagesLimit) : "",
      channelsLimit: subscription?.channelsLimit ? String(subscription.channelsLimit) : "",
      chatbotsLimit: subscription?.chatbotsLimit ? String(subscription.chatbotsLimit) : "",
      pageAccess: subscription?.pageAccess || {},
    });
    setIsUserDrawerOpen(true);
  };

  const handleSaveOverrides = () => {
    if (!selectedUserForDrawer) return;

    // Parse values - empty string means null (use plan default)
    const overrides = {
      dailyMessagesLimit: userOverrides.dailyMessagesLimit ? parseInt(userOverrides.dailyMessagesLimit) : null,
      bulkMessagesLimit: userOverrides.bulkMessagesLimit ? parseInt(userOverrides.bulkMessagesLimit) : null,
      channelsLimit: userOverrides.channelsLimit ? parseInt(userOverrides.channelsLimit) : null,
      chatbotsLimit: userOverrides.chatbotsLimit ? parseInt(userOverrides.chatbotsLimit) : null,
      pageAccess: Object.keys(userOverrides.pageAccess).length > 0 ? userOverrides.pageAccess : null,
    };

    updateOverridesMutation.mutate({ userId: selectedUserForDrawer.id, overrides });
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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="users">Users & Billing</TabsTrigger>
          <TabsTrigger value="payments">Offline Payments</TabsTrigger>
          <TabsTrigger value="requests">Plan Requests</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
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
                              <div className="flex gap-1 justify-end flex-wrap">
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => openUserDrawer(user)}
                                  data-testid={`button-view-details-${user.id}`}
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  Details
                                </Button>
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

        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Plan Requests</CardTitle>
              <CardDescription>
                Manage quote requests and demo bookings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={requestStatusTab} onValueChange={(v) => setRequestStatusTab(v as any)}>
                <TabsList className="mb-4">
                  <TabsTrigger value="PENDING" data-testid="tab-pending-requests">
                    Pending ({planRequests.filter(r => r.status === "PENDING").length})
                  </TabsTrigger>
                  <TabsTrigger value="REVIEWED" data-testid="tab-reviewed-requests">
                    Reviewed ({planRequests.filter(r => r.status === "REVIEWED").length})
                  </TabsTrigger>
                  <TabsTrigger value="CONTACTED" data-testid="tab-contacted-requests">
                    Contacted ({planRequests.filter(r => r.status === "CONTACTED").length})
                  </TabsTrigger>
                  <TabsTrigger value="CONVERTED" data-testid="tab-converted-requests">
                    Converted ({planRequests.filter(r => r.status === "CONVERTED").length})
                  </TabsTrigger>
                  <TabsTrigger value="REJECTED" data-testid="tab-rejected-requests">
                    Rejected ({planRequests.filter(r => r.status === "REJECTED").length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value={requestStatusTab}>
                  {planRequests.filter(r => r.status === requestStatusTab).length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium">No {requestStatusTab.toLowerCase()} requests</h3>
                      <p className="text-sm text-muted-foreground mt-2">
                        Requests with this status will appear here
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <div className="max-h-[600px] overflow-y-auto">
                        <table className="w-full">
                          <thead className="sticky top-0 bg-card border-b">
                            <tr className="text-left">
                              <th className="px-4 py-3 text-xs font-semibold uppercase">Type</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase">Plan</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase">Name</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase">Contact</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase">Message</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase">Date</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {planRequests
                              .filter(r => r.status === requestStatusTab)
                              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                              .map((request) => (
                                <tr key={request.id} className="border-b hover-elevate" data-testid={`request-${request.id}`}>
                                  <td className="px-4 py-3">
                                    <Badge variant={request.plan?.requestType === 'REQUEST_QUOTE' ? 'default' : 'secondary'}>
                                      {request.plan?.requestType === 'REQUEST_QUOTE' ? 'Quote' : 'Demo'}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3 font-medium">{request.plan?.name || 'N/A'}</td>
                                  <td className="px-4 py-3">{request.name}</td>
                                  <td className="px-4 py-3">
                                    <div className="text-sm">
                                      <div className="font-medium">{request.businessEmail}</div>
                                      <div className="text-muted-foreground">{request.phone}</div>
                                      {request.requestedDate && (
                                        <div className="text-xs text-muted-foreground mt-1">
                                          Requested: {new Date(request.requestedDate).toLocaleDateString()}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 max-w-md">
                                    <div className="text-sm text-muted-foreground line-clamp-2" title={request.message}>
                                      {request.message}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-muted-foreground">
                                    {new Date(request.createdAt).toLocaleDateString()}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Select
                                      value={request.status}
                                      onValueChange={(newStatus) => {
                                        updateRequestStatusMutation.mutate({ id: request.id, status: newStatus });
                                      }}
                                      disabled={updateRequestStatusMutation.isPending}
                                    >
                                      <SelectTrigger className="w-32" data-testid={`select-status-${request.id}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="PENDING">Pending</SelectItem>
                                        <SelectItem value="REVIEWED">Reviewed</SelectItem>
                                        <SelectItem value="CONTACTED">Contacted</SelectItem>
                                        <SelectItem value="CONVERTED">Converted</SelectItem>
                                        <SelectItem value="REJECTED">Rejected</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </td>
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
                            {Array.isArray(plan.features) && plan.features.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {plan.features.length} features
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-sm">
                            {plan.currency} {plan.price ? (plan.price / 100).toFixed(2) : "0.00"}
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

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Sending Speed Control</CardTitle>
              <CardDescription>
                Configure random delay between bulk messages (in seconds)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BulkSpeedSettings />
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

              <div className="space-y-4">
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 flex items-center gap-3">
                    <Switch
                      id="plan-published"
                      checked={planForm.published}
                      onCheckedChange={(checked) => setPlanForm({ ...planForm, published: checked })}
                      data-testid="switch-plan-published"
                    />
                    <Label htmlFor="plan-published">Published (visible to users)</Label>
                  </div>
                  <div className="space-y-2 flex items-center gap-3">
                    <Switch
                      id="plan-published-homepage"
                      checked={planForm.publishedOnHomepage}
                      onCheckedChange={(checked) => setPlanForm({ ...planForm, publishedOnHomepage: checked })}
                      data-testid="switch-plan-published-homepage"
                    />
                    <Label htmlFor="plan-published-homepage">Published on Homepage</Label>
                  </div>
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
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-logs"
                    checked={planForm.pageAccess.logs}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, logs: !!checked },
                      })
                    }
                    data-testid="checkbox-page-logs"
                  />
                  <Label htmlFor="page-logs" className="text-sm font-normal cursor-pointer">
                    Logs
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
                (planForm.requestType === "PAID" && !planForm.price) ||
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

      {/* User Details Drawer */}
      <Dialog open={isUserDrawerOpen} onOpenChange={setIsUserDrawerOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Details & Overrides</DialogTitle>
            <DialogDescription>
              Manage user-specific subscription overrides and account settings
            </DialogDescription>
          </DialogHeader>

          {selectedUserForDrawer && (
            <div className="space-y-6">
              {/* User Info Summary */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-md">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-medium">{selectedUserForDrawer.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedUserForDrawer.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current Plan</p>
                  <p className="font-medium">{selectedUserForDrawer.currentPlan?.name || "None"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <StatusBadge status={selectedUserForDrawer.status.toUpperCase() as any} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Days Balance</p>
                  <p className="font-mono font-medium">{selectedUserForDrawer.daysBalance}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Channels Used</p>
                  <p className="font-medium">{selectedUserForDrawer.channelsUsed} / {selectedUserForDrawer.channelsLimit || 0}</p>
                </div>
              </div>

              {/* Effective Limits Display */}
              {effectiveLimits && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Effective Limits (Plan + Overrides)</h3>
                  <div className="grid grid-cols-2 gap-2 p-3 bg-card border rounded-md">
                    <div className="text-xs">
                      <span className="text-muted-foreground">Daily Messages:</span>
                      <span className="ml-2 font-mono">{effectiveLimits.dailyMessagesLimit}</span>
                    </div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">Bulk Messages:</span>
                      <span className="ml-2 font-mono">{effectiveLimits.bulkMessagesLimit}</span>
                    </div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">Channels:</span>
                      <span className="ml-2 font-mono">{effectiveLimits.channelsLimit}</span>
                    </div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">Chatbots:</span>
                      <span className="ml-2 font-mono">{effectiveLimits.chatbotsLimit || "Unlimited"}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Webhook URLs (Admin Only) */}
              <div>
                <h3 className="text-sm font-semibold mb-2 text-warning">⚠️ Webhook URLs (Admin Only)</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  These webhook URLs are for internal monitoring and should not be shared with users.
                </p>
                <div className="space-y-3 p-3 bg-card border rounded-md">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Bulk Message Status Webhook</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all">
                        {window.location.origin}/webhooks/bulk/{selectedUserForDrawer.id}/{selectedUserForDrawer.bulkWebhookToken || 'not-set'}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${window.location.origin}/webhooks/bulk/${selectedUserForDrawer.id}/${selectedUserForDrawer.bulkWebhookToken || 'not-set'}`
                          );
                          toast({ description: "Bulk webhook URL copied to clipboard" });
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Workflow Webhook (First Workflow)</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all">
                        {window.location.origin}/webhooks/whapi/{selectedUserForDrawer.id}/[workflow-token]
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                      >
                        N/A
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Note: Each workflow has its own unique token. View workflow details to see specific webhook URLs.
                    </p>
                  </div>
                </div>
              </div>

              {/* Subscription Overrides Form */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Per-User Overrides</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Leave empty to use plan defaults. Set values to override plan limits for this user.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="override-daily-messages">Daily Messages Limit</Label>
                    <Input
                      id="override-daily-messages"
                      type="number"
                      placeholder={effectiveLimits?.planDefaults?.dailyMessagesLimit || "Plan default"}
                      value={userOverrides.dailyMessagesLimit}
                      onChange={(e) => setUserOverrides({ ...userOverrides, dailyMessagesLimit: e.target.value })}
                      data-testid="input-override-daily-messages"
                    />
                  </div>
                  <div>
                    <Label htmlFor="override-bulk-messages">Bulk Messages Limit</Label>
                    <Input
                      id="override-bulk-messages"
                      type="number"
                      placeholder={effectiveLimits?.planDefaults?.bulkMessagesLimit || "Plan default"}
                      value={userOverrides.bulkMessagesLimit}
                      onChange={(e) => setUserOverrides({ ...userOverrides, bulkMessagesLimit: e.target.value })}
                      data-testid="input-override-bulk-messages"
                    />
                  </div>
                  <div>
                    <Label htmlFor="override-channels">Channels Limit</Label>
                    <Input
                      id="override-channels"
                      type="number"
                      placeholder={effectiveLimits?.planDefaults?.channelsLimit || "Plan default"}
                      value={userOverrides.channelsLimit}
                      onChange={(e) => setUserOverrides({ ...userOverrides, channelsLimit: e.target.value })}
                      data-testid="input-override-channels"
                    />
                  </div>
                  <div>
                    <Label htmlFor="override-chatbots">Chatbots Limit</Label>
                    <Input
                      id="override-chatbots"
                      type="number"
                      placeholder={effectiveLimits?.planDefaults?.chatbotsLimit || "Plan default"}
                      value={userOverrides.chatbotsLimit}
                      onChange={(e) => setUserOverrides({ ...userOverrides, chatbotsLimit: e.target.value })}
                      data-testid="input-override-chatbots"
                    />
                  </div>
                </div>
              </div>

              {/* Page Access Overrides */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Page Access Overrides</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Check pages to grant this user access, regardless of their plan's page access settings.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {["dashboard", "pricing", "channels", "send", "templates", "workflows", "outbox", "logs"].map((page) => (
                    <div key={page} className="flex items-center gap-2">
                      <Checkbox
                        id={`page-${page}`}
                        checked={userOverrides.pageAccess[page] || false}
                        onCheckedChange={(checked) => {
                          setUserOverrides({
                            ...userOverrides,
                            pageAccess: { ...userOverrides.pageAccess, [page]: !!checked },
                          });
                        }}
                        data-testid={`checkbox-page-${page}`}
                      />
                      <Label htmlFor={`page-${page}`} className="capitalize cursor-pointer">
                        {page}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedUser(selectedUserForDrawer);
                      setAction("add");
                      setIsDialogOpen(true);
                    }}
                    data-testid="button-drawer-add-days"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Days
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedUser(selectedUserForDrawer);
                      setAction("remove");
                      setIsDialogOpen(true);
                    }}
                    data-testid="button-drawer-remove-days"
                  >
                    <Minus className="h-3 w-3 mr-1" />
                    Remove Days
                  </Button>
                  {selectedUserForDrawer.status === "active" ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Ban user ${selectedUserForDrawer.email}? They will be unable to access the platform.`)) {
                          banUserMutation.mutate(selectedUserForDrawer.id);
                        }
                      }}
                      data-testid="button-ban-user"
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Ban User
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Unban user ${selectedUserForDrawer.email}?`)) {
                          unbanUserMutation.mutate(selectedUserForDrawer.id);
                        }
                      }}
                      data-testid="button-unban-user"
                    >
                      <CheckCircle className="h-3 w-3 mr-1 text-success" />
                      Unban User
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsUserDrawerOpen(false)}
              data-testid="button-cancel-drawer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveOverrides}
              disabled={updateOverridesMutation.isPending}
              data-testid="button-save-overrides"
            >
              Save Overrides
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
