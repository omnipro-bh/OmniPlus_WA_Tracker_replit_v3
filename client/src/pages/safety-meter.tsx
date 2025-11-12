import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RefreshCw, AlertTriangle, CheckCircle, TrendingUp, ShieldAlert, MessageSquare, Users, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type SafetyMetrics = {
  channel: string;
  lastUpdateDate: string;
  lifeTime: number;
  riskFactor: number;
  riskFactorChats: number;
  riskFactorContacts: number;
};

type Channel = {
  id: number;
  label: string;
  status: string;
  authStatus: string;
};

export default function SafetyMeter() {
  const { toast } = useToast();
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);

  // Fetch user's channels
  const { data: channels = [], isLoading: channelsLoading } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  // Filter only active and authorized channels
  const availableChannels = channels.filter(
    ch => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED"
  );

  // Auto-select first available channel (using useEffect to avoid render loop)
  useEffect(() => {
    if (!selectedChannelId && availableChannels.length > 0) {
      setSelectedChannelId(availableChannels[0].id);
    }
  }, [selectedChannelId, availableChannels]);

  // Fetch safety metrics for selected channel
  const {
    data: safetyMetrics,
    isLoading: metricsLoading,
    error: metricsError,
  } = useQuery<SafetyMetrics>({
    queryKey: ["/api/channels", selectedChannelId, "safety-meter"],
    enabled: !!selectedChannelId,
    retry: false,
  });

  // Refresh mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChannelId) throw new Error("No channel selected");
      return await apiRequest("POST", `/api/channels/${selectedChannelId}/safety-meter/refresh`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels", selectedChannelId, "safety-meter"] });
      toast({
        title: "Metrics refreshed",
        description: "Safety metrics have been recalculated successfully.",
      });
    },
    onError: (error: any) => {
      const message = error.message || error.error || "Failed to refresh metrics";
      toast({
        title: "Refresh failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const getMetricColor = (value: number): string => {
    if (value === 3) return "text-green-600 dark:text-green-400";
    if (value === 2) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getMetricBgColor = (value: number): string => {
    if (value === 3) return "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800";
    if (value === 2) return "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800";
    return "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800";
  };

  const getMetricLabel = (value: number): string => {
    if (value === 3) return "Good Indicator";
    if (value === 2) return "Needs Attention";
    return "Use Caution";
  };

  const getMetricIcon = (value: number) => {
    if (value === 3) return <CheckCircle className="w-8 h-8" />;
    if (value === 2) return <AlertTriangle className="w-8 h-8" />;
    return <ShieldAlert className="w-8 h-8" />;
  };

  const renderStars = (value: number) => {
    return (
      <div className="flex gap-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full ${
              i < value ? "bg-current" : "bg-muted"
            }`}
            data-testid={`star-${i}`}
          />
        ))}
      </div>
    );
  };

  if (channelsLoading) {
    return (
      <div className="p-6">
        <div className="text-muted-foreground">Loading channels...</div>
      </div>
    );
  }

  if (availableChannels.length === 0) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Safety Meter</h1>
            <p className="text-muted-foreground mt-1">
              Monitor your WhatsApp channel health and risk metrics
            </p>
          </div>
        </div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No active channels found. Please create and authorize a channel first to view safety metrics.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const error = metricsError as any;
  const isAccessDenied = error?.error === "Safety Meter feature not available";

  return (
    <div className="p-6 space-y-6" data-testid="page-safety-meter">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Safety Meter</h1>
          <p className="text-muted-foreground mt-1">
            Monitor your WhatsApp channel health and risk metrics
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Channel Selector */}
          <Select
            value={selectedChannelId?.toString()}
            onValueChange={(value) => setSelectedChannelId(parseInt(value))}
            data-testid="select-channel"
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select a channel" />
            </SelectTrigger>
            <SelectContent>
              {availableChannels.map((channel) => (
                <SelectItem key={channel.id} value={channel.id.toString()} data-testid={`option-channel-${channel.id}`}>
                  {channel.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh Button */}
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={!selectedChannelId || refreshMutation.isPending || isAccessDenied}
            size="default"
            variant="outline"
            data-testid="button-refresh-metrics"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Access Denied Alert */}
      {isAccessDenied && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error?.message || "This feature is not included in your current plan. Please upgrade to access Safety Meter."}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {metricsLoading && !isAccessDenied && (
        <div className="text-center py-12">
          <div className="text-muted-foreground">Loading safety metrics...</div>
        </div>
      )}

      {/* Error State (other than access denied) */}
      {error && !isAccessDenied && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error?.message || "Failed to load safety metrics. Please try again."}
          </AlertDescription>
        </Alert>
      )}

      {/* Metrics Display */}
      {safetyMetrics && !isAccessDenied && (
        <>
          {/* Last Updated Info */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Last updated: {safetyMetrics.lastUpdateDate}</span>
            </div>
            <div className="text-xs">
              Metrics can be refreshed once per day
            </div>
          </div>

          {/* Overall Rating Card */}
          <Card className={`${getMetricBgColor(safetyMetrics.riskFactor)}`} data-testid="card-overall-rating">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-xl">Overall Rating</CardTitle>
                  <CardDescription className="text-sm">
                    Combined risk assessment for your channel
                  </CardDescription>
                </div>
                <div className={getMetricColor(safetyMetrics.riskFactor)}>
                  {getMetricIcon(safetyMetrics.riskFactor)}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className={`text-2xl font-bold ${getMetricColor(safetyMetrics.riskFactor)}`}>
                  {getMetricLabel(safetyMetrics.riskFactor)}
                </div>
                <div className={getMetricColor(safetyMetrics.riskFactor)}>
                  {renderStars(safetyMetrics.riskFactor)}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Individual Metrics Grid */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Lifetime of Phone Number */}
            <Card className={getMetricBgColor(safetyMetrics.lifeTime)} data-testid="card-lifetime">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={getMetricColor(safetyMetrics.lifeTime)}>
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">Lifetime of Phone Number</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className={`text-lg font-semibold ${getMetricColor(safetyMetrics.lifeTime)}`}>
                    {getMetricLabel(safetyMetrics.lifeTime)}
                  </div>
                  <div className={getMetricColor(safetyMetrics.lifeTime)}>
                    {renderStars(safetyMetrics.lifeTime)}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Older numbers can be more active with less risk. Recently registered numbers are monitored more closely.
                </p>
              </CardContent>
            </Card>

            {/* Coverage of Address Book */}
            <Card className={getMetricBgColor(safetyMetrics.riskFactorContacts)} data-testid="card-contacts">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={getMetricColor(safetyMetrics.riskFactorContacts)}>
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">Coverage of Address Book</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className={`text-lg font-semibold ${getMetricColor(safetyMetrics.riskFactorContacts)}`}>
                    {getMetricLabel(safetyMetrics.riskFactorContacts)}
                  </div>
                  <div className={getMetricColor(safetyMetrics.riskFactorContacts)}>
                    {renderStars(safetyMetrics.riskFactorContacts)}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  How many recipients have you in their contacts. Encourage clients to add you to their address book.
                </p>
              </CardContent>
            </Card>

            {/* Response Rate */}
            <Card className={getMetricBgColor(safetyMetrics.riskFactorChats)} data-testid="card-response-rate">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={getMetricColor(safetyMetrics.riskFactorChats)}>
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">Response Rate</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className={`text-lg font-semibold ${getMetricColor(safetyMetrics.riskFactorChats)}`}>
                    {getMetricLabel(safetyMetrics.riskFactorChats)}
                  </div>
                  <div className={getMetricColor(safetyMetrics.riskFactorChats)}>
                    {renderStars(safetyMetrics.riskFactorChats)}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Higher response rate indicates healthy engagement. Low response may signal spam-like activity.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Info Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About Safety Meter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                The Safety Meter helps you monitor the health and risk level of your WhatsApp channel. 
                Each metric is scored on a scale of 1-3:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><span className="text-green-600 dark:text-green-400 font-medium">Good Indicator (3)</span> - Your channel is in excellent health</li>
                <li><span className="text-amber-600 dark:text-amber-400 font-medium">Needs Attention (2)</span> - Consider improving this metric</li>
                <li><span className="text-red-600 dark:text-red-400 font-medium">Use Caution (1)</span> - This metric needs immediate attention</li>
              </ul>
              <p className="text-xs mt-4">
                <strong>Note:</strong> Metrics can only be refreshed once per 24 hours. Use the Refresh button to recalculate with the latest data.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
