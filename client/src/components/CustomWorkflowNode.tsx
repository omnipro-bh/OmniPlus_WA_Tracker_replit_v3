import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';

export const CustomWorkflowNode = memo(({ data, selected }: NodeProps) => {
  const config = (data.config || {}) as any;
  const buttons = (config.buttons || []) as any[];
  const sections = (config.sections || []) as any[];
  
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
  
  return (
    <div
      className={`px-4 py-3 shadow-md rounded-lg border-2 min-w-[200px] ${
        selected ? 'border-primary' : 'border-border'
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
        <div className="space-y-2 mt-3">
          {buttons.map((button: any, index: number) => {
            // Calculate unique vertical position for each handle
            // Base offset + spacing between handles
            const handleTop = 70 + (index * 32); // 32px spacing between handles
            
            return (
              <div key={button.id} className="relative flex items-center justify-end gap-2 h-6">
                <Badge 
                  variant="outline" 
                  className="text-xs truncate max-w-[140px]"
                  title={button.title || `Button ${index + 1}`}
                >
                  {button.title || `Button ${index + 1}`}
                </Badge>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={button.id}
                  className="w-3 h-3 !bg-blue-500"
                  style={{ 
                    top: `${handleTop}px`,
                    right: -6,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      
      {/* Output Handles - one for each list row */}
      {listRowIds.length > 0 && (
        <div className="space-y-2 mt-3">
          {listRowIds.map((row, index) => {
            // Calculate unique vertical position for each handle
            // Base offset + spacing between handles + offset for buttons if any
            const handleTop = 70 + (buttons.length * 32) + (index * 32); // 32px spacing
            
            return (
              <div key={row.id} className="relative flex items-center justify-end gap-2 h-6">
                <Badge 
                  variant="outline" 
                  className="text-xs truncate max-w-[140px]"
                  title={`${row.sectionTitle ? row.sectionTitle + ' - ' : ''}${row.title}`}
                >
                  {row.title}
                </Badge>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={row.id}
                  className="w-3 h-3 !bg-green-500"
                  style={{ 
                    top: `${handleTop}px`,
                    right: -6,
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
