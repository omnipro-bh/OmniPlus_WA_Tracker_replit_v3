import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Database, Eye, Trash2, Download, ChevronDown, ChevronRight, Phone, Calendar, MousePointer } from "lucide-react";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface CapturedClick {
  buttonId: string;
  buttonTitle: string;
  timestamp: string;
  nodeId: string;
}

interface CapturedDataItem {
  id: number;
  sequenceId: number;
  userId: number;
  channelId: number | null;
  phone: string;
  clicksJson: CapturedClick[];
  workflowName: string | null;
  sequenceName: string | null;
  savedAt: string;
}

interface CaptureSequence {
  id: number;
  userId: number;
  workflowId: number;
  sequenceName: string;
  startNodeId: string;
  endNodeId: string;
  createdAt: string;
  capturedData?: CapturedDataItem[];
}

export default function CaptureList() {
  const { toast } = useToast();
  const [expandedSequences, setExpandedSequences] = useState<Set<number>>(new Set());
  const [selectedData, setSelectedData] = useState<CapturedDataItem | null>(null);

  const { data: sequences = [], isLoading } = useQuery<CaptureSequence[]>({
    queryKey: ['/api/capture-sequences'],
  });

  const deleteSequenceMutation = useMutation({
    mutationFn: async (sequenceId: number) => {
      await apiRequest('DELETE', `/api/capture-sequences/${sequenceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/capture-sequences'] });
      toast({
        title: "Sequence deleted",
        description: "The capture sequence and all its data have been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete sequence",
        variant: "destructive",
      });
    },
  });

  const deleteDataMutation = useMutation({
    mutationFn: async (dataId: number) => {
      await apiRequest('DELETE', `/api/captured-data/${dataId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/capture-sequences'] });
      toast({
        title: "Data deleted",
        description: "The captured data has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete data",
        variant: "destructive",
      });
    },
  });

  const toggleExpand = (sequenceId: number) => {
    const newExpanded = new Set(expandedSequences);
    if (newExpanded.has(sequenceId)) {
      newExpanded.delete(sequenceId);
    } else {
      newExpanded.add(sequenceId);
    }
    setExpandedSequences(newExpanded);
  };

  const exportSequenceData = (sequence: CaptureSequence) => {
    if (!sequence.capturedData || sequence.capturedData.length === 0) {
      toast({
        title: "No data to export",
        description: "This sequence has no captured data.",
        variant: "destructive",
      });
      return;
    }

    const csvRows = [
      ['Phone', 'Workflow', 'Sequence', 'Saved At', 'Clicks'].join(','),
    ];

    sequence.capturedData.forEach((data) => {
      const clicksSummary = data.clicksJson
        .map((c) => c.buttonTitle)
        .join(' -> ');
      csvRows.push([
        data.phone,
        data.workflowName || '',
        data.sequenceName || '',
        format(new Date(data.savedAt), 'yyyy-MM-dd HH:mm'),
        `"${clicksSummary}"`,
      ].join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `capture-${sequence.sequenceName}-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Database className="h-6 w-6" />
            Data Capture
          </h1>
          <p className="text-muted-foreground">
            View and manage captured user responses from your workflows
          </p>
        </div>
      </div>

      {sequences.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Capture Sequences</h3>
            <p className="text-muted-foreground">
              Create a workflow with Start/End Capture nodes to collect user responses.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sequences.map((sequence) => (
            <Card key={sequence.id} data-testid={`card-sequence-${sequence.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleExpand(sequence.id)}
                      data-testid={`button-expand-${sequence.id}`}
                    >
                      {expandedSequences.has(sequence.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                    <div>
                      <CardTitle className="text-lg">{sequence.sequenceName}</CardTitle>
                      <CardDescription>
                        Created {format(new Date(sequence.createdAt), 'MMM d, yyyy')}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {sequence.capturedData?.length || 0} responses
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportSequenceData(sequence)}
                      data-testid={`button-export-${sequence.id}`}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteSequenceMutation.mutate(sequence.id)}
                      disabled={deleteSequenceMutation.isPending}
                      data-testid={`button-delete-sequence-${sequence.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expandedSequences.has(sequence.id) && (
                <CardContent>
                  {!sequence.capturedData || sequence.capturedData.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      No responses captured yet
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Phone</TableHead>
                          <TableHead>Workflow</TableHead>
                          <TableHead>Clicks</TableHead>
                          <TableHead>Saved</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sequence.capturedData.map((data) => (
                          <TableRow key={data.id} data-testid={`row-data-${data.id}`}>
                            <TableCell className="font-mono">{data.phone}</TableCell>
                            <TableCell>{data.workflowName || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {data.clicksJson?.length || 0} clicks
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {format(new Date(data.savedAt), 'MMM d, HH:mm')}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setSelectedData(data)}
                                      data-testid={`button-view-${data.id}`}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-lg">
                                    <DialogHeader>
                                      <DialogTitle>Captured Responses</DialogTitle>
                                      <DialogDescription>
                                        <div className="flex items-center gap-2 mt-2">
                                          <Phone className="h-4 w-4" />
                                          {data.phone}
                                        </div>
                                      </DialogDescription>
                                    </DialogHeader>
                                    <ScrollArea className="max-h-96">
                                      <div className="space-y-3">
                                        {data.clicksJson?.map((click, idx) => (
                                          <div
                                            key={idx}
                                            className="p-3 border rounded-lg bg-muted/30"
                                          >
                                            <div className="flex items-center justify-between mb-2">
                                              <Badge variant="secondary">
                                                <MousePointer className="h-3 w-3 mr-1" />
                                                Click {idx + 1}
                                              </Badge>
                                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {format(new Date(click.timestamp), 'HH:mm:ss')}
                                              </span>
                                            </div>
                                            <p className="font-medium">{click.buttonTitle}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                              Button ID: {click.buttonId}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </ScrollArea>
                                  </DialogContent>
                                </Dialog>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteDataMutation.mutate(data.id)}
                                  disabled={deleteDataMutation.isPending}
                                  data-testid={`button-delete-data-${data.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
