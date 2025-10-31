import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Upload, Send, Trash2, Loader2 } from "lucide-react";
import type { Channel } from "@shared/schema";
import { Link } from "wouter";

type BulkRow = {
  name: string;
  phone: string;
  email?: string;
  headerMsg?: string;
  bodyText: string;
  footerText?: string;
  button1?: string;
  button2?: string;
  button3?: string;
};

export default function Bulk() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [channelId, setChannelId] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
    enabled: !!user,
  });

  const sendBulkMutation = useMutation({
    mutationFn: async (data: { channelId: number; rows: BulkRow[] }) => {
      return await apiRequest("POST", "/api/messages/bulk", data);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      toast({
        title: "Bulk sending started!",
        description: `${rows.length} messages are being sent one by one. Check the Outbox page to track progress.`,
      });
      setRows([]);
      setChannelId("");
    },
    onError: (error: any) => {
      console.error("Bulk send error caught:", error);
      const errorMessage = error?.error || error?.message || "Could not create bulk job";
      console.error("Displaying error:", errorMessage);
      
      toast({
        title: "Failed to send bulk messages",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").filter((line) => line.trim());
      const headers = lines[0].toLowerCase().split(",").map(h => h.trim());

      const nameIndex = headers.findIndex((h) => h.includes("name"));
      const phoneIndex = headers.findIndex((h) => h.includes("phone"));
      const emailIndex = headers.findIndex((h) => h.includes("email"));
      const headerIndex = headers.findIndex((h) => h.includes("header"));
      const bodyIndex = headers.findIndex((h) => h.includes("body"));
      const footerIndex = headers.findIndex((h) => h.includes("footer"));
      const button1Index = headers.findIndex((h) => h.includes("button1"));
      const button2Index = headers.findIndex((h) => h.includes("button2"));
      const button3Index = headers.findIndex((h) => h.includes("button3"));

      const parsedRows: BulkRow[] = lines.slice(1).map((line) => {
        const values = line.split(",").map(v => v.trim());
        return {
          name: values[nameIndex] || "",
          phone: values[phoneIndex] || "",
          email: values[emailIndex] || "",
          headerMsg: values[headerIndex] || "",
          bodyText: values[bodyIndex] || "",
          footerText: values[footerIndex] || "",
          button1: values[button1Index] || "",
          button2: values[button2Index] || "",
          button3: values[button3Index] || "",
        };
      });

      setRows(parsedRows);
      toast({
        title: "CSV loaded",
        description: `${parsedRows.length} rows imported successfully.`,
      });
    };
    reader.readAsText(file);
  };

  const activeChannels = channels.filter((c) => c.status === "ACTIVE");
  const canSend = user?.status === "active" && activeChannels.length > 0 && rows.length > 0;

  const dailyLimit = user?.currentPlan?.dailyMessagesLimit || 0;
  const messagesSentToday = user?.messagesSentToday || 0;
  const remainingToday = Math.max(0, dailyLimit - messagesSentToday);
  const limitProgress = dailyLimit > 0 ? (messagesSentToday / dailyLimit) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Daily Sending Limit */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Sending Limit</CardTitle>
          <CardDescription>
            {messagesSentToday} / {dailyLimit} messages sent today
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={limitProgress} className="h-2" />
          <p className="text-sm text-muted-foreground">
            {remainingToday} messages remaining today
          </p>
        </CardContent>
      </Card>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Bulk Message Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="channel">Select Channel</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger id="channel" data-testid="select-channel">
                <SelectValue placeholder="Choose channel" />
              </SelectTrigger>
              <SelectContent>
                {activeChannels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id.toString()}>
                    {channel.label} ({channel.phone})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Button variant="outline" className="w-full" asChild>
                <label htmlFor="csv-upload" className="cursor-pointer" data-testid="button-upload">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload CSV
                  <input
                    id="csv-upload"
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </Button>
            </div>
            <Button
              onClick={() => sendBulkMutation.mutate({ channelId: parseInt(channelId), rows })}
              disabled={!canSend || !channelId || sendBulkMutation.isPending}
              data-testid="button-send-bulk"
            >
              {sendBulkMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Send className="h-4 w-4 mr-2" />
              Send {rows.length} Messages
            </Button>
            <Button
              variant="outline"
              onClick={() => setRows([])}
              disabled={rows.length === 0}
              data-testid="button-clear"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>

          {!canSend && rows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {user?.status !== "active" ? (
                <>
                  Your account is {user?.status}. Please{" "}
                  <Link href="/pricing">
                    <a className="text-primary hover:underline">renew your subscription</a>
                  </Link>
                </>
              ) : activeChannels.length === 0 ? (
                <>
                  No active channels. Please{" "}
                  <Link href="/channels">
                    <a className="text-primary hover:underline">add a channel</a>
                  </Link>
                </>
              ) : null}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Preview Table */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Message Preview</CardTitle>
            <CardDescription>{rows.length} messages ready to send</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-card border-b">
                    <tr className="text-left">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Name
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Phone
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Body
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Buttons
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index} className="border-b hover-elevate" data-testid={`row-${index}`}>
                        <td className="px-4 py-3 text-sm">{row.name}</td>
                        <td className="px-4 py-3 text-sm font-mono">{row.phone}</td>
                        <td className="px-4 py-3 text-sm">
                          {row.headerMsg && <div className="text-xs text-muted-foreground">{row.headerMsg}</div>}
                          <div className="truncate max-w-md">{row.bodyText}</div>
                          {row.footerText && <div className="text-xs text-muted-foreground">{row.footerText}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-1">
                            {row.button1 && <span className="text-xs bg-primary/10 px-2 py-1 rounded">{row.button1}</span>}
                            {row.button2 && <span className="text-xs bg-primary/10 px-2 py-1 rounded">{row.button2}</span>}
                            {row.button3 && <span className="text-xs bg-primary/10 px-2 py-1 rounded">{row.button3}</span>}
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
      )}

      {rows.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">No messages loaded</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Upload a CSV file with columns: name, phone, email, header_msg, body_text, footer_text, button1, button2, button3
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
