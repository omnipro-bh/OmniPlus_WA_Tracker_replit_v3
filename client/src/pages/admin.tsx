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
import { Shield, Plus, Minus, CheckCircle, XCircle, ChevronDown, ChevronRight, Zap, Copy, Pencil, Trash2, Eye, EyeOff, Upload } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { User, OfflinePayment, Channel, Plan, Coupon, UseCase, HomepageFeature } from "@shared/schema";
import { insertUseCaseSchema, insertHomepageFeatureSchema } from "@shared/schema";
import type { z } from "zod";

function AuthSettings() {
  const { toast } = useToast();
  const [enableSignin, setEnableSignin] = useState(true);
  const [enableSignup, setEnableSignup] = useState(true);
  const [signupButtonText, setSignupButtonText] = useState("Start Free Trial");

  const { data: settings, isLoading } = useQuery<{enableSignin: boolean; enableSignup: boolean; signupButtonText: string}>({
    queryKey: ["/api/settings/auth"],
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      setEnableSignin(settings.enableSignin);
      setEnableSignup(settings.enableSignup);
      setSignupButtonText(settings.signupButtonText || "Start Free Trial");
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { enableSignin: boolean; enableSignup: boolean; signupButtonText: string }) => {
      return await apiRequest("PUT", "/api/admin/settings/auth", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/auth"] });
      toast({
        title: "Settings updated",
        description: "Authentication settings have been updated successfully.",
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
    updateSettingsMutation.mutate({ enableSignin, enableSignup, signupButtonText });
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enable-signin">Enable Sign In</Label>
            <p className="text-xs text-muted-foreground">
              Allow users to sign in on the home page
            </p>
          </div>
          <Switch
            id="enable-signin"
            checked={enableSignin}
            onCheckedChange={setEnableSignin}
            data-testid="switch-enable-signin"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enable-signup">Enable Sign Up</Label>
            <p className="text-xs text-muted-foreground">
              Allow new users to register on the home page
            </p>
          </div>
          <Switch
            id="enable-signup"
            checked={enableSignup}
            onCheckedChange={setEnableSignup}
            data-testid="switch-enable-signup"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-button-text">Sign Up Button Text</Label>
          <Input
            id="signup-button-text"
            type="text"
            value={signupButtonText}
            onChange={(e) => setSignupButtonText(e.target.value)}
            placeholder="Start Free Trial"
            disabled={!enableSignup}
            data-testid="input-signup-button-text"
          />
          <p className="text-xs text-muted-foreground">
            Customize the text shown on the sign up button on the homepage
          </p>
        </div>
      </div>

      <Button 
        onClick={handleSave}
        disabled={updateSettingsMutation.isPending}
        data-testid="button-save-auth-settings"
      >
        {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}

function SubscriberKeywordsSettings() {
  const { toast } = useToast();
  const [subscribeKeywords, setSubscribeKeywords] = useState("");
  const [unsubscribeKeywords, setUnsubscribeKeywords] = useState("");

  const { data: keywords, isLoading } = useQuery<{subscribe: string[]; unsubscribe: string[]}>({
    queryKey: ["/api/admin/settings/subscriber-keywords"],
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (keywords) {
      setSubscribeKeywords(keywords.subscribe.join(", "));
      setUnsubscribeKeywords(keywords.unsubscribe.join(", "));
    }
  }, [keywords]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { subscribe: string[]; unsubscribe: string[] }) => {
      return await apiRequest("PUT", "/api/admin/settings/subscriber-keywords", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/subscriber-keywords"] });
      toast({
        title: "Settings updated",
        description: "Subscriber keywords have been updated successfully.",
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
    // Parse comma-separated strings into arrays
    const subscribe = subscribeKeywords
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    
    const unsubscribe = unsubscribeKeywords
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (subscribe.length === 0 || unsubscribe.length === 0) {
      toast({
        title: "Invalid input",
        description: "Please provide at least one keyword for both subscribe and unsubscribe.",
        variant: "destructive",
      });
      return;
    }

    updateSettingsMutation.mutate({ subscribe, unsubscribe });
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="subscribe-keywords">Subscribe Keywords</Label>
          <Input
            id="subscribe-keywords"
            type="text"
            value={subscribeKeywords}
            onChange={(e) => setSubscribeKeywords(e.target.value)}
            placeholder="Subscribe, Join, Sign Up"
            data-testid="input-subscribe-keywords"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated keywords that trigger subscription (case-insensitive)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="unsubscribe-keywords">Unsubscribe Keywords</Label>
          <Input
            id="unsubscribe-keywords"
            type="text"
            value={unsubscribeKeywords}
            onChange={(e) => setUnsubscribeKeywords(e.target.value)}
            placeholder="Unsubscribe, Leave, Stop"
            data-testid="input-unsubscribe-keywords"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated keywords that trigger unsubscription (case-insensitive)
          </p>
        </div>
      </div>

      <Button 
        onClick={handleSave}
        disabled={updateSettingsMutation.isPending}
        data-testid="button-save-subscriber-keywords"
      >
        {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}

function DefaultPageAccessSettings() {
  const { toast } = useToast();
  const [pageAccess, setPageAccess] = useState({
    dashboard: true,
    channels: false,
    send: false,
    templates: false,
    workflows: false,
    outbox: false,
    logs: false,
    bulkLogs: false,
    captureList: false,
    pricing: true,
    settings: false,
    balances: false,
    whapiSettings: false,
    phonebooks: false,
    subscribers: false,
    safetyMeter: false,
    bookingScheduler: false,
  });

  const { data: settings, isLoading } = useQuery<{pageAccess: typeof pageAccess}>({
    queryKey: ["/api/admin/settings/default-page-access"],
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (settings?.pageAccess) {
      setPageAccess(settings.pageAccess);
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { pageAccess: typeof pageAccess }) => {
      return await apiRequest("PUT", "/api/admin/settings/default-page-access", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/default-page-access"] });
      toast({
        title: "Settings updated",
        description: "Default page access settings have been updated successfully.",
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
    updateSettingsMutation.mutate({ pageAccess });
  };

  const handleToggle = (page: string) => {
    setPageAccess((prev) => ({ ...prev, [page]: !prev[page as keyof typeof prev] }));
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading settings...</div>;
  }

  const pages = [
    { key: "dashboard", label: "Dashboard", description: "Main dashboard page" },
    { key: "channels", label: "Channels", description: "Manage WhatsApp channels" },
    { key: "safetyMeter", label: "Safety Meter", description: "Channel health monitoring" },
    { key: "send", label: "Send", description: "Send individual messages" },
    { key: "templates", label: "Templates", description: "Message templates" },
    { key: "workflows", label: "Workflows", description: "Workflow builder" },
    { key: "outbox", label: "Outbox", description: "Message outbox" },
    { key: "logs", label: "Workflow Logs", description: "Workflow execution logs" },
    { key: "bulkLogs", label: "Bulk Logs", description: "Bulk sending logs" },
    { key: "captureList", label: "Data Capture", description: "View captured user responses" },
    { key: "phonebooks", label: "Phonebooks", description: "Manage contact phonebooks" },
    { key: "subscribers", label: "Subscribers", description: "Manage subscribers list" },
    { key: "pricing", label: "Pricing", description: "View pricing plans" },
    { key: "settings", label: "Settings", description: "User account settings" },
    { key: "balances", label: "Balances", description: "View balance information" },
    { key: "whapiSettings", label: "WHAPI Settings", description: "WHAPI configuration" },
    { key: "bookingScheduler", label: "Booking Scheduler", description: "Appointment booking system" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pages.map((page) => (
          <div key={page.key} className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/30 rounded-md">
            <div className="space-y-0.5">
              <Label htmlFor={`page-${page.key}`} className="cursor-pointer">{page.label}</Label>
              <p className="text-xs text-muted-foreground">
                {page.description}
              </p>
            </div>
            <Checkbox
              id={`page-${page.key}`}
              checked={pageAccess[page.key as keyof typeof pageAccess]}
              onCheckedChange={() => handleToggle(page.key)}
              data-testid={`checkbox-page-${page.key}`}
            />
          </div>
        ))}
      </div>

      <div className="bg-muted/30 p-4 rounded-md">
        <p className="text-sm text-muted-foreground">
          These settings control which pages new users can access when they first sign up. Users with subscriptions may have different access based on their plan.
        </p>
      </div>

      <Button
        onClick={handleSave}
        disabled={updateSettingsMutation.isPending}
        data-testid="button-save-page-access"
      >
        {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}

function DefaultThemeSettings() {
  const { toast } = useToast();
  const [defaultTheme, setDefaultTheme] = useState("dark");

  const { data: settings, isLoading } = useQuery<{defaultTheme: string}>({
    queryKey: ["/api/admin/settings/default-theme"],
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (settings?.defaultTheme) {
      setDefaultTheme(settings.defaultTheme);
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { defaultTheme: string }) => {
      return await apiRequest("PUT", "/api/admin/settings/default-theme", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/default-theme"] });
      toast({
        title: "Settings updated",
        description: "Default theme setting has been updated successfully.",
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
    updateSettingsMutation.mutate({ defaultTheme });
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/30 rounded-md">
          <div className="space-y-0.5">
            <Label htmlFor="theme-light" className="cursor-pointer">Light Theme</Label>
            <p className="text-xs text-muted-foreground">
              Use light mode by default for new users
            </p>
          </div>
          <Checkbox
            id="theme-light"
            checked={defaultTheme === "light"}
            onCheckedChange={() => setDefaultTheme("light")}
            data-testid="checkbox-theme-light"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/30 rounded-md">
          <div className="space-y-0.5">
            <Label htmlFor="theme-dark" className="cursor-pointer">Dark Theme</Label>
            <p className="text-xs text-muted-foreground">
              Use dark mode by default for new users
            </p>
          </div>
          <Checkbox
            id="theme-dark"
            checked={defaultTheme === "dark"}
            onCheckedChange={() => setDefaultTheme("dark")}
            data-testid="checkbox-theme-dark"
          />
        </div>
      </div>

      <div className="bg-muted/30 p-4 rounded-md">
        <p className="text-sm text-muted-foreground">
          This setting controls the default theme that will be applied when users first visit the application. Users can change their theme preference at any time.
        </p>
      </div>

      <Button
        onClick={handleSave}
        disabled={updateSettingsMutation.isPending}
        data-testid="button-save-default-theme"
      >
        {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}

function ChatWidgetLocationSettings() {
  const { toast } = useToast();
  const [chatWidgetLocation, setChatWidgetLocation] = useState("all-pages");

  const { data: settings, isLoading } = useQuery<{chatWidgetLocation: string}>({
    queryKey: ["/api/admin/settings/chat-widget-location"],
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (settings?.chatWidgetLocation) {
      setChatWidgetLocation(settings.chatWidgetLocation);
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { chatWidgetLocation: string }) => {
      return await apiRequest("PUT", "/api/admin/settings/chat-widget-location", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/chat-widget-location"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/chat-widget-location"] });
      toast({
        title: "Settings updated",
        description: "Chat widget location setting has been updated successfully.",
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
    updateSettingsMutation.mutate({ chatWidgetLocation });
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/30 rounded-md">
          <div className="space-y-0.5">
            <Label htmlFor="widget-all-pages" className="cursor-pointer">Show on All Pages</Label>
            <p className="text-xs text-muted-foreground">
              Display chat widget on both homepage and dashboard
            </p>
          </div>
          <Checkbox
            id="widget-all-pages"
            checked={chatWidgetLocation === "all-pages"}
            onCheckedChange={() => setChatWidgetLocation("all-pages")}
            data-testid="checkbox-widget-all-pages"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/30 rounded-md">
          <div className="space-y-0.5">
            <Label htmlFor="widget-homepage-only" className="cursor-pointer">Show on Homepage Only</Label>
            <p className="text-xs text-muted-foreground">
              Display chat widget only on the homepage (not in dashboard)
            </p>
          </div>
          <Checkbox
            id="widget-homepage-only"
            checked={chatWidgetLocation === "homepage-only"}
            onCheckedChange={() => setChatWidgetLocation("homepage-only")}
            data-testid="checkbox-widget-homepage-only"
          />
        </div>
      </div>

      <div className="bg-muted/30 p-4 rounded-md">
        <p className="text-sm text-muted-foreground">
          Control where the chat widget appears. "All Pages" shows it everywhere including the user dashboard. "Homepage Only" restricts it to the landing page for visitors only.
        </p>
      </div>

      <Button
        onClick={handleSave}
        disabled={updateSettingsMutation.isPending}
        data-testid="button-save-chat-widget-location"
      >
        {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}

function HttpAllowlistSettings() {
  const { toast } = useToast();
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");

  const { data: settings, isLoading } = useQuery<{allowedDomains: string[]}>({
    queryKey: ["/api/admin/settings/http-allowlist"],
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (settings?.allowedDomains) {
      setDomains(settings.allowedDomains);
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { allowedDomains: string[] }) => {
      return await apiRequest("PUT", "/api/admin/settings/http-allowlist", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/http-allowlist"] });
      toast({
        title: "Settings updated",
        description: "HTTP allowlist has been updated successfully.",
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

  const handleAddDomain = () => {
    const trimmed = newDomain.trim().toLowerCase();
    if (!trimmed) {
      toast({
        title: "Invalid domain",
        description: "Please enter a valid domain",
        variant: "destructive",
      });
      return;
    }

    // Basic domain validation
    const domainPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
    if (!domainPattern.test(trimmed)) {
      toast({
        title: "Invalid domain",
        description: "Please enter a valid domain (e.g., example.com, api.example.com)",
        variant: "destructive",
      });
      return;
    }

    if (domains.includes(trimmed)) {
      toast({
        title: "Domain already exists",
        description: "This domain is already in the allowlist",
        variant: "destructive",
      });
      return;
    }

    const updatedDomains = [...domains, trimmed];
    setDomains(updatedDomains);
    setNewDomain("");
    updateSettingsMutation.mutate({ allowedDomains: updatedDomains });
  };

  const handleRemoveDomain = (domain: string) => {
    const updatedDomains = domains.filter(d => d !== domain);
    setDomains(updatedDomains);
    updateSettingsMutation.mutate({ allowedDomains: updatedDomains });
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-md">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-amber-500 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-500">Security Notice</p>
            <p className="text-xs text-muted-foreground mt-1">
              HTTP Request nodes in workflows can only call HTTPS URLs from domains in this allowlist.
              Add trusted domains like your own backend, whapi.cloud, or webhooks you need to call.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Add Domain</Label>
        <div className="flex gap-2">
          <Input
            placeholder="example.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
            data-testid="input-new-domain"
          />
          <Button 
            onClick={handleAddDomain}
            disabled={updateSettingsMutation.isPending}
            data-testid="button-add-domain"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Examples: api.mybackend.com, gate.whapi.cloud, hooks.zapier.com
        </p>
      </div>

      <div className="space-y-2">
        <Label>Allowed Domains ({domains.length})</Label>
        {domains.length === 0 ? (
          <div className="text-sm text-muted-foreground bg-muted/30 p-4 rounded-md text-center">
            No domains configured. HTTP Request nodes will not work until you add allowed domains.
          </div>
        ) : (
          <div className="space-y-2">
            {domains.map((domain) => (
              <div
                key={domain}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-md"
              >
                <span className="text-sm font-mono">{domain}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveDomain(domain)}
                  disabled={updateSettingsMutation.isPending}
                  data-testid={`button-remove-domain-${domain}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-muted/30 p-4 rounded-md space-y-2">
        <p className="text-sm font-medium">How it works:</p>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Subdomains are automatically allowed (adding example.com allows api.example.com)</li>
          <li>Only HTTPS URLs are permitted (HTTP is blocked for security)</li>
          <li>Redirects are blocked to prevent security bypasses</li>
          <li>Responses are limited to 5MB</li>
          <li>Requests timeout after 10 seconds</li>
        </ul>
      </div>
    </div>
  );
}

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

function CouponsManagement() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    discountPercent: "10",
    maxUses: "",
    expiresAt: "",
    status: "ACTIVE" as "ACTIVE" | "EXPIRED" | "DISABLED",
    planScope: "ALL" as "ALL" | "SPECIFIC" | "USER_SPECIFIC",
    allowedPlanIds: [] as number[],
    allowedUserIds: [] as number[],
  });

  const { data: coupons = [], isLoading } = useQuery<Coupon[]>({
    queryKey: ["/api/admin/coupons"],
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/admin/plans"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/coupons", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      toast({ title: "Coupon created successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create coupon",
        description: error.error || "Could not create coupon",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest("PATCH", `/api/admin/coupons/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      toast({ title: "Coupon updated successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update coupon",
        description: error.error || "Could not update coupon",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/coupons/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      toast({ title: "Coupon deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete coupon",
        description: error.error || "Could not delete coupon",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setIsDialogOpen(false);
    setEditingCoupon(null);
    setFormData({
      code: "",
      discountPercent: "10",
      maxUses: "",
      expiresAt: "",
      status: "ACTIVE",
      planScope: "ALL",
      allowedPlanIds: [],
      allowedUserIds: [],
    });
  };

  const handleEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      discountPercent: String(coupon.discountPercent),
      maxUses: coupon.maxUses ? String(coupon.maxUses) : "",
      expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().split('T')[0] : "",
      status: coupon.status,
      planScope: (coupon.planScope || "ALL") as any,
      allowedPlanIds: (coupon.allowedPlanIds || []) as number[],
      allowedUserIds: (coupon.allowedUserIds || []) as number[],
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      code: formData.code.toUpperCase(),
      discountPercent: parseInt(formData.discountPercent),
      maxUses: formData.maxUses ? parseInt(formData.maxUses) : null,
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null,
      status: formData.status,
      planScope: formData.planScope,
      allowedPlanIds: formData.planScope === "SPECIFIC" ? formData.allowedPlanIds : null,
      allowedUserIds: formData.planScope === "USER_SPECIFIC" ? formData.allowedUserIds : null,
    };

    if (editingCoupon) {
      updateMutation.mutate({ id: editingCoupon.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Discount Coupons</CardTitle>
            <CardDescription>Manage discount coupons for subscription plans</CardDescription>
          </div>
          <Button onClick={() => setIsDialogOpen(true)} data-testid="button-create-coupon">
            <Plus className="h-4 w-4 mr-2" />
            Create Coupon
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading coupons...</div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No coupons yet. Create your first coupon to get started.
          </div>
        ) : (
          <div className="rounded-md border">
            <table className="w-full">
              <thead className="bg-card border-b">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase">Code</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase">Discount</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase">Usage</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase">Scope</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase">Expires</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="border-b hover-elevate" data-testid={`coupon-${coupon.id}`}>
                    <td className="px-4 py-3">
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{coupon.code}</code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{coupon.discountPercent}% OFF</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {coupon.usedCount} / {coupon.maxUses || "∞"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{coupon.planScope || "ALL"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString() : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={coupon.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(coupon)}
                          data-testid={`button-edit-coupon-${coupon.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Delete coupon "${coupon.code}"?`)) {
                              deleteMutation.mutate(coupon.id);
                            }
                          }}
                          data-testid={`button-delete-coupon-${coupon.id}`}
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
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCoupon ? "Edit Coupon" : "Create New Coupon"}</DialogTitle>
            <DialogDescription>
              Configure discount coupon settings and restrictions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Coupon Code *</Label>
                <Input
                  id="code"
                  placeholder="SAVE20"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  data-testid="input-coupon-code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount">Discount % *</Label>
                <Input
                  id="discount"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.discountPercent}
                  onChange={(e) => setFormData({ ...formData, discountPercent: e.target.value })}
                  data-testid="input-discount-percent"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxUses">Max Uses (Optional)</Label>
                <Input
                  id="maxUses"
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={formData.maxUses}
                  onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                  data-testid="input-max-uses"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expires">Expires At (Optional)</Label>
                <Input
                  id="expires"
                  type="date"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  data-testid="input-expires-at"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: any) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger data-testid="select-coupon-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="DISABLED">Disabled</SelectItem>
                    <SelectItem value="EXPIRED">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scope">Plan Scope</Label>
                <Select
                  value={formData.planScope}
                  onValueChange={(value: any) => setFormData({ ...formData, planScope: value })}
                >
                  <SelectTrigger data-testid="select-plan-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Plans</SelectItem>
                    <SelectItem value="SPECIFIC">Specific Plans</SelectItem>
                    <SelectItem value="USER_SPECIFIC">Specific Users</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Conditional: Specific Plans Selection */}
            {formData.planScope === "SPECIFIC" && (
              <div className="space-y-2">
                <Label>Allowed Plans *</Label>
                <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                  {plans.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No plans available</p>
                  ) : (
                    plans.map((plan) => (
                      <div key={plan.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`plan-${plan.id}`}
                          checked={formData.allowedPlanIds.includes(plan.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData({
                                ...formData,
                                allowedPlanIds: [...formData.allowedPlanIds, plan.id],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                allowedPlanIds: formData.allowedPlanIds.filter((id) => id !== plan.id),
                              });
                            }
                          }}
                          data-testid={`checkbox-plan-${plan.id}`}
                        />
                        <Label htmlFor={`plan-${plan.id}`} className="text-sm font-normal cursor-pointer">
                          {plan.name} - ${plan.price ? (plan.price / 100).toFixed(2) : 'Custom'}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select which plans this coupon can be applied to
                </p>
              </div>
            )}

            {/* Conditional: Specific Users Selection */}
            {formData.planScope === "USER_SPECIFIC" && (
              <div className="space-y-2">
                <Label>Allowed Users *</Label>
                <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                  {users.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No users available</p>
                  ) : (
                    users.map((user) => (
                      <div key={user.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`user-${user.id}`}
                          checked={formData.allowedUserIds.includes(user.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData({
                                ...formData,
                                allowedUserIds: [...formData.allowedUserIds, user.id],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                allowedUserIds: formData.allowedUserIds.filter((id) => id !== user.id),
                              });
                            }
                          }}
                          data-testid={`checkbox-user-${user.id}`}
                        />
                        <Label htmlFor={`user-${user.id}`} className="text-sm font-normal cursor-pointer">
                          {user.name} ({user.email})
                        </Label>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select which users this coupon can be redeemed by
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.code || createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit-coupon"
            >
              {editingCoupon ? "Update Coupon" : "Create Coupon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function UseCasesManagement() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUseCase, setEditingUseCase] = useState<UseCase | null>(null);
  const [uploadingImages, setUploadingImages] = useState<Map<string, boolean>>(new Map());

  type UseCaseForm = z.infer<typeof insertUseCaseSchema>;

  const form = useForm<UseCaseForm>({
    resolver: zodResolver(insertUseCaseSchema),
    defaultValues: {
      title: "",
      description: "",
      images: [""],
      sortOrder: 0,
      published: true,
    },
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    shouldUnregister: false,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "images" as const,
  });

  const { data: useCases = [], isLoading } = useQuery<UseCase[]>({
    queryKey: ["/api/admin/use-cases"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: UseCaseForm) => {
      return await apiRequest("POST", "/api/admin/use-cases", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/use-cases"] });
      setIsDialogOpen(false);
      setEditingUseCase(null);
      form.reset({
        title: "",
        description: "",
        images: [""],
        sortOrder: 0,
        published: true,
      });
      toast({ title: "Use case created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create use case", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UseCaseForm }) => {
      return await apiRequest("PUT", `/api/admin/use-cases/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/use-cases"] });
      setIsDialogOpen(false);
      setEditingUseCase(null);
      form.reset({
        title: "",
        description: "",
        images: [""],
        sortOrder: 0,
        published: true,
      });
      toast({ title: "Use case updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update use case", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/use-cases/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/use-cases"] });
      toast({ title: "Use case deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete use case", description: error.message, variant: "destructive" });
    },
  });

  const togglePublishedMutation = useMutation({
    mutationFn: async ({ id, published }: { id: number; published: boolean }) => {
      return await apiRequest("PUT", `/api/admin/use-cases/${id}`, { published });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/use-cases"] });
    },
  });

  const handleCreate = () => {
    setEditingUseCase(null);
    form.reset({
      title: "",
      description: "",
      images: [""],
      sortOrder: 0,
      published: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (useCase: UseCase) => {
    setEditingUseCase(useCase);
    const initialImages = useCase.images?.length ? useCase.images : [""];
    form.reset({
      title: useCase.title,
      description: useCase.description,
      images: initialImages,
      sortOrder: useCase.sortOrder,
      published: useCase.published,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: UseCaseForm) => {
    // Filter out empty strings from images array before submitting
    const filteredData = {
      ...data,
      images: data.images.filter((url) => url.trim() !== ""),
    };

    if (editingUseCase) {
      updateMutation.mutate({ id: editingUseCase.id, data: filteredData });
    } else {
      createMutation.mutate(filteredData);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      // Only reset if we're closing without saving
      // Don't reset here to prevent accidental data loss on cancel
      setEditingUseCase(null);
    }
  };

  const handleCancel = () => {
    setIsDialogOpen(false);
    setEditingUseCase(null);
    setUploadingImages(new Map());
    form.reset({
      title: "",
      description: "",
      images: [""],
      sortOrder: 0,
      published: true,
    });
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading use cases...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-4">
        <div>
          <CardTitle>Use Cases Management</CardTitle>
          <CardDescription>Manage articles displayed on the homepage</CardDescription>
        </div>
        <Button onClick={handleCreate} data-testid="button-add-use-case">
          <Plus className="h-4 w-4 mr-2" />
          Add Use Case
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {useCases.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No use cases found. Click "Add Use Case" to create one.</p>
            </div>
          ) : (
            useCases.map((useCase) => (
            <div key={useCase.id} className="flex flex-wrap items-center justify-between gap-2 p-4 border rounded-md">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{useCase.title}</h3>
                  <Badge variant={useCase.published ? "default" : "secondary"}>
                    {useCase.published ? "Published" : "Draft"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{useCase.description}</p>
                {useCase.images && useCase.images.length > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {useCase.images.length} {useCase.images.length === 1 ? "image" : "images"}
                    </Badge>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Sort Order: {useCase.sortOrder}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => togglePublishedMutation.mutate({ id: useCase.id, published: !useCase.published })}
                  data-testid={`button-toggle-usecase-${useCase.id}`}
                >
                  {useCase.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleEdit(useCase)}
                  data-testid={`button-edit-usecase-${useCase.id}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(useCase.id)}
                  data-testid={`button-delete-usecase-${useCase.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
        </div>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingUseCase ? "Edit Use Case" : "Create Use Case"}</DialogTitle>
            <DialogDescription>
              {editingUseCase ? "Update the use case details" : "Add a new use case to the homepage"}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter title" data-testid="input-usecase-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Enter description" rows={4} data-testid="input-usecase-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <FormLabel>Images (for carousel)</FormLabel>
                {fields.map((field, index) => (
                  <FormField
                    key={field.id}
                    control={form.control}
                    name={`images.${index}`}
                    render={({ field: inputField }) => (
                      <FormItem>
                        <div className="flex gap-2 items-start">
                          <div className="flex-1 space-y-2">
                            <FormControl>
                              <Input
                                type="file"
                                accept="image/*"
                                disabled={uploadingImages.get(field.id) || false}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;

                                  // Mark this image as uploading using field.id
                                  setUploadingImages(prev => new Map(prev).set(field.id, true));

                                  try {
                                    // Convert file to base64
                                    const reader = new FileReader();
                                    const base64Promise = new Promise<string>((resolve, reject) => {
                                      reader.onload = () => resolve(reader.result as string);
                                      reader.onerror = reject;
                                      reader.readAsDataURL(file);
                                    });

                                    const base64File = await base64Promise;

                                    const response = await fetch('/api/admin/use-cases/upload-image', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ file: base64File }),
                                    });

                                    if (!response.ok) {
                                      const errorData = await response.json();
                                      throw new Error(errorData.error || 'Upload failed');
                                    }

                                    const data = await response.json();
                                    inputField.onChange(data.path);
                                    toast({ title: "Image uploaded successfully" });
                                  } catch (error: any) {
                                    // Clear the field, preview, and file input on error
                                    inputField.onChange("");
                                    e.target.value = '';
                                    toast({
                                      title: "Image upload failed",
                                      description: error.message,
                                      variant: "destructive",
                                    });
                                  } finally {
                                    // Mark upload as complete
                                    setUploadingImages(prev => {
                                      const next = new Map(prev);
                                      next.delete(field.id);
                                      return next;
                                    });
                                  }
                                }}
                                data-testid={`input-usecase-image-${index}`}
                              />
                            </FormControl>
                            {uploadingImages.get(field.id) && (
                              <p className="text-xs text-muted-foreground">Uploading...</p>
                            )}
                            {inputField.value && (
                              <p className="text-xs text-muted-foreground truncate">
                                {inputField.value}
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                            data-testid={`button-remove-image-${index}`}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append("")}
                  data-testid="button-add-image"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Image
                </Button>
              </div>
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} value={field.value} data-testid="input-usecase-sortorder" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="published"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <FormLabel>Published</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-usecase-published" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button variant="outline" type="button" onClick={handleCancel} data-testid="button-cancel-usecase">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending || uploadingImages.size > 0}
                  data-testid="button-submit-usecase"
                >
                  {uploadingImages.size > 0 
                    ? "Uploading images..." 
                    : editingUseCase 
                    ? "Update" 
                    : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function HomepageFeaturesManagement() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState<HomepageFeature | null>(null);

  type FeatureForm = z.infer<typeof insertHomepageFeatureSchema>;

  const form = useForm<FeatureForm>({
    resolver: zodResolver(insertHomepageFeatureSchema),
    defaultValues: {
      title: "",
      description: "",
      icon: "",
      sortOrder: 0,
      published: true,
    },
  });

  const { data: features = [], isLoading } = useQuery<HomepageFeature[]>({
    queryKey: ["/api/admin/homepage-features"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: FeatureForm) => {
      return await apiRequest("POST", "/api/admin/homepage-features", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/homepage-features"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Feature created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create feature", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: FeatureForm }) => {
      return await apiRequest("PUT", `/api/admin/homepage-features/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/homepage-features"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Feature updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update feature", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/homepage-features/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/homepage-features"] });
      toast({ title: "Feature deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete feature", description: error.message, variant: "destructive" });
    },
  });

  const togglePublishedMutation = useMutation({
    mutationFn: async ({ id, published }: { id: number; published: boolean }) => {
      return await apiRequest("PUT", `/api/admin/homepage-features/${id}`, { published });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/homepage-features"] });
    },
  });

  const handleEdit = (feature: HomepageFeature) => {
    setEditingFeature(feature);
    form.reset({
      title: feature.title,
      description: feature.description,
      icon: feature.icon || "",
      sortOrder: feature.sortOrder,
      published: feature.published,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: FeatureForm) => {
    if (editingFeature) {
      updateMutation.mutate({ id: editingFeature.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading features...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-4">
        <div>
          <CardTitle>Homepage Features Management</CardTitle>
          <CardDescription>Manage features displayed on the homepage</CardDescription>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-feature">
          <Plus className="h-4 w-4 mr-2" />
          Add Feature
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {features.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No features found. Click "Add Feature" to create one.</p>
            </div>
          ) : (
            features.map((feature) => (
            <div key={feature.id} className="flex flex-wrap items-center justify-between gap-2 p-4 border rounded-md">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{feature.title}</h3>
                  <Badge variant={feature.published ? "default" : "secondary"}>
                    {feature.published ? "Published" : "Draft"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{feature.description}</p>
                {feature.icon && (
                  <p className="text-xs text-muted-foreground mt-1">Icon: {feature.icon}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">Sort Order: {feature.sortOrder}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => togglePublishedMutation.mutate({ id: feature.id, published: !feature.published })}
                  data-testid={`button-toggle-feature-${feature.id}`}
                >
                  {feature.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleEdit(feature)}
                  data-testid={`button-edit-feature-${feature.id}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(feature.id)}
                  data-testid={`button-delete-feature-${feature.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
        </div>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingFeature ? "Edit Feature" : "Create Feature"}</DialogTitle>
            <DialogDescription>
              {editingFeature ? "Update the feature details" : "Add a new feature to the homepage"}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter title" data-testid="input-feature-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Enter description" rows={4} data-testid="input-feature-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Icon Name (lucide-react)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="MessageSquare, Users, Zap, etc." data-testid="input-feature-icon" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Enter a lucide-react icon name (e.g., MessageSquare, Users, Bot, BarChart3)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} value={field.value} data-testid="input-feature-sortorder" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="published"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <FormLabel>Published</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-feature-published" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => { setIsDialogOpen(false); setEditingFeature(null); form.reset(); }} data-testid="button-cancel-feature">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit-feature"
                >
                  {editingFeature ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
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
  const [isChannelSelectorOpen, setIsChannelSelectorOpen] = useState(false);
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
    phonebookLimit: "",
    captureSequenceLimit: "",
    bookingSchedulerLimit: "",
    pageAccess: {} as Record<string, boolean>,
    autoExtendEnabled: false,
    skipFriday: false,
    skipSaturday: false,
  });

  // Proof viewer dialog state
  const [isProofDialogOpen, setIsProofDialogOpen] = useState(false);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string>("");

  // Plan editor dialog state
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState({
    name: "",
    currency: "USD",
    price: "",
    displayCurrency: "",
    displayPrice: "",
    billingPeriod: "MONTHLY" as "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL",
    requestType: "PAID" as "PAID" | "REQUEST_QUOTE" | "BOOK_DEMO",
    paymentMethods: [] as string[], // ["paypal", "offline"]
    paypalPlanId: "",
    published: false,
    publishedOnHomepage: false,
    sortOrder: "",
    quarterlyDiscountPercent: "0",
    semiAnnualDiscountPercent: "5",
    annualDiscountPercent: "10",
    enabledBillingPeriods: ["MONTHLY", "SEMI_ANNUAL", "ANNUAL"] as string[],
    isPopular: false,
    safetyMeterEnabled: false,
    freeTrialEnabled: false,
    freeTrialDays: "7",
    // Individual checkboxes for each limit
    enableDailyMessages: true,
    enableBulkMessages: true,
    enableChannels: true,
    enableWorkflows: true,
    enablePhonebooks: true,
    enableCaptureSequences: true,
    enableBookingScheduler: true,
    dailyMessagesLimit: "1000",
    bulkMessagesLimit: "5000",
    channelsLimit: "5",
    chatbotsLimit: "10",
    captureSequenceLimit: "10",
    bookingSchedulerLimit: "10",
    phonebookLimit: "10",
    maxImageSizeMB: "5",
    maxVideoSizeMB: "16",
    maxDocumentSizeMB: "10",
    pageAccess: {
      dashboard: true,
      pricing: true,
      channels: false,
      safetyMeter: false,
      send: false,
      templates: false,
      workflows: false,
      outbox: false,
      logs: false,
      bulkLogs: false,
      captureList: false,
      bookingScheduler: false,
      phonebooks: false,
      subscribers: false,
      settings: false,
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

  // No longer used - channel activation uses activateChannelMutation instead
  // Kept for backward compatibility with remove days functionality
  const adjustDaysMutation = useMutation({
    mutationFn: async ({ userId, days, action }: { userId: number; days: number; action: "add" | "remove" }) => {
      const endpoint = action === "add" ? "add-days" : "remove-days";
      return await apiRequest("POST", `/api/admin/users/${userId}/${endpoint}`, { days });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/balance/transactions"] });
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
      setPaymentStatusTab("APPROVED");
      toast({ title: "Payment approved", description: "Days have been credited to the user." });
    },
  });

  const rejectPaymentMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/admin/offline-payments/${id}/reject`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/offline-payments"] });
      setPaymentStatusTab("REJECTED");
      toast({ title: "Payment rejected" });
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/offline-payments/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/offline-payments"] });
      toast({ title: "Payment deleted", description: "The payment has been permanently removed." });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete payment",
        description: error.error || "Could not delete payment",
        variant: "destructive",
      });
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

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async (userId: number) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/cancel-subscription`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Subscription cancelled", description: "User subscription has been cancelled." });
      setIsUserDrawerOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to cancel subscription",
        description: error.error || "Could not cancel subscription",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      return await apiRequest("DELETE", `/api/admin/users/${userId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted", description: "User and all related data have been permanently deleted." });
      setIsUserDrawerOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete user",
        description: error.error || "Could not delete user",
        variant: "destructive",
      });
    },
  });

  // User overrides mutation
  const updateOverridesMutation = useMutation({
    mutationFn: async ({ userId, overrides }: { userId: number; overrides: any }) => {
      return await apiRequest("PATCH", `/api/admin/users/${userId}/overrides`, overrides);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      // Also invalidate /api/me to refresh sidebar page access if impersonating
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
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

  // Fetch workflows for user (only when drawer is open)
  const { data: userWorkflows } = useQuery<Array<{ id: number; name: string; webhookToken: string; isActive: boolean }>>({
    queryKey: ["/api/admin/users", selectedUserForDrawer?.id, "workflows"],
    queryFn: async () => {
      if (!selectedUserForDrawer?.id) return [];
      const response = await fetch(`/api/admin/users/${selectedUserForDrawer.id}/workflows`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch workflows");
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
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to create plan";
      const details = error?.details;
      
      // If we have detailed validation errors, show them
      if (details?.fieldErrors) {
        const fieldErrors = Object.entries(details.fieldErrors)
          .map(([field, errors]: [string, any]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
          .join('\n');
        toast({ 
          title: "Validation error", 
          description: fieldErrors,
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "Error", 
          description: errorMessage,
          variant: "destructive" 
        });
      }
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
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to update plan";
      const details = error?.details;
      
      // If we have detailed validation errors, show them
      if (details?.fieldErrors) {
        const fieldErrors = Object.entries(details.fieldErrors)
          .map(([field, errors]: [string, any]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
          .join('\n');
        toast({ 
          title: "Validation error", 
          description: fieldErrors,
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "Error", 
          description: errorMessage,
          variant: "destructive" 
        });
      }
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
      displayCurrency: "",
      displayPrice: "",
      billingPeriod: "MONTHLY",
      requestType: "PAID",
      paymentMethods: [],
      paypalPlanId: "",
      published: false,
      publishedOnHomepage: false,
      sortOrder: "",
      quarterlyDiscountPercent: "0",
      semiAnnualDiscountPercent: "5",
      annualDiscountPercent: "10",
      enabledBillingPeriods: ["MONTHLY", "SEMI_ANNUAL", "ANNUAL"],
      isPopular: false,
      safetyMeterEnabled: false,
      freeTrialEnabled: false,
      freeTrialDays: "7",
      enableDailyMessages: true,
      enableBulkMessages: true,
      enableChannels: true,
      enableWorkflows: true,
      enablePhonebooks: true,
      enableCaptureSequences: true,
      enableBookingScheduler: true,
      dailyMessagesLimit: "",
      bulkMessagesLimit: "",
      channelsLimit: "",
      chatbotsLimit: "",
      captureSequenceLimit: "",
      bookingSchedulerLimit: "",
      phonebookLimit: "",
      maxImageSizeMB: "5",
      maxVideoSizeMB: "16",
      maxDocumentSizeMB: "10",
      pageAccess: {
        dashboard: true,
        pricing: true,
        channels: false,
        safetyMeter: false,
        send: false,
        templates: false,
        workflows: false,
        outbox: false,
        logs: false,
        bulkLogs: false,
        captureList: false,
        bookingScheduler: false,
        phonebooks: false,
        subscribers: false,
        settings: false,
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
    // Merge defaults for existing plans that don't have all fields
    const pageAccessWithDefaults = {
      dashboard: true,
      pricing: true,
      channels: false,
      safetyMeter: false,
      send: false,
      templates: false,
      workflows: false,
      outbox: false,
      logs: false,
      bulkLogs: false,
      captureList: false,
      settings: false,
      ...(plan.pageAccess || {}),
    };
    
    // Extract payment methods from JSONB field
    const paymentMethods = Array.isArray((plan as any).paymentMethods) 
      ? (plan as any).paymentMethods 
      : [];
    
    // Detect which limits are enabled (not -1)
    const enableDailyMessages = plan.dailyMessagesLimit !== -1;
    const enableBulkMessages = plan.bulkMessagesLimit !== -1;
    const enableChannels = plan.channelsLimit !== -1;
    const enableWorkflows = plan.chatbotsLimit !== -1;
    const enablePhonebooks = (plan as any).phonebookLimit !== -1;
    const enableCaptureSequences = (plan as any).captureSequenceLimit !== -1;
    const enableBookingScheduler = (plan as any).bookingSchedulerLimit !== -1;
    
    // Extract enabled billing periods from plan or use defaults
    const enabledBillingPeriods = Array.isArray((plan as any).enabledBillingPeriods)
      ? (plan as any).enabledBillingPeriods
      : ["MONTHLY", "SEMI_ANNUAL", "ANNUAL"];
    
    setPlanForm({
      name: plan.name,
      currency: plan.currency,
      price: plan.price ? String(plan.price / 100) : "",
      displayCurrency: (plan as any).displayCurrency || "",
      displayPrice: (plan as any).displayPrice ? String((plan as any).displayPrice / 100) : "",
      billingPeriod: plan.billingPeriod,
      requestType: plan.requestType,
      paymentMethods: paymentMethods,
      paypalPlanId: (plan as any).paypalPlanId || "",
      published: plan.published,
      publishedOnHomepage: (plan as any).publishedOnHomepage || false,
      sortOrder: String(plan.sortOrder),
      quarterlyDiscountPercent: String((plan as any).quarterlyDiscountPercent ?? 0),
      semiAnnualDiscountPercent: String((plan as any).semiAnnualDiscountPercent ?? 5),
      annualDiscountPercent: String((plan as any).annualDiscountPercent ?? 10),
      enabledBillingPeriods: enabledBillingPeriods,
      isPopular: (plan as any).isPopular || false,
      safetyMeterEnabled: (plan as any).safetyMeterEnabled || false,
      freeTrialEnabled: (plan as any).freeTrialEnabled || false,
      freeTrialDays: String((plan as any).freeTrialDays ?? 7),
      enableDailyMessages,
      enableBulkMessages,
      enableChannels,
      enableWorkflows,
      enablePhonebooks,
      enableCaptureSequences,
      enableBookingScheduler,
      dailyMessagesLimit: String(plan.dailyMessagesLimit),
      bulkMessagesLimit: String(plan.bulkMessagesLimit),
      channelsLimit: String(plan.channelsLimit),
      chatbotsLimit: String(plan.chatbotsLimit || ""),
      captureSequenceLimit: String((plan as any).captureSequenceLimit || ""),
      bookingSchedulerLimit: String((plan as any).bookingSchedulerLimit || ""),
      phonebookLimit: String((plan as any).phonebookLimit || ""),
      maxImageSizeMB: String((plan as any).maxImageSizeMB ?? 5),
      maxVideoSizeMB: String((plan as any).maxVideoSizeMB ?? 16),
      maxDocumentSizeMB: String((plan as any).maxDocumentSizeMB ?? 10),
      pageAccess: pageAccessWithDefaults as any,
      features: Array.isArray(plan.features) ? plan.features : [],
    });
    setNewFeature("");
    setIsPlanDialogOpen(true);
  };

  const handleSavePlan = () => {
    console.log("[PlanSave] Starting validation with enabled limits:", {
      enableDailyMessages: planForm.enableDailyMessages,
      enableBulkMessages: planForm.enableBulkMessages,
      enableChannels: planForm.enableChannels,
      enableWorkflows: planForm.enableWorkflows,
      enablePhonebooks: planForm.enablePhonebooks,
    });
    
    // Validate required numeric fields
    const price = planForm.price ? parseFloat(planForm.price) : null;
    const displayPrice = planForm.displayPrice ? parseFloat(planForm.displayPrice) : null;
    const sortOrder = parseInt(planForm.sortOrder) || 0;
    
    // Each limit: if checkbox unchecked, set to 0 (disabled/not included), otherwise parse value
    const dailyMessagesLimit = planForm.enableDailyMessages ? parseInt(planForm.dailyMessagesLimit) : 0;
    const bulkMessagesLimit = planForm.enableBulkMessages ? parseInt(planForm.bulkMessagesLimit) : 0;
    const channelsLimit = planForm.enableChannels ? parseInt(planForm.channelsLimit) : 0;
    const chatbotsLimit = planForm.enableWorkflows ? parseInt(planForm.chatbotsLimit) : 0;
    const phonebookLimit = planForm.enablePhonebooks ? parseInt(planForm.phonebookLimit) : 0;
    const captureSequenceLimit = planForm.enableCaptureSequences ? parseInt(planForm.captureSequenceLimit) : 0;
    const bookingSchedulerLimit = planForm.enableBookingScheduler ? parseInt(planForm.bookingSchedulerLimit) : 0;

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
    
    // Validate payment methods for PAID plans only
    if (planForm.requestType === "PAID") {
      if (planForm.paymentMethods.length === 0) {
        toast({ 
          title: "Validation error", 
          description: "Please select at least one payment method (PayPal or Offline)", 
          variant: "destructive" 
        });
        return;
      }
      
      // Validate PayPal Plan ID if PayPal is selected for PAID plans
      if (planForm.paymentMethods.includes("paypal") && !planForm.paypalPlanId.trim()) {
        toast({ 
          title: "Validation error", 
          description: "Please insert the PayPal Plan ID to activate PayPal payment for this plan.", 
          variant: "destructive" 
        });
        return;
      }
    }
    
    // Validate each limit ONLY if its checkbox is CHECKED
    if (planForm.enableDailyMessages) {
      if (isNaN(dailyMessagesLimit) || (dailyMessagesLimit <= 0 && dailyMessagesLimit !== -1)) {
        toast({ title: "Validation error", description: "Valid daily messages limit is required (use -1 for unlimited)", variant: "destructive" });
        return;
      }
    }
    if (planForm.enableBulkMessages) {
      if (isNaN(bulkMessagesLimit) || (bulkMessagesLimit <= 0 && bulkMessagesLimit !== -1)) {
        toast({ title: "Validation error", description: "Valid daily bulk messages limit is required (use -1 for unlimited)", variant: "destructive" });
        return;
      }
    }
    if (planForm.enableChannels) {
      if (isNaN(channelsLimit) || (channelsLimit <= 0 && channelsLimit !== -1)) {
        toast({ title: "Validation error", description: "Valid channels limit is required (use -1 for unlimited)", variant: "destructive" });
        return;
      }
    }
    if (planForm.enableWorkflows) {
      if (isNaN(chatbotsLimit) || (chatbotsLimit <= 0 && chatbotsLimit !== -1)) {
        toast({ title: "Validation error", description: "Valid workflow (chatbot) limit is required (use -1 for unlimited)", variant: "destructive" });
        return;
      }
    }
    if (planForm.enablePhonebooks) {
      if (isNaN(phonebookLimit) || (phonebookLimit <= 0 && phonebookLimit !== -1)) {
        toast({ title: "Validation error", description: "Valid phonebook limit is required (use -1 for unlimited)", variant: "destructive" });
        return;
      }
    }
    if (planForm.enableCaptureSequences) {
      if (isNaN(captureSequenceLimit) || (captureSequenceLimit <= 0 && captureSequenceLimit !== -1)) {
        toast({ title: "Validation error", description: "Valid data capture limit is required (use -1 for unlimited)", variant: "destructive" });
        return;
      }
    }

    const maxImageSizeMBRaw = parseInt(planForm.maxImageSizeMB);
    const maxVideoSizeMBRaw = parseInt(planForm.maxVideoSizeMB);
    const maxDocumentSizeMBRaw = parseInt(planForm.maxDocumentSizeMB);
    const maxImageSizeMB = Number.isNaN(maxImageSizeMBRaw) ? 5 : maxImageSizeMBRaw;
    const maxVideoSizeMB = Number.isNaN(maxVideoSizeMBRaw) ? 16 : maxVideoSizeMBRaw;
    const maxDocumentSizeMB = Number.isNaN(maxDocumentSizeMBRaw) ? 10 : maxDocumentSizeMBRaw;

    // Parse discount percentages - preserve 0% instead of defaulting to legacy values
    console.log("[DiscountParsing] Raw form values:", {
      quarterly: planForm.quarterlyDiscountPercent,
      semiAnnual: planForm.semiAnnualDiscountPercent,
      annual: planForm.annualDiscountPercent,
    });
    
    const quarterlyDiscountRaw = parseInt(planForm.quarterlyDiscountPercent);
    const semiAnnualDiscountRaw = parseInt(planForm.semiAnnualDiscountPercent);
    const annualDiscountRaw = parseInt(planForm.annualDiscountPercent);
    
    console.log("[DiscountParsing] Parsed integers:", {
      quarterlyRaw: quarterlyDiscountRaw,
      semiAnnualRaw: semiAnnualDiscountRaw,
      annualRaw: annualDiscountRaw,
    });
    
    const quarterlyDiscountPercent = Number.isNaN(quarterlyDiscountRaw) ? 0 : Math.max(0, Math.min(100, quarterlyDiscountRaw));
    const semiAnnualDiscountPercent = Number.isNaN(semiAnnualDiscountRaw) ? 5 : Math.max(0, Math.min(100, semiAnnualDiscountRaw));
    const annualDiscountPercent = Number.isNaN(annualDiscountRaw) ? 10 : Math.max(0, Math.min(100, annualDiscountRaw));
    
    console.log("[DiscountParsing] Final clamped values:", {
      quarterly: quarterlyDiscountPercent,
      semiAnnual: semiAnnualDiscountPercent,
      annual: annualDiscountPercent,
    });

    const planData = {
      name: planForm.name.trim(),
      currency: planForm.currency,
      price: price ? Math.round(price * 100) : null,
      displayCurrency: planForm.displayCurrency.trim() || null,
      displayPrice: displayPrice ? Math.round(displayPrice * 100) : null,
      billingPeriod: planForm.billingPeriod,
      requestType: planForm.requestType,
      paymentMethods: planForm.requestType === "PAID" ? planForm.paymentMethods : [],
      paypalPlanId: planForm.paymentMethods.includes("paypal") ? planForm.paypalPlanId.trim() : null,
      published: planForm.published,
      publishedOnHomepage: planForm.publishedOnHomepage,
      sortOrder,
      quarterlyDiscountPercent,
      semiAnnualDiscountPercent,
      annualDiscountPercent,
      enabledBillingPeriods: planForm.enabledBillingPeriods,
      isPopular: planForm.isPopular,
      safetyMeterEnabled: planForm.safetyMeterEnabled,
      freeTrialEnabled: planForm.freeTrialEnabled,
      freeTrialDays: parseInt(planForm.freeTrialDays) || 7,
      dailyMessagesLimit,
      bulkMessagesLimit,
      channelsLimit,
      chatbotsLimit,
      phonebookLimit,
      captureSequenceLimit,
      bookingSchedulerLimit,
      maxImageSizeMB,
      maxVideoSizeMB,
      maxDocumentSizeMB,
      pageAccess: planForm.pageAccess,
      features: planForm.features.filter(f => f.trim()).map(f => f.trim()),
    };
    
    console.log("[PlanSave] Plan data being sent to API:", {
      isPopular: planData.isPopular,
      quarterlyDiscountPercent: planData.quarterlyDiscountPercent,
      semiAnnualDiscountPercent: planData.semiAnnualDiscountPercent,
      annualDiscountPercent: planData.annualDiscountPercent,
      enabledBillingPeriods: planData.enabledBillingPeriods,
    });

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
    
    // Get plan's pageAccess as base, then apply subscription overrides
    // This ensures all page keys are present for proper override functionality
    const planPageAccess = user.currentPlan?.pageAccess || {};
    const subscriptionPageAccess = subscription?.pageAccess || {};
    const allPageKeys = [
      "dashboard", "pricing", "channels", "safetyMeter", "send", 
      "templates", "workflows", "outbox", "logs", "bulkLogs", 
      "captureList", "phonebooks", "subscribers", "settings"
    ];
    
    // Build complete pageAccess object with all keys
    const completePageAccess: Record<string, boolean> = {};
    for (const key of allPageKeys) {
      // If subscription has explicit override, use it; otherwise use plan value
      if (subscriptionPageAccess.hasOwnProperty(key)) {
        completePageAccess[key] = subscriptionPageAccess[key];
      } else {
        completePageAccess[key] = planPageAccess[key] || false;
      }
    }
    
    setUserOverrides({
      dailyMessagesLimit: subscription?.dailyMessagesLimit ? String(subscription.dailyMessagesLimit) : "",
      bulkMessagesLimit: subscription?.bulkMessagesLimit ? String(subscription.bulkMessagesLimit) : "",
      channelsLimit: subscription?.channelsLimit ? String(subscription.channelsLimit) : "",
      chatbotsLimit: subscription?.chatbotsLimit ? String(subscription.chatbotsLimit) : "",
      phonebookLimit: subscription?.phonebookLimit ? String(subscription.phonebookLimit) : "",
      captureSequenceLimit: subscription?.captureSequenceLimit ? String(subscription.captureSequenceLimit) : "",
      bookingSchedulerLimit: subscription?.bookingSchedulerLimit ? String(subscription.bookingSchedulerLimit) : "",
      pageAccess: completePageAccess,
      autoExtendEnabled: subscription?.autoExtendEnabled || false,
      skipFriday: subscription?.skipFriday || false,
      skipSaturday: subscription?.skipSaturday || false,
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
      phonebookLimit: userOverrides.phonebookLimit ? parseInt(userOverrides.phonebookLimit) : null,
      captureSequenceLimit: userOverrides.captureSequenceLimit ? parseInt(userOverrides.captureSequenceLimit) : null,
      bookingSchedulerLimit: userOverrides.bookingSchedulerLimit ? parseInt(userOverrides.bookingSchedulerLimit) : null,
      pageAccess: Object.keys(userOverrides.pageAccess).length > 0 ? userOverrides.pageAccess : null,
      autoExtendEnabled: userOverrides.autoExtendEnabled,
      skipFriday: userOverrides.skipFriday,
      skipSaturday: userOverrides.skipSaturday,
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
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="users">Users & Billing</TabsTrigger>
          <TabsTrigger value="payments">Offline Payments</TabsTrigger>
          <TabsTrigger value="requests">Plan Requests</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="coupons">Coupons</TabsTrigger>
          <TabsTrigger value="use-cases">Use Cases</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
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
                                {user.role !== "admin" && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        await apiRequest("POST", `/api/admin/impersonate/${user.id}`);
                                        toast({
                                          title: "Logged in as user",
                                          description: `You are now viewing the platform as ${user.name || user.email}`,
                                        });
                                        // Reload to apply impersonation
                                        window.location.href = "/dashboard";
                                      } catch (error: any) {
                                        toast({
                                          title: "Failed to impersonate user",
                                          description: error.error || "Could not log in as user",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                    data-testid={`button-impersonate-${user.id}`}
                                  >
                                    <Shield className="h-3 w-3 mr-1" />
                                    Login as User
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    // Open channel selector for this user
                                    setExpandedUserId(user.id);
                                    setActivationUserId(user.id);
                                    setActivationChannelId(null);
                                    setActivationDays("1");
                                    setIsChannelSelectorOpen(true);
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
                                  <div className="flex flex-col gap-1">
                                    <Badge variant={payment.requestType === "PAID" ? "default" : "outline"}>
                                      {payment.requestType || "PAID"}
                                    </Badge>
                                    {(payment as any).type === "FREE_TRIAL" && (
                                      <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400">
                                        FREE TRIAL
                                      </Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm font-mono">
                                  {payment.requestType === "PAID" 
                                    ? `${payment.currency} ${(payment.amount / 100).toFixed(2)}`
                                    : "-"}
                                </td>
                                <td className="px-4 py-3 text-sm max-w-xs">
                                  {payment.requestType === "PAID" ? (
                                    <div className="space-y-1">
                                      <div className="text-xs text-muted-foreground">
                                        Ref: {payment.reference || "-"}
                                      </div>
                                      {payment.couponCode && (
                                        <div className="text-xs">
                                          <span className="font-medium">Coupon:</span>{" "}
                                          <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                                            {payment.couponCode}
                                          </code>
                                        </div>
                                      )}
                                      {payment.proofUrl && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            setSelectedProofUrl(payment.proofUrl);
                                            setIsProofDialogOpen(true);
                                          }}
                                          data-testid={`button-view-proof-${payment.id}`}
                                        >
                                          <Upload className="h-3 w-3 mr-1" />
                                          View Proof
                                        </Button>
                                      )}
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
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => {
                                          if (confirm("Are you sure you want to permanently delete this payment? This action cannot be undone.")) {
                                            deletePaymentMutation.mutate(payment.id);
                                          }
                                        }}
                                        data-testid={`button-delete-${payment.id}`}
                                      >
                                        <Trash2 className="h-3 w-3 mr-1" />
                                        Delete
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
                            {(plan as any).displayCurrency || plan.currency} {((plan as any).displayPrice || plan.price) ? (((plan as any).displayPrice || plan.price) / 100).toFixed(2) : "0.00"}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {Array.isArray((plan as any).enabledBillingPeriods) && (plan as any).enabledBillingPeriods.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {(plan as any).enabledBillingPeriods.map((period: string) => (
                                  <span key={period} className="text-xs">
                                    {period === "MONTHLY" && "Monthly"}
                                    {period === "QUARTERLY" && "Quarterly"}
                                    {period === "SEMI_ANNUAL" && "Semi-Annual"}
                                    {period === "ANNUAL" && "Annual"}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
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

        {/* Coupons Tab */}
        <TabsContent value="coupons" className="space-y-4">
          <CouponsManagement />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Authentication Settings</CardTitle>
              <CardDescription>
                Control sign in and sign up availability on the home page
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuthSettings />
            </CardContent>
          </Card>

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

          <Card>
            <CardHeader>
              <CardTitle>Default Page Access for New Users</CardTitle>
              <CardDescription>
                Control which pages new users can access when they sign up
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DefaultPageAccessSettings />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Default Theme</CardTitle>
              <CardDescription>
                Set the default theme for new users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DefaultThemeSettings />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chat Widget Location</CardTitle>
              <CardDescription>
                Control where the chat widget appears on your site
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChatWidgetLocationSettings />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscriber Tracking</CardTitle>
              <CardDescription>
                Configure keywords that trigger subscription and unsubscription
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SubscriberKeywordsSettings />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>HTTP Request Allowlist</CardTitle>
              <CardDescription>
                Configure which domains can be called from HTTP Request workflow nodes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HttpAllowlistSettings />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="use-cases" className="space-y-4">
          <UseCasesManagement />
        </TabsContent>

        <TabsContent value="features" className="space-y-4">
          <HomepageFeaturesManagement />
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

      {/* Channel Selector Dialog - First step when admin clicks "+ Days" */}
      <Dialog open={isChannelSelectorOpen} onOpenChange={setIsChannelSelectorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Channel to Add Days</DialogTitle>
            <DialogDescription>
              Choose which channel to add days to. Days will be deducted from the admin main balance pool.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-muted/30 p-3 rounded-md">
              <p className="text-sm text-muted-foreground">Admin Main Balance Pool</p>
              <p className="text-2xl font-semibold text-success">{mainBalance} days</p>
            </div>
            {userChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                This user has no channels. Please create a channel first.
              </p>
            ) : (
              <div className="space-y-2">
                <Label>Select Channel</Label>
                {userChannels.map((channel) => (
                  <Card 
                    key={channel.id} 
                    className={`cursor-pointer hover-elevate ${activationChannelId === channel.id ? 'border-primary' : ''}`}
                    onClick={() => setActivationChannelId(channel.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{channel.label}</p>
                          <p className="text-xs text-muted-foreground">{channel.phone}</p>
                        </div>
                        <div className="text-right">
                          <StatusBadge status={channel.status} />
                          <p className="text-xs text-muted-foreground mt-1">
                            {channel.daysRemaining || 0} days remaining
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsChannelSelectorOpen(false);
                setActivationChannelId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (activationChannelId) {
                  setIsChannelSelectorOpen(false);
                  setIsActivationDialogOpen(true);
                }
              }}
              disabled={!activationChannelId}
              data-testid="button-next-to-days"
            >
              Next
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
                  <Label htmlFor="plan-currency">PayPal Currency</Label>
                  <Select
                    value={planForm.currency}
                    onValueChange={(value) => setPlanForm({ ...planForm, currency: value })}
                  >
                    <SelectTrigger id="plan-currency" data-testid="select-plan-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Currency for PayPal payments</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-price">PayPal Price (USD)</Label>
                  <Input
                    id="plan-price"
                    type="number"
                    step="0.01"
                    placeholder="25.00"
                    value={planForm.price}
                    onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
                    data-testid="input-plan-price"
                  />
                  <p className="text-xs text-muted-foreground">Actual amount charged via PayPal</p>
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
                      <SelectItem value="QUARTERLY">Quarterly (3 months)</SelectItem>
                      <SelectItem value="SEMI_ANNUAL">Semi-Annual (6 months)</SelectItem>
                      <SelectItem value="ANNUAL">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dual Pricing Section */}
              <div className="border-t pt-4 mt-4">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold">Display Pricing (Optional)</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Show a different price to users on the pricing page. Leave empty to show PayPal price.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="plan-display-currency">Display Currency</Label>
                      <Input
                        id="plan-display-currency"
                        placeholder="e.g., BHD"
                        value={planForm.displayCurrency}
                        onChange={(e) => setPlanForm({ ...planForm, displayCurrency: e.target.value })}
                        data-testid="input-plan-display-currency"
                      />
                      <p className="text-xs text-muted-foreground">Currency code shown to users</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="plan-display-price">Display Price</Label>
                      <Input
                        id="plan-display-price"
                        type="number"
                        step="0.01"
                        placeholder="e.g., 9.50"
                        value={planForm.displayPrice}
                        onChange={(e) => setPlanForm({ ...planForm, displayPrice: e.target.value })}
                        data-testid="input-plan-display-price"
                      />
                      <p className="text-xs text-muted-foreground">Price shown on pricing page</p>
                    </div>
                  </div>
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
                      <SelectItem value="PAID">Paid</SelectItem>
                      <SelectItem value="REQUEST_QUOTE">Request Quote</SelectItem>
                      <SelectItem value="BOOK_DEMO">Book Demo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Payment Methods - Only show for PAID plans */}
                {planForm.requestType === "PAID" && (
                  <div className="space-y-3">
                    <Label>Payment Methods *</Label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="payment-paypal"
                          checked={planForm.paymentMethods.includes("paypal")}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setPlanForm({ 
                                ...planForm, 
                                paymentMethods: [...planForm.paymentMethods, "paypal"] 
                              });
                            } else {
                              setPlanForm({ 
                                ...planForm, 
                                paymentMethods: planForm.paymentMethods.filter(m => m !== "paypal"),
                                paypalPlanId: "" // Clear PayPal Plan ID when PayPal is unchecked
                              });
                            }
                          }}
                          data-testid="checkbox-payment-paypal"
                        />
                        <Label htmlFor="payment-paypal" className="text-sm font-normal cursor-pointer">
                          PayPal
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="payment-offline"
                          checked={planForm.paymentMethods.includes("offline")}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setPlanForm({ 
                                ...planForm, 
                                paymentMethods: [...planForm.paymentMethods, "offline"] 
                              });
                            } else {
                              setPlanForm({ 
                                ...planForm, 
                                paymentMethods: planForm.paymentMethods.filter(m => m !== "offline") 
                              });
                            }
                          }}
                          data-testid="checkbox-payment-offline"
                        />
                        <Label htmlFor="payment-offline" className="text-sm font-normal cursor-pointer">
                          Offline
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="payment-freetrial"
                          checked={planForm.freeTrialEnabled}
                          onCheckedChange={(checked) => {
                            setPlanForm({ 
                              ...planForm, 
                              freeTrialEnabled: !!checked
                            });
                          }}
                          data-testid="checkbox-payment-freetrial"
                        />
                        <Label htmlFor="payment-freetrial" className="text-sm font-normal cursor-pointer">
                          Free Trial
                        </Label>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Select at least one payment method
                    </p>

                    {/* Free Trial Days - Only show when Free Trial is enabled */}
                    {planForm.freeTrialEnabled && (
                      <div className="space-y-2">
                        <Label htmlFor="free-trial-days">Free Trial Days *</Label>
                        <Input
                          id="free-trial-days"
                          type="number"
                          min="1"
                          placeholder="7"
                          value={planForm.freeTrialDays}
                          onChange={(e) => setPlanForm({ ...planForm, freeTrialDays: e.target.value })}
                          data-testid="input-free-trial-days"
                        />
                        <p className="text-xs text-muted-foreground">
                          Number of days for the free trial period
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* PayPal Plan ID - Only show when PayPal is selected */}
                {planForm.requestType === "PAID" && planForm.paymentMethods.includes("paypal") && (
                  <div className="space-y-2">
                    <Label htmlFor="paypal-plan-id">PayPal Plan ID *</Label>
                    <Input
                      id="paypal-plan-id"
                      placeholder="P-XXXXXXXXXXXXXXXXXXXX"
                      value={planForm.paypalPlanId}
                      onChange={(e) => setPlanForm({ ...planForm, paypalPlanId: e.target.value })}
                      data-testid="input-paypal-plan-id"
                    />
                    <p className="text-xs text-muted-foreground">
                      Required to activate PayPal subscription payments
                    </p>
                  </div>
                )}

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

            {/* Pricing Controls */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Pricing Controls</h3>
              
              {/* Discount Percentages */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quarterly-discount">Quarterly Discount %</Label>
                  <Input
                    id="quarterly-discount"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={planForm.quarterlyDiscountPercent}
                    onChange={(e) => setPlanForm({ ...planForm, quarterlyDiscountPercent: e.target.value })}
                    data-testid="input-quarterly-discount"
                  />
                  <p className="text-xs text-muted-foreground">3 months (0-100)</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="semi-annual-discount">Semi-Annual Discount %</Label>
                  <Input
                    id="semi-annual-discount"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="5"
                    value={planForm.semiAnnualDiscountPercent}
                    onChange={(e) => setPlanForm({ ...planForm, semiAnnualDiscountPercent: e.target.value })}
                    data-testid="input-semi-annual-discount"
                  />
                  <p className="text-xs text-muted-foreground">6 months (0-100)</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="annual-discount">Annual Discount %</Label>
                  <Input
                    id="annual-discount"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="10"
                    value={planForm.annualDiscountPercent}
                    onChange={(e) => setPlanForm({ ...planForm, annualDiscountPercent: e.target.value })}
                    data-testid="input-annual-discount"
                  />
                  <p className="text-xs text-muted-foreground">12 months (0-100)</p>
                </div>
              </div>

              {/* Enabled Billing Periods */}
              <div className="space-y-3">
                <Label>Enabled Billing Periods</Label>
                <p className="text-xs text-muted-foreground">Select which billing periods to show on pricing page</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="billing-monthly"
                      checked={planForm.enabledBillingPeriods.includes("MONTHLY")}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setPlanForm({ 
                            ...planForm, 
                            enabledBillingPeriods: [...planForm.enabledBillingPeriods, "MONTHLY"] 
                          });
                        } else {
                          setPlanForm({ 
                            ...planForm, 
                            enabledBillingPeriods: planForm.enabledBillingPeriods.filter(p => p !== "MONTHLY") 
                          });
                        }
                      }}
                      data-testid="checkbox-billing-monthly"
                    />
                    <Label htmlFor="billing-monthly" className="text-sm font-normal cursor-pointer">
                      Monthly
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="billing-quarterly"
                      checked={planForm.enabledBillingPeriods.includes("QUARTERLY")}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setPlanForm({ 
                            ...planForm, 
                            enabledBillingPeriods: [...planForm.enabledBillingPeriods, "QUARTERLY"] 
                          });
                        } else {
                          setPlanForm({ 
                            ...planForm, 
                            enabledBillingPeriods: planForm.enabledBillingPeriods.filter(p => p !== "QUARTERLY") 
                          });
                        }
                      }}
                      data-testid="checkbox-billing-quarterly"
                    />
                    <Label htmlFor="billing-quarterly" className="text-sm font-normal cursor-pointer">
                      Quarterly
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="billing-semi-annual"
                      checked={planForm.enabledBillingPeriods.includes("SEMI_ANNUAL")}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setPlanForm({ 
                            ...planForm, 
                            enabledBillingPeriods: [...planForm.enabledBillingPeriods, "SEMI_ANNUAL"] 
                          });
                        } else {
                          setPlanForm({ 
                            ...planForm, 
                            enabledBillingPeriods: planForm.enabledBillingPeriods.filter(p => p !== "SEMI_ANNUAL") 
                          });
                        }
                      }}
                      data-testid="checkbox-billing-semi-annual"
                    />
                    <Label htmlFor="billing-semi-annual" className="text-sm font-normal cursor-pointer">
                      Semi-Annual
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="billing-annual"
                      checked={planForm.enabledBillingPeriods.includes("ANNUAL")}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setPlanForm({ 
                            ...planForm, 
                            enabledBillingPeriods: [...planForm.enabledBillingPeriods, "ANNUAL"] 
                          });
                        } else {
                          setPlanForm({ 
                            ...planForm, 
                            enabledBillingPeriods: planForm.enabledBillingPeriods.filter(p => p !== "ANNUAL") 
                          });
                        }
                      }}
                      data-testid="checkbox-billing-annual"
                    />
                    <Label htmlFor="billing-annual" className="text-sm font-normal cursor-pointer">
                      Annual
                    </Label>
                  </div>
                </div>
              </div>

              {/* Popular Badge Toggle */}
              <div className="space-y-2 flex items-center gap-3">
                <Switch
                  id="plan-is-popular"
                  checked={planForm.isPopular}
                  onCheckedChange={(checked) => setPlanForm({ ...planForm, isPopular: checked })}
                  data-testid="switch-plan-is-popular"
                />
                <Label htmlFor="plan-is-popular">Show POPULAR badge on pricing page</Label>
              </div>

              {/* Safety Meter Toggle */}
              <div className="space-y-2 flex items-center gap-3">
                <Switch
                  id="plan-safety-meter"
                  checked={planForm.safetyMeterEnabled}
                  onCheckedChange={(checked) => setPlanForm({ ...planForm, safetyMeterEnabled: checked })}
                  data-testid="switch-plan-safety-meter"
                />
                <Label htmlFor="plan-safety-meter">Enable Safety Meter feature</Label>
              </div>
            </div>

            {/* Limits */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Usage Limits</h3>
              <p className="text-xs text-muted-foreground">Check each option to enable it in the plan. Unchecked options will be disabled.</p>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Daily Single Messages Limit */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enable-daily-messages"
                      checked={planForm.enableDailyMessages}
                      onCheckedChange={(checked) => setPlanForm({ ...planForm, enableDailyMessages: checked as boolean })}
                      data-testid="checkbox-enable-daily-messages"
                    />
                    <Label htmlFor="enable-daily-messages" className="cursor-pointer">
                      Daily Single Messages Limit
                    </Label>
                  </div>
                  {planForm.enableDailyMessages && (
                    <Input
                      id="plan-daily-messages"
                      type="number"
                      placeholder="1000"
                      value={planForm.dailyMessagesLimit}
                      onChange={(e) => setPlanForm({ ...planForm, dailyMessagesLimit: e.target.value })}
                      data-testid="input-plan-daily-messages"
                    />
                  )}
                </div>

                {/* Daily Bulk Messages Limit */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enable-bulk-messages"
                      checked={planForm.enableBulkMessages}
                      onCheckedChange={(checked) => setPlanForm({ ...planForm, enableBulkMessages: checked as boolean })}
                      data-testid="checkbox-enable-bulk-messages"
                    />
                    <Label htmlFor="enable-bulk-messages" className="cursor-pointer">
                      Daily Bulk Messages Limit
                    </Label>
                  </div>
                  {planForm.enableBulkMessages && (
                    <Input
                      id="plan-bulk-messages"
                      type="number"
                      placeholder="5000"
                      value={planForm.bulkMessagesLimit}
                      onChange={(e) => setPlanForm({ ...planForm, bulkMessagesLimit: e.target.value })}
                      data-testid="input-plan-bulk-messages"
                    />
                  )}
                </div>

                {/* Channels Limit */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enable-channels"
                      checked={planForm.enableChannels}
                      onCheckedChange={(checked) => setPlanForm({ ...planForm, enableChannels: checked as boolean })}
                      data-testid="checkbox-enable-channels"
                    />
                    <Label htmlFor="enable-channels" className="cursor-pointer">
                      Channels Limit
                    </Label>
                  </div>
                  {planForm.enableChannels && (
                    <Input
                      id="plan-channels"
                      type="number"
                      placeholder="5"
                      value={planForm.channelsLimit}
                      onChange={(e) => setPlanForm({ ...planForm, channelsLimit: e.target.value })}
                      data-testid="input-plan-channels"
                    />
                  )}
                </div>

                {/* Workflow (Chatbot) Limit */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enable-workflows"
                      checked={planForm.enableWorkflows}
                      onCheckedChange={(checked) => setPlanForm({ ...planForm, enableWorkflows: checked as boolean })}
                      data-testid="checkbox-enable-workflows"
                    />
                    <Label htmlFor="enable-workflows" className="cursor-pointer">
                      Workflow (Chatbot) Limit
                    </Label>
                  </div>
                  {planForm.enableWorkflows && (
                    <Input
                      id="plan-chatbots"
                      type="number"
                      placeholder="10"
                      value={planForm.chatbotsLimit}
                      onChange={(e) => setPlanForm({ ...planForm, chatbotsLimit: e.target.value })}
                      data-testid="input-plan-chatbots"
                    />
                  )}
                </div>

                {/* Phonebook Limit */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enable-phonebooks"
                      checked={planForm.enablePhonebooks}
                      onCheckedChange={(checked) => setPlanForm({ ...planForm, enablePhonebooks: checked as boolean })}
                      data-testid="checkbox-enable-phonebooks"
                    />
                    <Label htmlFor="enable-phonebooks" className="cursor-pointer">
                      Phonebook Limit
                    </Label>
                  </div>
                  {planForm.enablePhonebooks && (
                    <Input
                      id="plan-phonebook"
                      type="number"
                      placeholder="1000"
                      value={planForm.phonebookLimit}
                      onChange={(e) => setPlanForm({ ...planForm, phonebookLimit: e.target.value })}
                      data-testid="input-plan-phonebook"
                    />
                  )}
                </div>

                {/* Data Capture Limit */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enable-capture-sequences"
                      checked={planForm.enableCaptureSequences}
                      onCheckedChange={(checked) => setPlanForm({ ...planForm, enableCaptureSequences: checked as boolean })}
                      data-testid="checkbox-enable-capture-sequences"
                    />
                    <Label htmlFor="enable-capture-sequences" className="cursor-pointer">
                      Data Capture Limit
                    </Label>
                  </div>
                  {planForm.enableCaptureSequences && (
                    <Input
                      id="plan-capture-sequences"
                      type="number"
                      placeholder="10"
                      value={planForm.captureSequenceLimit}
                      onChange={(e) => setPlanForm({ ...planForm, captureSequenceLimit: e.target.value })}
                      data-testid="input-plan-capture-sequences"
                    />
                  )}
                </div>

                {/* Booking Scheduler Limit */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enable-booking-scheduler"
                      checked={planForm.enableBookingScheduler}
                      onCheckedChange={(checked) => setPlanForm({ ...planForm, enableBookingScheduler: checked as boolean })}
                      data-testid="checkbox-enable-booking-scheduler"
                    />
                    <Label htmlFor="enable-booking-scheduler" className="cursor-pointer">
                      Booking Scheduler Limit
                    </Label>
                  </div>
                  {planForm.enableBookingScheduler && (
                    <Input
                      id="plan-booking-scheduler"
                      type="number"
                      placeholder="10"
                      value={planForm.bookingSchedulerLimit}
                      onChange={(e) => setPlanForm({ ...planForm, bookingSchedulerLimit: e.target.value })}
                      data-testid="input-plan-booking-scheduler"
                    />
                  )}
                </div>
              </div>
              
              <h3 className="text-sm font-semibold mt-4">File Size Limits (MB)</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="plan-max-image">Max Image Size (MB)</Label>
                  <Input
                    id="plan-max-image"
                    type="number"
                    placeholder="5"
                    value={planForm.maxImageSizeMB}
                    onChange={(e) => setPlanForm({ ...planForm, maxImageSizeMB: e.target.value })}
                    data-testid="input-plan-max-image"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-max-video">Max Video Size (MB)</Label>
                  <Input
                    id="plan-max-video"
                    type="number"
                    placeholder="16"
                    value={planForm.maxVideoSizeMB}
                    onChange={(e) => setPlanForm({ ...planForm, maxVideoSizeMB: e.target.value })}
                    data-testid="input-plan-max-video"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-max-document">Max Document Size (MB)</Label>
                  <Input
                    id="plan-max-document"
                    type="number"
                    placeholder="10"
                    value={planForm.maxDocumentSizeMB}
                    onChange={(e) => setPlanForm({ ...planForm, maxDocumentSizeMB: e.target.value })}
                    data-testid="input-plan-max-document"
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
                    id="page-safety-meter"
                    checked={planForm.pageAccess.safetyMeter}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, safetyMeter: !!checked },
                      })
                    }
                    data-testid="checkbox-page-safety-meter"
                  />
                  <Label htmlFor="page-safety-meter" className="text-sm font-normal cursor-pointer">
                    Safety Meter
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
                    Workflow Logs
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-bulklogs"
                    checked={planForm.pageAccess.bulkLogs}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, bulkLogs: !!checked },
                      })
                    }
                    data-testid="checkbox-page-bulklogs"
                  />
                  <Label htmlFor="page-bulklogs" className="text-sm font-normal cursor-pointer">
                    Bulk Logs
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-capturelist"
                    checked={planForm.pageAccess.captureList}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, captureList: !!checked },
                      })
                    }
                    data-testid="checkbox-page-capturelist"
                  />
                  <Label htmlFor="page-capturelist" className="text-sm font-normal cursor-pointer">
                    Data Capture
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-phonebooks"
                    checked={planForm.pageAccess.phonebooks}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, phonebooks: !!checked },
                      })
                    }
                    data-testid="checkbox-page-phonebooks"
                  />
                  <Label htmlFor="page-phonebooks" className="text-sm font-normal cursor-pointer">
                    Phonebooks
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-subscribers"
                    checked={planForm.pageAccess.subscribers}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, subscribers: !!checked },
                      })
                    }
                    data-testid="checkbox-page-subscribers"
                  />
                  <Label htmlFor="page-subscribers" className="text-sm font-normal cursor-pointer">
                    Subscribers
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-settings"
                    checked={planForm.pageAccess.settings}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, settings: !!checked },
                      })
                    }
                    data-testid="checkbox-page-settings"
                  />
                  <Label htmlFor="page-settings" className="text-sm font-normal cursor-pointer">
                    Settings
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="page-bookingscheduler"
                    checked={planForm.pageAccess.bookingScheduler}
                    onCheckedChange={(checked) =>
                      setPlanForm({
                        ...planForm,
                        pageAccess: { ...planForm.pageAccess, bookingScheduler: !!checked },
                      })
                    }
                    data-testid="checkbox-page-bookingscheduler"
                  />
                  <Label htmlFor="page-bookingscheduler" className="text-sm font-normal cursor-pointer">
                    Booking Scheduler
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
                (planForm.requestType === "PAID" && planForm.paymentMethods.length === 0) ||
                (planForm.requestType === "PAID" && planForm.paymentMethods.includes("paypal") && !planForm.paypalPlanId) ||
                (planForm.enableDailyMessages && !planForm.dailyMessagesLimit) ||
                (planForm.enableBulkMessages && !planForm.bulkMessagesLimit) ||
                (planForm.enableChannels && !planForm.channelsLimit) ||
                (planForm.enableWorkflows && !planForm.chatbotsLimit) ||
                (planForm.enablePhonebooks && !planForm.phonebookLimit) ||
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
                  {/* Display up to 5 workflows */}
                  {userWorkflows && userWorkflows.length > 0 ? (
                    <>
                      {userWorkflows.slice(0, 5).map((workflow, index) => (
                        <div key={workflow.id}>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Workflow Webhook {workflow.name}
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all" data-testid={`text-workflow-webhook-${workflow.id}`}>
                              {window.location.origin}/webhooks/whapi/{selectedUserForDrawer.id}/{workflow.webhookToken}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  `${window.location.origin}/webhooks/whapi/${selectedUserForDrawer.id}/${workflow.webhookToken}`
                                );
                                toast({ description: `Workflow "${workflow.name}" webhook URL copied` });
                              }}
                              data-testid={`button-copy-workflow-webhook-${workflow.id}`}
                            >
                              Copy
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {workflow.name} {workflow.isActive ? '(Active)' : '(Inactive)'}
                          </p>
                        </div>
                      ))}
                      {userWorkflows.length > 5 && (
                        <p className="text-xs text-muted-foreground">
                          Note: User has {userWorkflows.length} workflows. Only showing first 5 here.
                        </p>
                      )}
                    </>
                  ) : (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Workflow Webhook</p>
                      <p className="text-xs text-muted-foreground">
                        No workflows created yet. User needs to create a workflow to get webhook URLs.
                      </p>
                    </div>
                  )}
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
                  <div>
                    <Label htmlFor="override-phonebook">Phonebook Limit</Label>
                    <Input
                      id="override-phonebook"
                      type="number"
                      placeholder={effectiveLimits?.planDefaults?.phonebookLimit || "Plan default"}
                      value={userOverrides.phonebookLimit}
                      onChange={(e) => setUserOverrides({ ...userOverrides, phonebookLimit: e.target.value })}
                      data-testid="input-override-phonebook"
                    />
                  </div>
                  <div>
                    <Label htmlFor="override-capture-sequences">Data Capture Limit</Label>
                    <Input
                      id="override-capture-sequences"
                      type="number"
                      placeholder={effectiveLimits?.planDefaults?.captureSequenceLimit || "Plan default"}
                      value={userOverrides.captureSequenceLimit}
                      onChange={(e) => setUserOverrides({ ...userOverrides, captureSequenceLimit: e.target.value })}
                      data-testid="input-override-capture-sequences"
                    />
                  </div>
                  <div>
                    <Label htmlFor="override-booking-scheduler">Booking Scheduler Limit</Label>
                    <Input
                      id="override-booking-scheduler"
                      type="number"
                      placeholder={effectiveLimits?.planDefaults?.bookingSchedulerLimit || "Plan default"}
                      value={userOverrides.bookingSchedulerLimit}
                      onChange={(e) => setUserOverrides({ ...userOverrides, bookingSchedulerLimit: e.target.value })}
                      data-testid="input-override-booking-scheduler"
                    />
                  </div>
                </div>
              </div>

              {/* Page Access Overrides */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Page Access Overrides</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Control which pages this user can access. Checked pages will be accessible, unchecked pages will be hidden.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "dashboard", label: "Dashboard" },
                    { key: "pricing", label: "Pricing" },
                    { key: "channels", label: "Channels" },
                    { key: "safetyMeter", label: "Safety Meter" },
                    { key: "send", label: "Send" },
                    { key: "templates", label: "Templates" },
                    { key: "workflows", label: "Workflows" },
                    { key: "outbox", label: "Outbox" },
                    { key: "logs", label: "Workflow Logs" },
                    { key: "bulkLogs", label: "Bulk Logs" },
                    { key: "captureList", label: "Data Capture" },
                    { key: "bookingScheduler", label: "Booking Scheduler" },
                    { key: "phonebooks", label: "Phonebooks" },
                    { key: "subscribers", label: "Subscribers" },
                    { key: "settings", label: "Settings" },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox
                        id={`page-${key}`}
                        checked={userOverrides.pageAccess[key] || false}
                        onCheckedChange={(checked) => {
                          setUserOverrides({
                            ...userOverrides,
                            pageAccess: { ...userOverrides.pageAccess, [key]: !!checked },
                          });
                        }}
                        data-testid={`checkbox-page-${key}`}
                      />
                      <Label htmlFor={`page-${key}`} className="cursor-pointer">
                        {label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Auto-Extend Settings */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Auto-Extend Channel Days</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Automatically add 1 day to the user's channel at midnight daily, deducting from Main Balance.
                </p>
                <div className="space-y-3 p-3 bg-card border rounded-md">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="auto-extend-enabled"
                      checked={userOverrides.autoExtendEnabled}
                      onCheckedChange={(checked) => {
                        setUserOverrides({
                          ...userOverrides,
                          autoExtendEnabled: !!checked,
                        });
                      }}
                      data-testid="checkbox-auto-extend-enabled"
                    />
                    <Label htmlFor="auto-extend-enabled" className="cursor-pointer">
                      Enable auto-extend (add 1 day daily at midnight)
                    </Label>
                  </div>
                  {userOverrides.autoExtendEnabled && (
                    <div className="ml-6 space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="skip-friday"
                          checked={userOverrides.skipFriday}
                          onCheckedChange={(checked) => {
                            setUserOverrides({
                              ...userOverrides,
                              skipFriday: !!checked,
                            });
                          }}
                          data-testid="checkbox-skip-friday"
                        />
                        <Label htmlFor="skip-friday" className="cursor-pointer text-sm">
                          Skip adding days on Fridays
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="skip-saturday"
                          checked={userOverrides.skipSaturday}
                          onCheckedChange={(checked) => {
                            setUserOverrides({
                              ...userOverrides,
                              skipSaturday: !!checked,
                            });
                          }}
                          data-testid="checkbox-skip-saturday"
                        />
                        <Label htmlFor="skip-saturday" className="cursor-pointer text-sm">
                          Skip adding days on Saturdays
                        </Label>
                      </div>
                    </div>
                  )}
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
                      // Fetch user's channels and open channel selector
                      setExpandedUserId(selectedUserForDrawer.id);
                      setActivationUserId(selectedUserForDrawer.id);
                      setActivationChannelId(null);
                      setActivationDays("1");
                      setIsChannelSelectorOpen(true);
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
                  {selectedUserForDrawer.currentSubscription?.status === "ACTIVE" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Cancel subscription for ${selectedUserForDrawer.email}? Their subscription will be marked as cancelled.`)) {
                          cancelSubscriptionMutation.mutate(selectedUserForDrawer.id);
                        }
                      }}
                      data-testid="button-cancel-subscription"
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Cancel Subscription
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm(`DELETE user ${selectedUserForDrawer.email}? This will permanently delete all their data including channels, messages, workflows, and subscriptions. This action CANNOT be undone!`)) {
                        deleteUserMutation.mutate(selectedUserForDrawer.id);
                      }
                    }}
                    data-testid="button-delete-user"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete User
                  </Button>
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

      {/* Proof Viewer Dialog */}
      <Dialog open={isProofDialogOpen} onOpenChange={setIsProofDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Payment Proof</DialogTitle>
            <DialogDescription>
              Review the uploaded payment confirmation
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-4 bg-muted/30 rounded-lg min-h-[400px]">
            {selectedProofUrl && (
              selectedProofUrl.startsWith('data:image') ? (
                <img 
                  src={selectedProofUrl} 
                  alt="Payment proof" 
                  className="max-w-full max-h-[600px] object-contain"
                  data-testid="image-proof"
                />
              ) : selectedProofUrl.startsWith('data:application/pdf') ? (
                <iframe 
                  src={selectedProofUrl} 
                  className="w-full h-[600px] border rounded"
                  title="Payment proof PDF"
                  data-testid="iframe-proof"
                />
              ) : (
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground">Unable to preview this file type</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = selectedProofUrl;
                      link.download = 'payment-proof';
                      link.click();
                    }}
                    data-testid="button-download-proof"
                  >
                    Download File
                  </Button>
                </div>
              )
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsProofDialogOpen(false)}
              data-testid="button-close-proof"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
