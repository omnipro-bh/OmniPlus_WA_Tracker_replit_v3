import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { X, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const CustomWorkflowNode = memo(({ data, selected, id }: NodeProps) => {
  const config = (data.config || {}) as any;
  const buttons = (config.buttons || []) as any[];
  const sections = (config.sections || []) as any[];
  const cards = (config.cards || []) as any[];
  const isEntryNode = (data as any).entryNodeId === id;
  const nodeType = (data.type as string) || '';
  
  // Check if this is an end node (terminal node with no outputs)
  const isEndNode = nodeType.startsWith('message.');
  
  // Check if this is an HTTP Request node (has success and error outputs)
  const isHttpNode = nodeType === 'httpRequest';
  
  // Check if this is a booking node
  const isBookingNode = nodeType.startsWith('booking.');
  
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
  
  // For carousel, collect all quick reply buttons from all cards
  const carouselQuickReplies: { id: string; title: string; cardIndex: number }[] = [];
  if (cards.length > 0) {
    cards.forEach((card: any, cardIndex: number) => {
      if (card.buttons && card.buttons.length > 0) {
        card.buttons.forEach((button: any) => {
          // Only include quick_reply buttons (not url buttons)
          if (button.type === 'quick_reply') {
            carouselQuickReplies.push({
              id: button.id,
              title: button.title || `Quick Reply ${cardIndex + 1}`,
              cardIndex: cardIndex,
            });
          }
        });
      }
    });
  }
  
  // Determine if this node has multiple outputs
  const hasMultipleOutputs = buttons.length > 0 || sections.length > 0 || carouselQuickReplies.length > 0;
  
  const totalOutputs = buttons.length + listRowIds.length + carouselQuickReplies.length;
  
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
          : isBookingNode
            ? 'hsl(205 75% 55%)' // Light blue for booking nodes
            : 'hsl(var(--card))',
        color: (data.type as string)?.includes('Trigger') 
          ? 'hsl(var(--primary-foreground))' 
          : isBookingNode
            ? 'hsl(0 0% 100%)' // White text for booking nodes
            : 'hsl(var(--card-foreground))',
        borderColor: isBookingNode && selected ? 'hsl(205 90% 60%)' : undefined,
      }}
    >
      {/* Entry node badge - top center */}
      {isEntryNode && (
        <Badge 
          className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs px-2 pointer-events-none"
          style={{ zIndex: 1 }}
        >
          Entry
        </Badge>
      )}
      
      {/* End node badge - top center */}
      {isEndNode && (
        <Badge 
          className="absolute -top-2 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground text-xs px-2 pointer-events-none"
          style={{ zIndex: 1 }}
        >
          END
        </Badge>
      )}
      
      {/* Set Entry Node button - top left corner, always visible for non-trigger/end nodes */}
      {!nodeType.includes('Trigger') && !isEndNode && (
        <Button
          size="icon"
          variant="ghost"
          className={`absolute -top-3 -left-3 h-6 w-6 rounded-full shadow-md transition-all ${
            isEntryNode 
              ? 'bg-amber-500 text-white hover:bg-amber-600' 
              : selected 
                ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                : 'bg-secondary/50 text-secondary-foreground/60 hover:bg-secondary hover:text-secondary-foreground'
          }`}
          onClick={handleSetEntryNode}
          data-testid={`button-set-entry-node-${id}`}
          title={isEntryNode ? 'Entry Node (First Message)' : 'Set as Entry Node'}
          style={{ zIndex: 100 }}
        >
          <Star className={`h-3 w-3 ${isEntryNode ? 'fill-current' : ''}`} />
        </Button>
      )}
      
      {/* Delete button - BOTTOM RIGHT CORNER - always visible, no overlap possible */}
      <button
        onClick={handleDelete}
        data-testid={`button-delete-node-${id}`}
        className="flex items-center justify-center h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md cursor-pointer border-0"
        style={{ 
          position: 'absolute',
          zIndex: 100,
          bottom: '-12px',
          right: '-12px'
        }}
        title="Delete node"
      >
        <X className="h-3 w-3" />
      </button>
      
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
      
      {/* Output Handles - only for non-end nodes */}
      {!isEndNode && (
        <>
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
          
          {/* Output Handles - one for each carousel quick reply button */}
          {carouselQuickReplies.length > 0 && (
            <div className="space-y-1 mt-3">
              {carouselQuickReplies.map((quickReply, index) => {
                return (
                  <div key={quickReply.id} className="relative flex items-center justify-end gap-2 h-6">
                    <Badge 
                      variant="secondary" 
                      className="text-xs truncate max-w-[140px] bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20"
                      title={`Card ${quickReply.cardIndex + 1}: ${quickReply.title}`}
                    >
                      {quickReply.title}
                    </Badge>
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={quickReply.id}
                      className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white dark:!border-gray-800"
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
          
          {/* HTTP Request Node - success and error outputs */}
          {isHttpNode && (
            <div className="space-y-1 mt-3">
              {/* Success path */}
              <div className="relative flex items-center justify-end gap-2 h-6">
                <Badge 
                  variant="secondary" 
                  className="text-xs truncate max-w-[140px] bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20"
                  title="Success (2xx responses)"
                >
                  Success
                </Badge>
                <Handle
                  type="source"
                  position={Position.Right}
                  id="success"
                  className="!w-3 !h-3 !bg-green-500 !border-2 !border-white dark:!border-gray-800"
                  style={{ 
                    position: 'absolute',
                    right: '-12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              </div>
              {/* Error path */}
              <div className="relative flex items-center justify-end gap-2 h-6">
                <Badge 
                  variant="secondary" 
                  className="text-xs truncate max-w-[140px] bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20"
                  title="Error (non-2xx or network errors)"
                >
                  Error
                </Badge>
                <Handle
                  type="source"
                  position={Position.Right}
                  id="error"
                  className="!w-3 !h-3 !bg-red-500 !border-2 !border-white dark:!border-gray-800"
                  style={{ 
                    position: 'absolute',
                    right: '-12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              </div>
            </div>
          )}
          
          {/* Booking Node - booked and no_slots outputs */}
          {isBookingNode && (
            <div className="space-y-1 mt-3">
              {/* Booked path */}
              <div className="relative flex items-center justify-end gap-2 h-6">
                <Badge 
                  variant="secondary" 
                  className="text-xs truncate max-w-[140px] bg-green-600 text-white border-green-700"
                  title="Appointment booked successfully"
                >
                  Booked
                </Badge>
                <Handle
                  type="source"
                  position={Position.Right}
                  id="booked"
                  className="!w-3 !h-3 !bg-green-500 !border-2 !border-white dark:!border-gray-800"
                  style={{ 
                    position: 'absolute',
                    right: '-12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              </div>
              {/* No slots path */}
              <div className="relative flex items-center justify-end gap-2 h-6">
                <Badge 
                  variant="secondary" 
                  className="text-xs truncate max-w-[140px] bg-amber-500 text-white border-amber-600"
                  title="No available time slots"
                >
                  No Slots
                </Badge>
                <Handle
                  type="source"
                  position={Position.Right}
                  id="no_slots"
                  className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white dark:!border-gray-800"
                  style={{ 
                    position: 'absolute',
                    right: '-12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              </div>
            </div>
          )}
          
          {/* Default single output handle if no buttons/options and not HTTP node and not Booking node */}
          {!hasMultipleOutputs && !isHttpNode && !isBookingNode && (
            <Handle
              type="source"
              position={Position.Right}
              className="w-3 h-3 !bg-primary"
            />
          )}
        </>
      )}
    </div>
  );
});

CustomWorkflowNode.displayName = 'CustomWorkflowNode';
