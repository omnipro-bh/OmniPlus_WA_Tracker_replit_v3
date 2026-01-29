import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { GitBranch, Plus, Pencil, Trash2, Copy, ArrowLeft, Link as LinkIcon, Tag } from "lucide-react";
import type { Workflow } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import WorkflowBuilder from "@/components/WorkflowBuilder";
import { Node, Edge } from "@xyflow/react";
import { useEffectiveUser } from "@/hooks/use-effective-user";

export default function Workflows() {
  const { toast } = useToast();
  const { user } = useEffectiveUser();
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");

  const { data: workflows = [] } = useQuery<Workflow[]>({
    queryKey: ["/api/workflows"],
  });

  const createWorkflow = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", "/api/workflows", {
        name,
        definitionJson: { nodes: [], edges: [] },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow created successfully" });
      setCreateDialogOpen(false);
      setNewWorkflowName("");
    },
    onError: () => {
      toast({ title: "Failed to create workflow", variant: "destructive" });
    },
  });

  const updateWorkflow = useMutation({
    mutationFn: async ({ id, nodes, edges, entryNodeId }: { id: number; nodes: Node[]; edges: Edge[]; entryNodeId?: string | null }) => {
      const payload = {
        definitionJson: { nodes, edges },
        entryNodeId,
      };
      console.log('[workflows mutation] Sending PUT with payload:', JSON.stringify(payload, null, 2));
      const response = await apiRequest("PUT", `/api/workflows/${id}`, payload);
      const updatedWorkflow = await response.json() as Workflow;
      return updatedWorkflow;
    },
    onSuccess: (updatedWorkflow) => {
      // Update the selectedWorkflow state with the fresh data from the server
      if (selectedWorkflow && updatedWorkflow) {
        setSelectedWorkflow(updatedWorkflow);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow saved successfully" });
    },
    onError: (error: any) => {
      console.error('[workflows updateWorkflow] Error:', error);
      toast({ title: "Failed to save workflow", variant: "destructive" });
    },
  });

  const toggleWorkflowActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/workflows/${id}/toggle-active`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow status updated" });
    },
    onError: () => {
      // Refetch workflows to ensure UI shows correct status
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Failed to update workflow status", variant: "destructive" });
    },
  });

  const deleteWorkflow = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/workflows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete workflow", variant: "destructive" });
    },
  });

  const toggleLabelManagement = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      return apiRequest("PATCH", `/api/workflows/${id}/label-settings`, { labelManagementEnabled: enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Label management setting updated" });
    },
    onError: () => {
      toast({ title: "Failed to update label setting", variant: "destructive" });
    },
  });

  const getWebhookUrl = (workflow: Workflow) => {
    if (!user) return "";
    return `${window.location.origin}/webhooks/whapi/${user.id}/${workflow.webhookToken}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const handleOpenBuilder = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setShowBuilder(true);
  };

  const handleSaveWorkflow = (nodes: Node[], edges: Edge[], entryNodeId?: string | null) => {
    if (selectedWorkflow) {
      console.log('[workflows handleSaveWorkflow] Received entryNodeId:', entryNodeId);
      updateWorkflow.mutate({ id: selectedWorkflow.id, nodes, edges, entryNodeId });
    }
  };

  const handleToggleActive = (isActive: boolean) => {
    if (selectedWorkflow) {
      // Store previous state for rollback on error
      const previousState = selectedWorkflow.isActive;
      
      // Optimistically update local state
      setSelectedWorkflow({ ...selectedWorkflow, isActive });
      
      // Make API call with error handling
      toggleWorkflowActive.mutate(
        { id: selectedWorkflow.id, isActive },
        {
          onError: () => {
            // Rollback on error
            setSelectedWorkflow({ ...selectedWorkflow, isActive: previousState });
          }
        }
      );
    }
  };

  const handleCreateWorkflow = () => {
    if (newWorkflowName.trim()) {
      createWorkflow.mutate(newWorkflowName);
    }
  };

  // If builder is open, show the builder view
  if (showBuilder && selectedWorkflow) {
    const definition = selectedWorkflow.definitionJson as { nodes?: Node[]; edges?: Edge[] } || {};
    const webhookUrl = getWebhookUrl(selectedWorkflow);
    
    return (
      <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 12rem)' }}>
        <div className="flex items-center justify-between flex-shrink-0 gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowBuilder(false)}
              data-testid="button-back-to-list"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold truncate">{selectedWorkflow.name}</h1>
              <p className="text-muted-foreground mt-1 truncate">
                Visual chatbot builder
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg max-w-xs">
              <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <code className="text-sm truncate">{webhookUrl}</code>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(webhookUrl)}
              data-testid="button-copy-webhook"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <WorkflowBuilder
            initialNodes={definition.nodes || []}
            initialEdges={definition.edges || []}
            initialEntryNodeId={selectedWorkflow.entryNodeId || undefined}
            initialWorkflowId={selectedWorkflow.id}
            isActive={selectedWorkflow.isActive}
            onSave={handleSaveWorkflow}
            onToggleActive={handleToggleActive}
            workflowName={selectedWorkflow.name}
          />
        </div>
      </div>
    );
  }

  // Default view: workflow list
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Workflows & Chatbot</h1>
          <p className="text-muted-foreground mt-1">
            Build automated conversation flows and chatbot responses
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-workflow">
              <Plus className="h-4 w-4 mr-2" />
              Create Workflow
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-create-workflow">
            <DialogHeader>
              <DialogTitle>Create New Workflow</DialogTitle>
              <DialogDescription>
                Give your workflow a descriptive name
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="workflow-name">Workflow Name</Label>
                <Input
                  id="workflow-name"
                  placeholder="E.g., Customer Support Bot"
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  data-testid="input-workflow-name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreateWorkflow}
                disabled={!newWorkflowName.trim() || createWorkflow.isPending}
                data-testid="button-submit-create"
              >
                Create Workflow
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> Each workflow has a unique webhook URL. Copy the webhook URL from each workflow card below and configure it in your WhatsApp channel settings.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Your Workflows</h2>
        {workflows.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <GitBranch className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium">No workflows yet</h3>
                <p className="text-sm text-muted-foreground mt-2 mb-4">
                  Create your first workflow to start building automated WhatsApp conversations
                </p>
                <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Workflow
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((workflow) => {
              const definition = workflow.definitionJson as { nodes?: Node[]; edges?: Edge[] } || {};
              const nodeCount = definition.nodes?.length || 0;
              const edgeCount = definition.edges?.length || 0;

              const webhookUrl = getWebhookUrl(workflow);
              
              return (
                <Card key={workflow.id} className="hover-elevate" data-testid={`workflow-card-${workflow.id}`}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <GitBranch className="h-5 w-5 text-primary" />
                      {workflow.name}
                    </CardTitle>
                    <CardDescription>
                      {nodeCount} nodes, {edgeCount} connections
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-muted-foreground">
                      Last updated: {new Date(workflow.updatedAt).toLocaleDateString()}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Webhook URL</Label>
                      <div className="flex gap-1">
                        <Input
                          value={webhookUrl}
                          readOnly
                          className="font-mono text-xs h-8"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => copyToClipboard(webhookUrl)}
                          data-testid={`button-copy-webhook-${workflow.id}`}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <Label className="text-xs cursor-pointer" htmlFor={`label-toggle-${workflow.id}`}>
                          Auto-label chats
                        </Label>
                      </div>
                      <Switch
                        id={`label-toggle-${workflow.id}`}
                        checked={workflow.labelManagementEnabled || false}
                        onCheckedChange={(checked) => toggleLabelManagement.mutate({ id: workflow.id, enabled: checked })}
                        disabled={toggleLabelManagement.isPending}
                        data-testid={`switch-label-management-${workflow.id}`}
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleOpenBuilder(workflow)}
                      data-testid={`button-edit-${workflow.id}`}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this workflow?")) {
                          deleteWorkflow.mutate(workflow.id);
                        }
                      }}
                      data-testid={`button-delete-${workflow.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
