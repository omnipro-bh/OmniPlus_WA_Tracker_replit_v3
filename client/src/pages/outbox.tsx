import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Inbox, ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { Job, Message } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

interface JobWithMessages extends Job {
  messages: Message[];
}

export default function Outbox() {
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  const { data: jobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 3000, // Auto-refresh every 3 seconds
  });

  const { data: jobDetails } = useQuery<JobWithMessages>({
    queryKey: ["/api/jobs", selectedJob],
    queryFn: async () => {
      const response = await fetch(`/api/jobs/${selectedJob}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch job details");
      return response.json();
    },
    enabled: selectedJob !== null,
    refetchInterval: selectedJob !== null ? 3000 : false, // Auto-refresh every 3 seconds when dialog is open
  });

  const messages = jobDetails?.messages || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Outbox</h1>
        <p className="text-muted-foreground mt-1">
          Track and monitor your sent messages and jobs
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-1/4" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">No messages sent yet</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Your sent messages and bulk jobs will appear here
            </p>
            <Link href="/send">
              <Button className="mt-4">Send First Message</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <Card
              key={job.id}
              className="hover-elevate cursor-pointer transition-all"
              onClick={() => setSelectedJob(job.id)}
              data-testid={`job-${job.id}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg font-mono">Job #{job.id}</CardTitle>
                      <StatusBadge status={job.status} />
                      <span className="text-sm text-muted-foreground capitalize">
                        {job.type.toLowerCase()}
                      </span>
                    </div>
                    <CardDescription>
                      {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold">{job.total}</div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-warning">{job.queued}</div>
                    <div className="text-xs text-muted-foreground">Queued</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-warning">{job.pending}</div>
                    <div className="text-xs text-muted-foreground">Pending</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-info">{job.sent}</div>
                    <div className="text-xs text-muted-foreground">Sent</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-info">{job.delivered}</div>
                    <div className="text-xs text-muted-foreground">Delivered</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-success">{job.read}</div>
                    <div className="text-xs text-muted-foreground">Read</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-error">{job.failed}</div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-success">{job.replied}</div>
                    <div className="text-xs text-muted-foreground">Replied</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Job Details Dialog */}
      <Dialog open={selectedJob !== null} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedJob(null)}
                data-testid="button-back-to-outbox"
              >
                ← Back to Outbox
              </Button>
            </div>
            <DialogTitle className="text-2xl font-bold">Job Details</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Job ID: {jobDetails?.id}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-6 pt-4">
            {jobDetails && (
              <>
                {/* Job Statistics */}
                <div className="bg-muted/50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-4">Job Statistics</h3>
                  <div className="grid grid-cols-7 gap-4 text-center">
                    <div>
                      <div className="text-3xl font-bold">{jobDetails.queued}</div>
                      <div className="text-xs text-muted-foreground mt-1">Queued</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-warning">{jobDetails.pending}</div>
                      <div className="text-xs text-muted-foreground mt-1">Pending</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-info">{jobDetails.sent}</div>
                      <div className="text-xs text-muted-foreground mt-1">Sent</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-success">{jobDetails.delivered}</div>
                      <div className="text-xs text-muted-foreground mt-1">Delivered</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-success">{jobDetails.read}</div>
                      <div className="text-xs text-muted-foreground mt-1">Read</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-error">{jobDetails.failed}</div>
                      <div className="text-xs text-muted-foreground mt-1">Failed</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-purple-500">{jobDetails.replied}</div>
                      <div className="text-xs text-muted-foreground mt-1">Replied</div>
                    </div>
                  </div>
                </div>

                {/* Messages Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Messages</h3>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Message ID</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">To</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Body</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Buttons</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Last Reply</th>
                        </tr>
                      </thead>
                      <tbody>
                        {messages.map((message) => {
                          const buttons = Array.isArray(message.buttons) ? message.buttons : [];
                          return (
                            <tr 
                              key={message.id} 
                              className="border-b hover-elevate cursor-pointer"
                              onClick={() => setSelectedMessage(message)}
                              data-testid={`message-row-${message.id}`}
                            >
                              <td className="px-4 py-3 font-mono text-sm">{message.id}</td>
                              <td className="px-4 py-3 font-mono text-sm text-success">{message.to}</td>
                              <td className="px-4 py-3 text-sm max-w-xs truncate">{message.body}</td>
                              <td className="px-4 py-3 text-sm">
                                <div className="flex gap-1 flex-wrap max-w-xs">
                                  {buttons.map((btn: any, idx: number) => (
                                    <span key={idx} className="text-xs text-muted-foreground">
                                      {btn.title || btn.text}{idx < buttons.length - 1 ? ', ' : ''}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge status={message.status} />
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {message.lastReply ? (
                                  <div className="flex flex-col gap-1">
                                    <span className="text-foreground">{message.lastReply}</span>
                                    {message.lastReplyType && (
                                      <span className="text-xs text-muted-foreground capitalize">
                                        {message.lastReplyType === 'buttons_reply' ? '📱 Button Reply' :
                                         message.lastReplyType === 'list_reply' ? '📋 List Reply' :
                                         message.lastReplyType === 'text' ? '💬 Text' : ''}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Message Detail Drawer */}
      <Drawer open={selectedMessage !== null} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Message Details</DrawerTitle>
            <DrawerDescription>
              Message payload and delivery information
            </DrawerDescription>
          </DrawerHeader>
          {selectedMessage && (
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Message Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Recipient</div>
                  <div className="font-mono mt-1">{selectedMessage.to}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Status</div>
                  <div className="mt-1">
                    <StatusBadge status={selectedMessage.status} />
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Provider Message ID</div>
                  <div className="font-mono text-sm mt-1">
                    {selectedMessage.providerMessageId || <span className="text-muted-foreground">Not available</span>}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Last Reply</div>
                  <div className="text-sm mt-1">
                    {selectedMessage.lastReply ? (
                      <div className="space-y-1">
                        <div className="font-medium">{selectedMessage.lastReply}</div>
                        {selectedMessage.lastReplyType && (
                          <div className="text-xs text-muted-foreground capitalize">
                            Type: {selectedMessage.lastReplyType === 'buttons_reply' ? 'Button Reply' :
                                   selectedMessage.lastReplyType === 'list_reply' ? 'List Reply' :
                                   selectedMessage.lastReplyType === 'text' ? 'Text Message' : 
                                   selectedMessage.lastReplyType}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">No reply</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Sent At</div>
                  <div className="text-sm mt-1">
                    {selectedMessage.sentAt ? new Date(selectedMessage.sentAt).toLocaleString() : <span className="text-muted-foreground">-</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Delivered At</div>
                  <div className="text-sm mt-1">
                    {selectedMessage.deliveredAt ? new Date(selectedMessage.deliveredAt).toLocaleString() : <span className="text-muted-foreground">-</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Read At</div>
                  <div className="text-sm mt-1">
                    {selectedMessage.readAt ? new Date(selectedMessage.readAt).toLocaleString() : <span className="text-muted-foreground">-</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Replied At</div>
                  <div className="text-sm mt-1">
                    {selectedMessage.repliedAt ? new Date(selectedMessage.repliedAt).toLocaleString() : <span className="text-muted-foreground">-</span>}
                  </div>
                </div>
              </div>

              {/* Error if any */}
              {selectedMessage.error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4">
                  <div className="text-xs font-semibold text-destructive uppercase mb-2">Error</div>
                  <div className="text-sm text-destructive">{selectedMessage.error}</div>
                </div>
              )}

              {/* Message Payload */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Message Payload</div>
                <pre className="rounded-md bg-muted p-4 text-xs overflow-x-auto">
                  {JSON.stringify({
                    to: selectedMessage.to,
                    header: selectedMessage.header ? { text: selectedMessage.header } : undefined,
                    body: { text: selectedMessage.body },
                    footer: selectedMessage.footer ? { text: selectedMessage.footer } : undefined,
                    action: {
                      buttons: selectedMessage.buttons || []
                    },
                    type: "button"
                  }, null, 2)}
                </pre>
              </div>

              {/* Reply Payload */}
              {selectedMessage.lastReplyPayload && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Reply Payload</div>
                  <pre className="rounded-md bg-muted p-4 text-xs overflow-x-auto">
                    {JSON.stringify(selectedMessage.lastReplyPayload, null, 2)}
                  </pre>
                </div>
              )}

              {/* Creation/Update Timestamps */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t text-sm">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Created</div>
                  <div className="mt-1">{new Date(selectedMessage.createdAt).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Updated</div>
                  <div className="mt-1">{new Date(selectedMessage.updatedAt).toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
