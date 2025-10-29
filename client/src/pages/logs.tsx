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
import { Eye, FileText, Loader2 } from "lucide-react";

interface WorkflowLog {
  id: number;
  workflowId: number;
  workflowName: string;
  phone: string;
  messageType: "text" | "button_reply" | "other";
  triggerData: any;
  responsesSent: any[];
  status: "SUCCESS" | "ERROR";
  errorMessage: string | null;
  executedAt: string;
}

export default function Logs() {
  const { data: logs = [], isLoading } = useQuery<WorkflowLog[]>({
    queryKey: ["/api/workflow-logs"],
  });

  const getMessageTypeColor = (type: string) => {
    switch (type) {
      case "text":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "button_reply":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getStatusColor = (status: string) => {
    return status === "SUCCESS"
      ? "bg-green-500/10 text-green-500 border-green-500/20"
      : "bg-red-500/10 text-red-500 border-red-500/20";
  };

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-logs-title">
              Webhook Logs
            </h1>
            <p className="text-muted-foreground">
              View incoming webhook messages and automated responses
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Workflow Executions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No webhook logs yet</p>
                <p className="text-sm">Logs will appear here when your workflows receive messages</p>
              </div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Workflow</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Responses</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(log.executedAt), "MMM dd, HH:mm:ss")}
                        </TableCell>
                        <TableCell className="font-medium">
                          {log.workflowName || `Workflow #${log.workflowId}`}
                        </TableCell>
                        <TableCell className="font-mono">{log.phone}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getMessageTypeColor(log.messageType)}>
                            {log.messageType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusColor(log.status)}>
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {log.responsesSent?.length || 0} sent
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`button-view-log-${log.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl">
                              <DialogHeader>
                                <DialogTitle>Webhook Log Details</DialogTitle>
                              </DialogHeader>
                              <ScrollArea className="max-h-[600px]">
                                <div className="space-y-4 pr-4">
                                  {/* Execution Info */}
                                  <div>
                                    <h3 className="font-semibold mb-2">Execution Info</h3>
                                    <div className="bg-muted/50 rounded-md p-3 space-y-1 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Time:</span>
                                        <span className="font-mono">
                                          {format(new Date(log.executedAt), "PPpp")}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Workflow:</span>
                                        <span>{log.workflowName}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Phone:</span>
                                        <span className="font-mono">{log.phone}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Type:</span>
                                        <Badge variant="outline" className={getMessageTypeColor(log.messageType)}>
                                          {log.messageType}
                                        </Badge>
                                      </div>
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

                                  {/* Incoming Webhook Data */}
                                  <div>
                                    <h3 className="font-semibold mb-2">Incoming Webhook Data</h3>
                                    <ScrollArea className="h-[200px] w-full rounded-md border">
                                      <pre className="p-4 text-xs">
                                        {JSON.stringify(log.triggerData, null, 2)}
                                      </pre>
                                    </ScrollArea>
                                  </div>

                                  {/* Responses Sent */}
                                  {log.responsesSent && log.responsesSent.length > 0 && (
                                    <div>
                                      <h3 className="font-semibold mb-2">
                                        Automated Responses ({log.responsesSent.length})
                                      </h3>
                                      <ScrollArea className="h-[200px] w-full rounded-md border">
                                        <pre className="p-4 text-xs">
                                          {JSON.stringify(log.responsesSent, null, 2)}
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
