import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
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
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { NodeConfigPanel } from '@/components/WorkflowNodeConfig';
import { CustomWorkflowNode } from '@/components/CustomWorkflowNode';
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
  Play,
  Pause,
  Network,
  MapPin,
  Download,
  Upload,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Plus,
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
      id: 'buttons', 
      label: 'Buttons', 
      icon: Phone, 
      cost: 1, 
      description: 'Call or URL buttons (up to 3 mixed)' 
    },
    { 
      id: 'carousel', 
      label: 'Carousel', 
      icon: Grid3x3, 
      cost: 3, 
      description: 'Swipeable cards with buttons' 
    },
  ],
  END_MESSAGE: [
    { 
      id: 'message.text', 
      label: 'Text Message', 
      icon: MessageCircle, 
      cost: 1, 
      description: 'Simple text message (terminal)' 
    },
    { 
      id: 'message.media', 
      label: 'Media Message', 
      icon: ImageIcon, 
      cost: 2, 
      description: 'Image/Video/Audio/Document (terminal)' 
    },
    { 
      id: 'message.location', 
      label: 'Location', 
      icon: MapPin, 
      cost: 1, 
      description: 'Send location coordinates (terminal)' 
    },
  ],
  TRIGGER: [
    { 
      id: 'firstMessageTrigger', 
      label: 'First Message of Day', 
      icon: Zap, 
      cost: 0, 
      description: 'Triggers on first incoming message of the day (resets at 00:00 Asia/Bahrain)' 
    },
  ],
  ACTION: [
    {
      id: 'action.http_request',
      label: 'HTTP Request',
      icon: Network,
      cost: 0,
      description: 'Call external APIs with custom HTTP requests'
    },
  ],
};

// Auto-layout function using dagre for horizontal left-to-right arrangement
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  const nodeWidth = 250;
  const nodeHeight = 150;
  
  // LR = left to right, TB = top to bottom
  dagreGraph.setGraph({ rankdir: direction, nodesep: 100, ranksep: 200 });
  
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });
  
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  
  dagre.layout(dagreGraph);
  
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });
  
  return { nodes: layoutedNodes, edges };
};

interface WorkflowBuilderProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  initialEntryNodeId?: string;
  initialWorkflowId?: number;
  isActive?: boolean;
  onSave?: (nodes: Node[], edges: Edge[], entryNodeId?: string | null) => void;
  onToggleActive?: (isActive: boolean) => void;
  workflowName?: string;
}

export default function WorkflowBuilder({
  initialNodes = [],
  initialEdges = [],
  initialEntryNodeId,
  initialWorkflowId,
  isActive = true,
  onSave,
  onToggleActive,
  workflowName = 'Untitled Workflow',
}: WorkflowBuilderProps) {
  // Convert all nodes to use custom type for multi-handle support
  const convertedInitialNodes = initialNodes.map(node => ({
    ...node,
    type: 'custom',
  }));
  
  const [nodes, setNodes, onNodesChange] = useNodesState(convertedInitialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [entryNodeId, setEntryNodeId] = useState<string | undefined>(initialEntryNodeId);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Panel state management
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [showNodePaletteSheet, setShowNodePaletteSheet] = useState(false);
  const [showConfigSheet, setShowConfigSheet] = useState(false);
  
  // Load panel preferences from localStorage
  useEffect(() => {
    const savedLeftCollapsed = localStorage.getItem('workflow-builder-left-collapsed');
    const savedRightCollapsed = localStorage.getItem('workflow-builder-right-collapsed');
    
    if (savedLeftCollapsed) setLeftPanelCollapsed(savedLeftCollapsed === 'true');
    if (savedRightCollapsed) setRightPanelCollapsed(savedRightCollapsed === 'true');
  }, []);
  
  // Save panel collapse state to localStorage
  useEffect(() => {
    localStorage.setItem('workflow-builder-left-collapsed', leftPanelCollapsed.toString());
  }, [leftPanelCollapsed]);
  
  useEffect(() => {
    localStorage.setItem('workflow-builder-right-collapsed', rightPanelCollapsed.toString());
  }, [rightPanelCollapsed]);
  
  // Auto-expand right panel when node is selected (only if in normal mode)
  useEffect(() => {
    if (selectedNodeId && !isFullscreen && rightPanelCollapsed) {
      setRightPanelCollapsed(false);
    }
  }, [selectedNodeId, isFullscreen, rightPanelCollapsed]);
  
  // In fullscreen mode, show config sheet when node is selected
  useEffect(() => {
    if (isFullscreen && selectedNodeId) {
      setShowConfigSheet(true);
    }
  }, [isFullscreen, selectedNodeId]);
  
  // Restore panel sizes from localStorage on mount
  const [savedPanelSizes, setSavedPanelSizes] = useState<number[]>([]);
  
  useEffect(() => {
    const saved = localStorage.getItem('workflow-builder-panel-sizes');
    if (saved) {
      try {
        setSavedPanelSizes(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved panel sizes:', e);
      }
    }
  }, []);
  
  // Derive selectedNode from nodes array to always have latest data
  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) || null : null;
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  
  // Register custom node types for ReactFlow
  const customNodeTypes = useMemo(() => ({ custom: CustomWorkflowNode }), []);

  // Add entryNodeId to each node's data for visual indication
  const nodesWithEntryData = useMemo(() => 
    nodes.map(node => ({
      ...node,
      data: { ...node.data, entryNodeId }
    })),
    [nodes, entryNodeId]
  );

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // Handle keyboard shortcuts for node deletion and fullscreen
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if we're focused on an input field
      const target = event.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // F11 key - toggle fullscreen (prevent default browser fullscreen)
      if (event.key === 'F11') {
        event.preventDefault();
        toggleFullscreen();
        return;
      }

      // Escape key - exit fullscreen
      if (event.key === 'Escape' && isFullscreen) {
        event.preventDefault();
        setIsFullscreen(false);
        return;
      }
      
      // Delete or Backspace key - delete selected nodes
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // Don't delete nodes if input is focused
        if (isInputFocused) {
          return;
        }
        
        // Prevent default behavior (especially for Backspace which navigates back)
        event.preventDefault();
        
        // Get all selected nodes from ReactFlow's selection state
        const selectedNodes = nodes.filter(node => node.selected);
        
        if (selectedNodes.length > 0) {
          const selectedNodeIds = selectedNodes.map(node => node.id);
          
          // Clear entry node if it's being deleted
          if (entryNodeId && selectedNodeIds.includes(entryNodeId)) {
            setEntryNodeId(undefined);
          }
          
          // Delete the selected nodes
          setNodes((nds) => nds.filter((node) => !selectedNodeIds.includes(node.id)));
          
          // Delete edges connected to these nodes
          setEdges((eds) => eds.filter((edge) => 
            !selectedNodeIds.includes(edge.source) && !selectedNodeIds.includes(edge.target)
          ));
          
          // Clear our custom selection
          setSelectedNodeId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, entryNodeId, isFullscreen, setNodes, setEdges, toggleFullscreen]);

  // Handle delete button clicks from CustomWorkflowNode
  useEffect(() => {
    const handleDeleteNode = (event: CustomEvent) => {
      const { nodeId } = event.detail;
      
      // Delete the node
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      
      // Delete edges connected to this node
      setEdges((eds) => eds.filter((edge) => 
        edge.source !== nodeId && edge.target !== nodeId
      ));
      
      // Clear selection if this was the selected node
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
      
      // Clear entry node if this was the entry node
      if (entryNodeId === nodeId) {
        setEntryNodeId(undefined);
      }
    };

    window.addEventListener('deleteNode', handleDeleteNode as EventListener);
    return () => window.removeEventListener('deleteNode', handleDeleteNode as EventListener);
  }, [selectedNodeId, entryNodeId, setNodes, setEdges]);

  // Handle set entry node event
  useEffect(() => {
    const handleSetEntryNode = (event: CustomEvent) => {
      const { nodeId } = event.detail;
      // Toggle: if clicking the same node, unset it; otherwise set new entry node
      setEntryNodeId(prevId => prevId === nodeId ? undefined : nodeId);
    };

    window.addEventListener('setEntryNode', handleSetEntryNode as EventListener);
    return () => window.removeEventListener('setEntryNode', handleSetEntryNode as EventListener);
  }, []);

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
        type: 'custom',
        position,
        data: { 
          label,
          type,
          config: {},
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

  const addNodeToCanvas = useCallback((nodeType: string, label: string) => {
    // Horizontal layout: position nodes in a left-to-right flow
    // Calculate position based on existing nodes for horizontal arrangement
    const existingNodes = nodes.filter(n => n.data.type === nodeType);
    const column = Math.floor(existingNodes.length / 3); // 3 nodes per column
    const row = existingNodes.length % 3;
    
    const position = { 
      x: 50 + (column * 300), // Horizontal spacing
      y: 50 + (row * 150)      // Vertical spacing within column
    };

    const newNode: Node = {
      id: `${nodeType}_${Date.now()}`,
      type: 'custom',
      position,
      data: { 
        label,
        type: nodeType,
        config: {},
      },
    };

    setNodes((nds) => nds.concat(newNode));
  }, [setNodes, nodes]);

  const handleSave = () => {
    if (onSave) {
      // Explicitly send null when entryNodeId is undefined so the backend receives the update
      const finalEntryNodeId = entryNodeId ?? null;
      console.log('[WorkflowBuilder handleSave] entryNodeId:', entryNodeId, '→ finalEntryNodeId:', finalEntryNodeId);
      onSave(nodes, edges, finalEntryNodeId);
    }
  };
  
  const handleExport = () => {
    const exportData = {
      schemaVersion: "1.0.0",
      workflow: {
        id: initialWorkflowId,
        name: workflowName,
        exportedAt: new Date().toISOString(),
      },
      nodes: nodes.map(node => ({
        id: node.id,
        type: node.data.type,
        label: node.data.label,
        config: node.data.config,
        position: node.position,
      })),
      edges: edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
      entryNodeId: entryNodeId || null,
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow_${workflowName || 'export'}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          
          // Validate schema
          if (!data.schemaVersion || !data.nodes || !data.edges) {
            alert('Invalid workflow file: Missing required fields');
            return;
          }
          
          // Check for ID collisions - add timestamp suffix if IDs already exist
          const existingIds = new Set(nodes.map(n => n.id));
          const idMapping = new Map<string, string>();
          
          const importedNodes = data.nodes.map((nodeData: any) => {
            let newId = nodeData.id;
            if (existingIds.has(newId)) {
              newId = `${newId}_${Date.now()}`;
              idMapping.set(nodeData.id, newId);
            }
            
            return {
              id: newId,
              type: 'custom',
              position: nodeData.position || { x: 0, y: 0 },
              data: {
                label: nodeData.label,
                type: nodeData.type,
                config: nodeData.config || {},
              },
            };
          });
          
          const importedEdges = data.edges.map((edgeData: any) => ({
            id: edgeData.id,
            source: idMapping.get(edgeData.source) || edgeData.source,
            target: idMapping.get(edgeData.target) || edgeData.target,
            sourceHandle: edgeData.sourceHandle,
            targetHandle: edgeData.targetHandle,
          }));
          
          // Replace workflow with imported data
          setNodes(importedNodes);
          setEdges(importedEdges);
          if (data.entryNodeId) {
            const mappedEntryId = idMapping.get(data.entryNodeId) || data.entryNodeId;
            setEntryNodeId(mappedEntryId);
          }
          
          alert('Workflow imported successfully!');
        } catch (error) {
          alert(`Failed to import workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };
  
  const handleAutoLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, 'LR');
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [nodes, edges, setNodes, setEdges]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    if (isFullscreen) {
      setShowConfigSheet(true);
    }
  }, [isFullscreen]);

  // Node Palette Content (reusable)
  const renderNodePalette = () => (
    <Tabs defaultValue="message" className="flex flex-col h-full">
      <TabsList className="grid w-full grid-cols-4 flex-shrink-0">
        <TabsTrigger value="message" data-testid="tab-message">MESSAGE</TabsTrigger>
        <TabsTrigger value="end" data-testid="tab-end">END</TabsTrigger>
        <TabsTrigger value="trigger" data-testid="tab-trigger">TRIGGER</TabsTrigger>
        <TabsTrigger value="action" data-testid="tab-action">ACTION</TabsTrigger>
      </TabsList>
      
      <TabsContent value="message" className="flex-1 min-h-0 mt-4">
        <ScrollArea className="h-full">
          <div className="space-y-2 pr-4">
            {nodeTypes.MESSAGE.map((node) => (
              <div
                key={node.id}
                className="p-3 border rounded-md cursor-pointer hover-elevate active-elevate-2"
                draggable
                onDragStart={(e) => onDragStart(e, node.id, node.label)}
                onClick={() => addNodeToCanvas(node.id, node.label)}
                data-testid={`node-type-${node.id}`}
                title={`Click to add or drag to canvas`}
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

      <TabsContent value="end" className="flex-1 min-h-0 mt-4">
        <ScrollArea className="h-full">
          <div className="space-y-2 pr-4">
            {nodeTypes.END_MESSAGE.map((node) => (
              <div
                key={node.id}
                className="p-3 border rounded-md cursor-pointer hover-elevate active-elevate-2"
                draggable
                onDragStart={(e) => onDragStart(e, node.id, node.label)}
                onClick={() => addNodeToCanvas(node.id, node.label)}
                data-testid={`node-type-${node.id}`}
                title={`Click to add or drag to canvas`}
              >
                <div className="flex items-start gap-2">
                  <node.icon className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
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

      <TabsContent value="trigger" className="flex-1 min-h-0 mt-4">
        <ScrollArea className="h-full">
          <div className="space-y-2 pr-4">
            {nodeTypes.TRIGGER.map((node) => (
              <div
                key={node.id}
                className="p-3 border rounded-md cursor-pointer hover-elevate active-elevate-2"
                draggable
                onDragStart={(e) => onDragStart(e, node.id, node.label)}
                onClick={() => addNodeToCanvas(node.id, node.label)}
                data-testid={`node-type-${node.id}`}
                title={`Click to add or drag to canvas`}
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

      <TabsContent value="action" className="flex-1 min-h-0 mt-4">
        <ScrollArea className="h-full">
          <div className="space-y-2 pr-4">
            {nodeTypes.ACTION.map((node) => (
              <div
                key={node.id}
                className="p-3 border rounded-md cursor-pointer hover-elevate active-elevate-2"
                draggable
                onDragStart={(e) => onDragStart(e, node.id, node.label)}
                onClick={() => addNodeToCanvas(node.id, node.label)}
                data-testid={`node-type-${node.id}`}
                title={`Click to add or drag to canvas`}
              >
                <div className="flex items-start gap-2">
                  <node.icon className="h-5 w-5 text-cyan-500 mt-0.5 flex-shrink-0" />
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
  );

  return (
    <>
      <ResizablePanelGroup 
        direction="horizontal" 
        className="h-full w-full"
        onLayout={(sizes) => {
          localStorage.setItem('workflow-builder-panel-sizes', JSON.stringify(sizes));
        }}
        {...(savedPanelSizes.length > 0 && { defaultLayout: savedPanelSizes })}
      >
        {/* Left Panel - Node Palette */}
        {!isFullscreen && (
          <>
            <ResizablePanel 
              defaultSize={20} 
              minSize={15} 
              maxSize={30} 
              collapsible
              collapsedSize={0}
              onCollapse={() => setLeftPanelCollapsed(true)}
              onExpand={() => setLeftPanelCollapsed(false)}
            >
              {!leftPanelCollapsed && (
                <Card className="w-full h-full p-4 flex-shrink-0 max-h-full overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <h3 className="font-semibold flex items-center gap-2">
                    <List className="h-4 w-4" />
                    Node Palette
                  </h3>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setLeftPanelCollapsed(true)}
                    title="Collapse panel"
                    data-testid="button-collapse-left-panel"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 min-h-0">
                  {renderNodePalette()}
                </div>
              </Card>
              )}
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}

        {/* Expand button when left panel is collapsed */}
        {leftPanelCollapsed && !isFullscreen && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
            <Button
              size="icon"
              variant="outline"
              onClick={() => setLeftPanelCollapsed(false)}
              title="Expand panel"
              data-testid="button-expand-left-panel"
              className="h-12 w-6 rounded-r-md rounded-l-none"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Center Panel - ReactFlow Canvas */}
        <ResizablePanel defaultSize={60} className="relative">
          <div className="h-full w-full border rounded-lg" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodesWithEntryData}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              nodeTypes={customNodeTypes}
              fitView
              minZoom={0.1}
              maxZoom={2}
              defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
              data-testid="workflow-canvas"
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeStrokeWidth={3} />
              <Panel position="top-left" className="bg-card border rounded-md p-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="icon" variant="ghost" title="Undo" data-testid="button-undo">
                    <Undo2 className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Redo" data-testid="button-redo">
                    <Redo2 className="h-4 w-4" />
                  </Button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleExport}
                    title="Export workflow to JSON file"
                    data-testid="button-export-workflow"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleImport}
                    title="Import workflow from JSON file"
                    data-testid="button-import-workflow"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import
                  </Button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleAutoLayout}
                    title="Auto-arrange nodes horizontally"
                    data-testid="button-auto-layout"
                  >
                    <Network className="h-4 w-4 mr-2" />
                    Auto Layout
                  </Button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={toggleFullscreen}
                    title={isFullscreen ? "Exit fullscreen (Esc or F11)" : "Enter fullscreen (F11)"}
                    data-testid="button-toggle-fullscreen"
                  >
                    {isFullscreen ? (
                      <>
                        <Minimize2 className="h-4 w-4 mr-2" />
                        Exit Fullscreen
                      </>
                    ) : (
                      <>
                        <Maximize2 className="h-4 w-4 mr-2" />
                        Fullscreen
                      </>
                    )}
                  </Button>
                  <div className="w-px h-6 bg-border mx-1" />
                  {onToggleActive && (
                    <>
                      <Button 
                        size="sm" 
                        variant={isActive ? "default" : "outline"}
                        onClick={() => onToggleActive(!isActive)}
                        data-testid="button-toggle-active"
                        title={isActive ? "Stop chatbot" : "Start chatbot"}
                      >
                        {isActive ? (
                          <>
                            <Pause className="h-4 w-4 mr-2" />
                            Live
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Stopped
                          </>
                        )}
                      </Button>
                      <div className="w-px h-6 bg-border mx-1" />
                    </>
                  )}
                  <Button size="sm" variant="default" onClick={handleSave} data-testid="button-save-workflow">
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                </div>
              </Panel>

              {/* Fullscreen Floating Add Node Button */}
              {isFullscreen && (
                <Panel position="top-right" className="mt-2 mr-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setShowNodePaletteSheet(true)}
                    data-testid="button-add-node-fullscreen"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Node
                  </Button>
                </Panel>
              )}
            </ReactFlow>
          </div>
        </ResizablePanel>

        {/* Right Panel - Node Configuration */}
        {!isFullscreen && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel 
              defaultSize={20} 
              minSize={15} 
              maxSize={30} 
              collapsible
              collapsedSize={0}
              onCollapse={() => setRightPanelCollapsed(true)}
              onExpand={() => setRightPanelCollapsed(false)}
            >
              {!rightPanelCollapsed && (
                <Card className="w-full h-full flex flex-col max-h-full overflow-hidden flex-shrink-0">
                  <div className="p-4 border-b flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <Settings className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">Node Configuration</h3>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setRightPanelCollapsed(true)}
                      title="Collapse panel"
                      data-testid="button-collapse-right-panel"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  {selectedNode ? (
                    <div className="flex-1 min-h-0">
                      <ScrollArea className="h-full">
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
                  </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center p-8">
                      <div className="text-center text-muted-foreground">
                        <Settings className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p className="font-medium">No Node Selected</p>
                        <p className="text-sm mt-2">Click a node on the canvas to configure it</p>
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </ResizablePanel>
          </>
        )}

        {/* Expand button when right panel is collapsed */}
        {rightPanelCollapsed && !isFullscreen && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
            <Button
              size="icon"
              variant="outline"
              onClick={() => setRightPanelCollapsed(false)}
              title="Expand panel"
              data-testid="button-expand-right-panel"
              className="h-12 w-6 rounded-l-md rounded-r-none"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
      </ResizablePanelGroup>

      {/* Fullscreen Node Palette Sheet */}
      <Sheet open={showNodePaletteSheet} onOpenChange={setShowNodePaletteSheet}>
        <SheetContent side="left" className="w-[400px] sm:w-[540px] flex flex-col">
          <SheetHeader className="flex-shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              Node Palette
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 mt-6">
            {renderNodePalette()}
          </div>
        </SheetContent>
      </Sheet>

      {/* Fullscreen Config Sheet */}
      <Sheet open={showConfigSheet} onOpenChange={setShowConfigSheet}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px] flex flex-col">
          <SheetHeader className="flex-shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Node Configuration
            </SheetTitle>
          </SheetHeader>
          {selectedNode && (
            <div className="flex-1 min-h-0 mt-6">
              <ScrollArea className="h-full">
                <div className="space-y-4 pr-4">
                  <div>
                    <Label>Node Type</Label>
                    <div className="text-sm text-muted-foreground mt-1">
                      {String(selectedNode.data.label || '')}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="node-label-sheet">Display Label</Label>
                    <Input
                      id="node-label-sheet"
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
                      data-testid="input-node-label-sheet"
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
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
