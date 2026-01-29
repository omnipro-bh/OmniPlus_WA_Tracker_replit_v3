import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Eye, Tag, Loader2, RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface LabelLog {
  id: number;
  userId: number;
  channelId: number | null;
  operation: "sync" | "create" | "assign" | "remove";
  labelType: string | null;
  labelId: string | null;
  labelName: string | null;
  chatId: string | null;
  status: "success" | "error";
  requestPayload: any;
  responseData: any;
  errorMessage: string | null;
  createdAt: string;
}

export default function LabelLogs() {
  const { data: logs = [], isLoading, refetch, isFetching } = useQuery<LabelLog[]>({
    queryKey: ["/api/label-logs"],
  });

  const getOperationColor = (operation: string) => {
    switch (operation) {
      case "sync":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "create":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "assign":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "remove":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getStatusColor = (status: string) => {
    return status === "success"
      ? "bg-green-500/10 text-green-500 border-green-500/20"
      : "bg-red-500/10 text-red-500 border-red-500/20";
  };

  const getLabelTypeColor = (labelType: string | null) => {
    switch (labelType) {
      case "chatbot":
        return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
      case "inquiry":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-label-logs-title">
            Label Logs
          </h1>
          <p className="text-muted-foreground">
            Track label sync, creation, and assignment operations
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={handleRefresh}
          disabled={isFetching}
          data-testid="button-refresh-label-logs"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Label Operations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No label logs yet</p>
              <p className="text-sm">Logs will appear here when label operations are performed</p>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Label Type</TableHead>
                    <TableHead>Label ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} data-testid={`row-label-log-${log.id}`}>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(log.createdAt), "MMM dd, HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getOperationColor(log.operation)}>
                          {log.operation}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {log.labelType ? (
                          <Badge variant="outline" className={getLabelTypeColor(log.labelType)}>
                            {log.labelType}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono">
                        {log.labelId || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(log.status)}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-view-label-log-${log.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>Label Log Details</DialogTitle>
                            </DialogHeader>
                            <ScrollArea className="max-h-[600px]">
                              <div className="space-y-4 pr-4">
                                <div>
                                  <h3 className="font-semibold mb-2">Operation Info</h3>
                                  <div className="bg-muted/50 rounded-md p-3 space-y-1 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Time:</span>
                                      <span className="font-mono">
                                        {format(new Date(log.createdAt), "PPpp")}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Operation:</span>
                                      <Badge variant="outline" className={getOperationColor(log.operation)}>
                                        {log.operation}
                                      </Badge>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Label Type:</span>
                                      {log.labelType ? (
                                        <Badge variant="outline" className={getLabelTypeColor(log.labelType)}>
                                          {log.labelType}
                                        </Badge>
                                      ) : (
                                        <span>-</span>
                                      )}
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Label ID:</span>
                                      <span className="font-mono">{log.labelId || "-"}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Label Name:</span>
                                      <span>{log.labelName || "-"}</span>
                                    </div>
                                    {log.chatId && (
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Chat ID:</span>
                                        <span className="font-mono text-xs">{log.chatId}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Status:</span>
                                      <Badge variant="outline" className={getStatusColor(log.status)}>
                                        {log.status}
                                      </Badge>
                                    </div>
                                    {log.errorMessage && (
                                      <div className="flex flex-col gap-1 pt-2 border-t">
                                        <span className="text-muted-foreground">Error:</span>
                                        <span className="text-red-500 text-xs">{log.errorMessage}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {log.requestPayload && Object.keys(log.requestPayload).length > 0 && (
                                  <div>
                                    <h3 className="font-semibold mb-2">Request Payload</h3>
                                    <ScrollArea className="h-[150px] w-full rounded-md border">
                                      <pre className="p-4 text-xs">
                                        {JSON.stringify(log.requestPayload, null, 2)}
                                      </pre>
                                    </ScrollArea>
                                  </div>
                                )}

                                {log.responseData && Object.keys(log.responseData).length > 0 && (
                                  <div>
                                    <h3 className="font-semibold mb-2">Response Data</h3>
                                    <ScrollArea className="h-[150px] w-full rounded-md border">
                                      <pre className="p-4 text-xs">
                                        {JSON.stringify(log.responseData, null, 2)}
                                      </pre>
                                    </ScrollArea>
                                  </div>
                                )}
                              </div>
                            </ScrollArea>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
