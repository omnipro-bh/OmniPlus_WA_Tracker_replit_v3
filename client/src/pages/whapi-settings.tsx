import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings, TestTube, Loader2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function WHAPISettings() {
  const { toast } = useToast();
  const [partnerToken, setPartnerToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://manager.whapi.cloud");
  const [projectId, setProjectId] = useState("");

  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/whapi/settings"],
  });

  useEffect(() => {
    if (settings) {
      setBaseUrl(settings.baseUrl || "https://manager.whapi.cloud");
      setProjectId(settings.projectId || "");
      // Don't populate token field - it's masked in response
    }
  }, [settings]);

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/whapi/settings", {
        partnerToken: partnerToken || undefined,
        baseUrl: baseUrl || undefined,
        projectId: projectId || undefined,
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings saved",
        description: "WHAPI configuration updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/whapi/settings"] });
      setPartnerToken(""); // Clear token field after save
    },
    onError: (error: any) => {
      toast({
        title: "Save failed",
        description: error.message || "Failed to save WHAPI settings",
        variant: "destructive",
      });
    },
  });

  // Test connection mutation
  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/whapi/test", {});
      return await response.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({
          title: "Connection successful",
          description: data.message,
        });
      } else {
        toast({
          title: "Connection failed",
          description: data.message,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Test failed",
        description: error.message || "Failed to test WHAPI connection",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleTest = () => {
    testMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Settings className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold">WHAPI Settings</h1>
          <p className="text-muted-foreground">Configure your WHAPI Partner integration</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Global WHAPI Configuration</CardTitle>
          <CardDescription>
            Manage your WHAPI Partner API credentials for channel management
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="base-url">WHAPI Base URL</Label>
            <Input
              id="base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://manager.whapi.cloud"
              data-testid="input-base-url"
            />
            <p className="text-xs text-muted-foreground">
              The WHAPI Manager API endpoint
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="partner-token">Partner Token</Label>
            <Input
              id="partner-token"
              type="password"
              value={partnerToken}
              onChange={(e) => setPartnerToken(e.target.value)}
              placeholder="Enter new token (leave blank to keep current)"
              data-testid="input-partner-token"
            />
            <p className="text-xs text-muted-foreground">
              Your WHAPI Partner API authorization token. Current: {settings?.partnerToken || "Not set"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-id">WHAPI Project ID</Label>
            <Input
              id="project-id"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="HPN0HOhFfDL1GFg154Pl"
              data-testid="input-project-id"
            />
            <p className="text-xs text-muted-foreground">
              Your WHAPI project identifier for channel creation
            </p>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleSave} 
              disabled={saveMutation.isPending}
              data-testid="button-save-settings"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Settings
            </Button>
            <Button 
              variant="outline" 
              onClick={handleTest}
              disabled={testMutation.isPending}
              data-testid="button-test-connection"
            >
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Channel Management</CardTitle>
          <CardDescription>
            Information about WHAPI channel operations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-medium">Extend Channel</h3>
            <p className="text-sm text-muted-foreground">
              When you add days to a user's balance or approve offline payments, the system
              automatically extends their active channels via the WHAPI Partner API.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Daily Deduction</h3>
            <p className="text-sm text-muted-foreground">
              Each active channel consumes 1 day from the user's balance per 24-hour period.
              When the balance reaches 0, all channels are automatically paused.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
