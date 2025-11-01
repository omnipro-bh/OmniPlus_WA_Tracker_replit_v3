import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, FileDown, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Types for log entries
interface BulkLog {
  id: number;
  timestamp: string;
  level: "info" | "error" | "warn" | "success";
  category: "send" | "webhook" | "status" | "reply";
  message: string;
  jobId?: number;
  messageId?: string;
  providerMessageId?: string;
  details?: any;
}

export default function BulkLogs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Fetch logs from backend
  const { data: logs = [], isLoading, refetch } = useQuery<BulkLog[]>({
    queryKey: ["/api/bulk-logs"],
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  // Filter logs based on search and filters
  const filteredLogs = logs.filter((log) => {
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.providerMessageId?.includes(searchTerm) ||
      log.messageId?.toString().includes(searchTerm) ||
      log.jobId?.toString().includes(searchTerm);
    
    const matchesLevel = levelFilter === "all" || log.level === levelFilter;
    const matchesCategory = categoryFilter === "all" || log.category === categoryFilter;

    return matchesSearch && matchesLevel && matchesCategory;
  });

  const getStatusBadge = (level: string) => {
    const variants: Record<string, "default" | "destructive" | "secondary"> = {
      info: "secondary",
      error: "destructive",
      warn: "default",
      success: "default", // Will be styled with custom color
    };
    return variants[level] || "secondary";
  };

  const getStatusColor = (level: string) => {
    if (level === "success") return "bg-green-500 text-white hover:bg-green-600";
    return "";
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      send: "text-blue-500",
      webhook: "text-purple-500",
      status: "text-green-500",
      reply: "text-amber-500",
    };
    return colors[category] || "text-gray-500";
  };

  const exportLogs = () => {
    const csvContent = [
      ["Timestamp", "Level", "Category", "Message", "Job ID", "Message ID", "Provider ID", "Details"].join(","),
      ...filteredLogs.map((log) =>
        [
          log.timestamp,
          log.level,
          log.category,
          `"${log.message.replace(/"/g, '""')}"`,
          log.jobId || "",
          log.messageId || "",
          log.providerMessageId || "",
          `"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulk-logs-${new Date().toISOString()}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Bulk Message Logs</h1>
          <p className="text-muted-foreground">
            Real-time logs for bulk message sending, webhook events, and status updates
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Activity Logs</CardTitle>
                <CardDescription>
                  Track message sending, deliveries, reads, and replies
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  data-testid="button-refresh-logs"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportLogs}
                  data-testid="button-export-logs"
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="mb-6 flex gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search logs (message, job ID, provider ID)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-logs"
                  />
                </div>
              </div>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-level-filter">
                  <SelectValue placeholder="All Levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-category-filter">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="send">Send</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="reply">Reply</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Log Entries */}
            <ScrollArea className="h-[600px] rounded-lg border">
              <div className="p-4 space-y-2">
                {isLoading && (
                  <div className="text-center text-muted-foreground py-8">
                    Loading logs...
                  </div>
                )}
                
                {!isLoading && filteredLogs.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No logs found matching your criteria
                  </div>
                )}

                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex gap-3 p-3 rounded-lg border hover-elevate"
                    data-testid={`log-entry-${log.id}`}
                  >
                    <div className="flex-shrink-0 font-mono text-xs text-muted-foreground w-32">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                    <div className="flex-shrink-0">
                      <Badge 
                        variant={getStatusBadge(log.level)} 
                        className={`min-w-16 justify-center ${getStatusColor(log.level)}`}
                      >
                        {log.level}
                      </Badge>
                    </div>
                    <div className="flex-shrink-0">
                      <Badge variant="outline" className={`min-w-20 justify-center ${getCategoryColor(log.category)}`}>
                        {log.category}
                      </Badge>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{log.message}</div>
                      {(log.jobId || log.messageId || log.providerMessageId) && (
                        <div className="mt-1 flex gap-3 text-xs text-muted-foreground font-mono">
                          {log.jobId && <span>Job: {log.jobId}</span>}
                          {log.messageId && <span>Msg: {log.messageId}</span>}
                          {log.providerMessageId && (
                            <span>Provider: {log.providerMessageId.substring(0, 16)}...</span>
                          )}
                        </div>
                      )}
                      {log.details && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer text-primary hover:underline">
                            Show details
                          </summary>
                          <pre className="mt-2 p-2 rounded bg-muted overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
