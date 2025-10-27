import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { GitBranch, Plus, Pencil, Trash2, Copy, ArrowLeft } from "lucide-react";
import type { Workflow } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import WorkflowBuilder from "@/components/WorkflowBuilder";
import { Node, Edge } from "@xyflow/react";

export default function Workflows() {
  const { toast } = useToast();
  const [webhookToken, setWebhookToken] = useState("");
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");

  const { data: workflows = [] } = useQuery<Workflow[]>({
    queryKey: ["/api/workflows"],
  });

  const createWorkflow = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("/api/workflows", "POST", {
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
    mutationFn: async ({ id, nodes, edges }: { id: number; nodes: Node[]; edges: Edge[] }) => {
      return apiRequest(`/api/workflows/${id}`, "PUT", {
        definitionJson: { nodes, edges },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save workflow", variant: "destructive" });
    },
  });

  const deleteWorkflow = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/workflows/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete workflow", variant: "destructive" });
    },
  });

  const webhookUrl = `${window.location.origin}/webhooks/whapi`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const handleOpenBuilder = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setShowBuilder(true);
  };

  const handleSaveWorkflow = (nodes: Node[], edges: Edge[]) => {
    if (selectedWorkflow) {
      updateWorkflow.mutate({ id: selectedWorkflow.id, nodes, edges });
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
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowBuilder(false)}
              data-testid="button-back-to-list"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-semibold">{selectedWorkflow.name}</h1>
              <p className="text-muted-foreground mt-1">
                Visual chatbot builder
              </p>
            </div>
          </div>
        </div>
        <WorkflowBuilder
          initialNodes={definition.nodes || []}
          initialEdges={definition.edges || []}
          onSave={handleSaveWorkflow}
          workflowName={selectedWorkflow.name}
        />
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

      <Card>
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
          <CardDescription>
            Configure your WHAPI integration to receive incoming messages
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Incoming Webhook URL</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-sm" />
              <Button
                variant="outline"
                onClick={() => copyToClipboard(webhookUrl)}
                data-testid="button-copy-webhook"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this URL to your WHAPI channel webhook settings to receive messages
            </p>
          </div>
        </CardContent>
      </Card>

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
                  <CardContent>
                    <div className="text-xs text-muted-foreground">
                      Last updated: {new Date(workflow.updatedAt).toLocaleDateString()}
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
