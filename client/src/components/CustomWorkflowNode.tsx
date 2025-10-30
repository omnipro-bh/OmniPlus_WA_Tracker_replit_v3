import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { X, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const CustomWorkflowNode = memo(({ data, selected, id }: NodeProps) => {
  const config = (data.config || {}) as any;
  const buttons = (config.buttons || []) as any[];
  const sections = (config.sections || []) as any[];
  const isEntryNode = (data as any).entryNodeId === id;
  
  // Determine if this node has multiple outputs
  const hasMultipleOutputs = buttons.length > 0 || sections.length > 0;
  
  // For list messages, collect all row IDs from all sections
  const listRowIds: { id: string; title: string; sectionTitle?: string }[] = [];
  if (sections.length > 0) {
    sections.forEach((section: any) => {
      if (section.rows && section.rows.length > 0) {
        section.rows.forEach((row: any) => {
          listRowIds.push({
            id: row.id,
            title: row.title,
            sectionTitle: section.title,
          });
        });
      }
    });
  }
  
  const totalOutputs = buttons.length + listRowIds.length;
  
  // Handle node deletion
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Dispatch custom event that WorkflowBuilder will listen to
    window.dispatchEvent(new CustomEvent('deleteNode', { detail: { nodeId: id } }));
  };
  
  // Handle setting entry node
  const handleSetEntryNode = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('setEntryNode', { detail: { nodeId: id } }));
  };
  
  return (
    <div
      className={`relative px-4 py-3 shadow-md rounded-lg border-2 min-w-[200px] ${
        selected ? 'border-primary' : isEntryNode ? 'border-amber-500' : 'border-border'
      }`}
      style={{
        backgroundColor: (data.type as string)?.includes('Trigger') 
          ? 'hsl(var(--primary))' 
          : 'hsl(var(--card))',
        color: (data.type as string)?.includes('Trigger') 
          ? 'hsl(var(--primary-foreground))' 
          : 'hsl(var(--card-foreground))',
      }}
    >
      {/* Delete button - only show when selected */}
      {selected && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md"
          onClick={handleDelete}
          data-testid={`button-delete-node-${id}`}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
      
      {/* Set Entry Node button - only show when selected and not a trigger */}
      {selected && !((data as any).type as string)?.includes('Trigger') && (
        <Button
          size="icon"
          variant="ghost"
          className={`absolute -top-3 -left-3 h-6 w-6 rounded-full shadow-md ${
            isEntryNode 
              ? 'bg-amber-500 text-white hover:bg-amber-600' 
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
          onClick={handleSetEntryNode}
          data-testid={`button-set-entry-node-${id}`}
          title={isEntryNode ? 'Entry Node (First Message)' : 'Set as Entry Node'}
        >
          <Star className={`h-3 w-3 ${isEntryNode ? 'fill-current' : ''}`} />
        </Button>
      )}
      
      {/* Entry node badge */}
      {isEntryNode && (
        <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs px-2">
          Entry
        </Badge>
      )}
      
      {/* Input Handle - single target handle at the left */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-primary"
      />
      
      {/* Node Label */}
      <div className="font-medium text-sm mb-2">{String(data.label || 'Node')}</div>
      
      {/* Show button/option count if multiple outputs exist */}
      {hasMultipleOutputs && totalOutputs > 0 && (
        <div className="text-xs text-muted-foreground mb-2">
          {totalOutputs} output{totalOutputs > 1 ? 's' : ''}
        </div>
      )}
      
      {/* Output Handles - one for each button */}
      {buttons.length > 0 && (
        <div className="space-y-1 mt-3">
          {buttons.map((button: any, index: number) => {
            return (
              <div key={button.id} className="relative flex items-center justify-end gap-2 h-6">
                <Badge 
                  variant="secondary" 
                  className="text-xs truncate max-w-[140px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20"
                  title={button.title || `Button ${index + 1}`}
                >
                  {button.title || `Button ${index + 1}`}
                </Badge>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={button.id}
                  className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white dark:!border-gray-800"
                  style={{ 
                    position: 'absolute',
                    right: '-12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      
      {/* Output Handles - one for each list row */}
      {listRowIds.length > 0 && (
        <div className="space-y-1 mt-3">
          {listRowIds.map((row, index) => {
            return (
              <div key={row.id} className="relative flex items-center justify-end gap-2 h-6">
                <Badge 
                  variant="secondary" 
                  className="text-xs truncate max-w-[140px] bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20"
                  title={`${row.sectionTitle ? row.sectionTitle + ' - ' : ''}${row.title}`}
                >
                  {row.title}
                </Badge>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={row.id}
                  className="!w-3 !h-3 !bg-green-500 !border-2 !border-white dark:!border-gray-800"
                  style={{ 
                    position: 'absolute',
                    right: '-12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      
      {/* Default single output handle if no buttons/options */}
      {!hasMultipleOutputs && (
        <Handle
          type="source"
          position={Position.Right}
          className="w-3 h-3 !bg-primary"
        />
      )}
    </div>
  );
});

CustomWorkflowNode.displayName = 'CustomWorkflowNode';
