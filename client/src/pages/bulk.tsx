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
import Papa from "papaparse";

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
  button1_id?: string;
  button2_id?: string;
  button3_id?: string;
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

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => {
        // Normalize headers: lowercase, trim, remove all whitespace/underscores/dashes
        return header.trim().toLowerCase().replace(/[\s_-]+/g, '');
      },
      complete: (results) => {
        const data = results.data as any[];
        
        // Check for parse errors
        if (results.errors && results.errors.length > 0) {
          const errorMessages = results.errors.map(e => `Row ${e.row}: ${e.message}`).join('; ');
          toast({
            title: "CSV parse errors",
            description: `${results.errors.length} errors found: ${errorMessages}`,
            variant: "destructive",
          });
          return;
        }

        // Validate that we have data
        if (!data || data.length === 0) {
          toast({
            title: "Empty CSV",
            description: "The CSV file is empty or has no valid rows.",
            variant: "destructive",
          });
          return;
        }

        // Get available headers from Papa meta or first row
        const availableHeaders = results.meta?.fields || Object.keys(data[0] || {});
        
        // Helper to find header by substring match
        const findHeader = (row: any, possibleNames: string[]): string => {
          for (const name of possibleNames) {
            const value = row[name];
            if (value !== undefined && value !== null && value !== "") {
              return value;
            }
          }
          return "";
        };

        // Detect which headers map to which fields
        const phoneHeaders = availableHeaders.filter((h: string) => h.includes('phone'));
        const bodyHeaders = availableHeaders.filter((h: string) => 
          h.includes('body') || h.includes('text') || h.includes('message')
        );
        const nameHeaders = availableHeaders.filter((h: string) => h.includes('name'));
        const emailHeaders = availableHeaders.filter((h: string) => h.includes('email'));
        const headerHeaders = availableHeaders.filter((h: string) => 
          (h.includes('header') && !h.includes('footer'))
        );
        const footerHeaders = availableHeaders.filter((h: string) => h.includes('footer'));
        const button1Headers = availableHeaders.filter((h: string) => h.match(/button.*1/) && !h.includes('id'));
        const button2Headers = availableHeaders.filter((h: string) => h.match(/button.*2/) && !h.includes('id'));
        const button3Headers = availableHeaders.filter((h: string) => h.match(/button.*3/) && !h.includes('id'));
        const button1IdHeaders = availableHeaders.filter((h: string) => h.match(/button.*1.*id/));
        const button2IdHeaders = availableHeaders.filter((h: string) => h.match(/button.*2.*id/));
        const button3IdHeaders = availableHeaders.filter((h: string) => h.match(/button.*3.*id/));
        
        if (phoneHeaders.length === 0 || bodyHeaders.length === 0) {
          toast({
            title: "Missing required columns",
            description: `CSV must include headers containing 'phone' and 'body'/'text'/'message'. Found: ${availableHeaders.join(", ")}`,
            variant: "destructive",
          });
          return;
        }

        // Map CSV columns to BulkRow format using detected headers
        const parsedRows: BulkRow[] = data.map((row) => ({
          name: findHeader(row, nameHeaders.length > 0 ? nameHeaders : ['name']),
          phone: findHeader(row, phoneHeaders),
          email: findHeader(row, emailHeaders.length > 0 ? emailHeaders : ['email']),
          headerMsg: findHeader(row, headerHeaders.length > 0 ? headerHeaders : ['header']),
          bodyText: findHeader(row, bodyHeaders),
          footerText: findHeader(row, footerHeaders.length > 0 ? footerHeaders : ['footer']),
          button1: findHeader(row, button1Headers.length > 0 ? button1Headers : ['button1']),
          button2: findHeader(row, button2Headers.length > 0 ? button2Headers : ['button2']),
          button3: findHeader(row, button3Headers.length > 0 ? button3Headers : ['button3']),
          button1_id: findHeader(row, button1IdHeaders.length > 0 ? button1IdHeaders : ['button1id']),
          button2_id: findHeader(row, button2IdHeaders.length > 0 ? button2IdHeaders : ['button2id']),
          button3_id: findHeader(row, button3IdHeaders.length > 0 ? button3IdHeaders : ['button3id']),
        }));

        // Validate required fields
        const invalidRows = parsedRows.filter(row => !row.phone || !row.bodyText);
        if (invalidRows.length > 0) {
          toast({
            title: "Invalid rows detected",
            description: `${invalidRows.length} rows are missing required fields (phone or body text). Please check your CSV and re-upload.`,
            variant: "destructive",
          });
          return;
        }

        setRows(parsedRows);
        toast({
          title: "CSV loaded",
          description: `${parsedRows.length} rows imported successfully.`,
        });
      },
      error: (error) => {
        toast({
          title: "CSV parse error",
          description: error.message || "Failed to parse CSV file",
          variant: "destructive",
        });
      },
    });
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
