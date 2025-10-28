import { useCallback, useState, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
  Node,
  Edge,
  Connection,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NodeConfigPanel } from '@/components/WorkflowNodeConfig';
import {
  MessageCircle,
  Image as ImageIcon,
  List,
  Phone,
  Link,
  Copy,
  Grid3x3,
  Video,
  Zap,
  Calendar,
  Webhook,
  User,
  Save,
  Undo2,
  Redo2,
  Settings,
  TestTube,
} from 'lucide-react';

// Node type definitions for WHAPI Interactive Messages
export const nodeTypes = {
  MESSAGE: [
    { 
      id: 'quickReply', 
      label: 'Quick Reply Buttons', 
      icon: MessageCircle, 
      cost: 1, 
      description: 'Text with up to 3 reply buttons' 
    },
    { 
      id: 'quickReplyImage', 
      label: 'Buttons with Image', 
      icon: ImageIcon, 
      cost: 2, 
      description: 'Image with up to 3 reply buttons' 
    },
    { 
      id: 'quickReplyVideo', 
      label: 'Buttons with Video', 
      icon: Video, 
      cost: 2, 
      description: 'Video with up to 3 reply buttons' 
    },
    { 
      id: 'listMessage', 
      label: 'List Message', 
      icon: List, 
      cost: 1, 
      description: 'Expandable list of options' 
    },
    { 
      id: 'callButton', 
      label: 'Call Button', 
      icon: Phone, 
      cost: 1, 
      description: 'Button to initiate phone call' 
    },
    { 
      id: 'urlButton', 
      label: 'URL Button', 
      icon: Link, 
      cost: 1, 
      description: 'Button to open a website' 
    },
    { 
      id: 'copyButton', 
      label: 'Copy/OTP Button', 
      icon: Copy, 
      cost: 1, 
      description: 'Button to copy text (OTP codes)' 
    },
    { 
      id: 'carousel', 
      label: 'Carousel', 
      icon: Grid3x3, 
      cost: 3, 
      description: 'Swipeable cards with buttons' 
    },
  ],
  TRIGGER: [
    { id: 'messageTrigger', label: 'Message Trigger', icon: Zap, cost: 1, description: 'Trigger on message received' },
    { id: 'scheduleTrigger', label: 'Schedule Trigger', icon: Calendar, cost: 3, description: 'Trigger at scheduled time' },
    { id: 'webhookTrigger', label: 'Webhook Trigger', icon: Webhook, cost: 3, description: 'Trigger via external webhook' },
    { id: 'manualTrigger', label: 'Manual Trigger', icon: User, cost: 1, description: 'Manually triggered action' },
  ],
};

interface WorkflowBuilderProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  initialEntryNodeId?: string;
  onSave?: (nodes: Node[], edges: Edge[], entryNodeId?: string) => void;
  workflowName?: string;
}

export default function WorkflowBuilder({
  initialNodes = [],
  initialEdges = [],
  initialEntryNodeId,
  onSave,
  workflowName = 'Untitled Workflow',
}: WorkflowBuilderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [entryNodeId, setEntryNodeId] = useState<string | undefined>(initialEntryNodeId);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current || !reactFlowInstance) return;

      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('label');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const newNode: Node = {
        id: `${type}_${Date.now()}`,
        type: 'default',
        position,
        data: { 
          label,
          type,
          config: {},
        },
        style: {
          background: type.includes('Trigger') ? 'hsl(var(--primary))' : 'hsl(var(--card))',
          color: type.includes('Trigger') ? 'hsl(var(--primary-foreground))' : 'hsl(var(--card-foreground))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '8px',
          padding: '10px',
          fontSize: '12px',
          width: 200,
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleSave = () => {
    if (onSave) {
      onSave(nodes, edges, entryNodeId);
    }
  };

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  return (
    <div className="flex h-[calc(100vh-12rem)] gap-4">
      {/* Node Palette Sidebar */}
      <Card className="w-80 p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <List className="h-4 w-4" />
          Node Palette
        </h3>
        <Tabs defaultValue="message">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="message" data-testid="tab-message">MESSAGE</TabsTrigger>
            <TabsTrigger value="trigger" data-testid="tab-trigger">TRIGGER</TabsTrigger>
          </TabsList>
          
          <TabsContent value="message" className="mt-4">
            <ScrollArea className="h-[calc(100vh-20rem)]">
              <div className="space-y-2">
                {nodeTypes.MESSAGE.map((node) => (
                  <div
                    key={node.id}
                    className="p-3 border rounded-md cursor-move hover-elevate active-elevate-2"
                    draggable
                    onDragStart={(e) => onDragStart(e, node.id, node.label)}
                    data-testid={`node-type-${node.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <node.icon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{node.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {node.description}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {node.cost} tokens
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="trigger" className="mt-4">
            <ScrollArea className="h-[calc(100vh-20rem)]">
              <div className="space-y-2">
                {nodeTypes.TRIGGER.map((node) => (
                  <div
                    key={node.id}
                    className="p-3 border rounded-md cursor-move hover-elevate active-elevate-2"
                    draggable
                    onDragStart={(e) => onDragStart(e, node.id, node.label)}
                    data-testid={`node-type-${node.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <node.icon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{node.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {node.description}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {node.cost} tokens
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </Card>

      {/* ReactFlow Canvas */}
      <div className="flex-1 h-full w-full border rounded-lg" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          fitView
          data-testid="workflow-canvas"
        >
          <Background variant={BackgroundVariant.Dots} />
          <Controls />
          <MiniMap />
          <Panel position="top-left" className="bg-card border rounded-md p-2">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" title="Undo" data-testid="button-undo">
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" title="Redo" data-testid="button-redo">
                <Redo2 className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button size="sm" variant="default" onClick={handleSave} data-testid="button-save-workflow">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Node Configuration Panel */}
      {selectedNode && (
        <Card className="w-80 flex flex-col max-h-full">
          <div className="p-4 border-b flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Node Configuration</h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div>
                <Label>Node Type</Label>
                <div className="text-sm text-muted-foreground mt-1">
                  {String(selectedNode.data.label || '')}
                </div>
              </div>
              <div>
                <Label htmlFor="node-label">Display Label</Label>
                <Input
                  id="node-label"
                  value={String(selectedNode.data.label || '')}
                  onChange={(e) => {
                    setNodes((nds) =>
                      nds.map((node) =>
                        node.id === selectedNode.id
                          ? { ...node, data: { ...node.data, label: e.target.value } }
                          : node
                      )
                    );
                  }}
                  data-testid="input-node-label"
                />
              </div>
              <div className="border-t pt-4">
                <Label className="mb-3 block">Message Settings</Label>
                <NodeConfigPanel
                  node={selectedNode}
                  onUpdate={(nodeId, config) => {
                    setNodes((nds) =>
                      nds.map((node) =>
                        node.id === nodeId
                          ? { ...node, data: { ...node.data, config } }
                          : node
                      )
                    );
                  }}
                />
              </div>
            </div>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}
