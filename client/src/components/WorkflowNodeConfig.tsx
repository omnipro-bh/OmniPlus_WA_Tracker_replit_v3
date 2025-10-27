import { Node } from '@xyflow/react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface NodeConfigProps {
  node: Node;
  onUpdate: (nodeId: string, config: any) => void;
}

export function NodeConfigPanel({ node, onUpdate }: NodeConfigProps) {
  const nodeType = (node.data.type as string) || '';
  const config = (node.data.config as any) || {};

  const updateConfig = (key: string, value: any) => {
    onUpdate(node.id, { ...config, [key]: value });
  };

  // Text Message Configuration
  if (nodeType === 'text') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="text-body">Message Body *</Label>
          <Textarea
            id="text-body"
            placeholder="Enter your message..."
            value={config.body || ''}
            onChange={(e) => updateConfig('body', e.target.value)}
            rows={4}
            data-testid="input-text-body"
          />
          <p className="text-xs text-muted-foreground mt-1">
            The text content to send
          </p>
        </div>
        <div>
          <Label htmlFor="text-preview">Link Preview</Label>
          <Select value={config.previewUrl ? 'yes' : 'no'} onValueChange={(v) => updateConfig('previewUrl', v === 'yes')}>
            <SelectTrigger data-testid="select-preview">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  // Media Message Configuration
  if (nodeType === 'media') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="media-url">Media URL *</Label>
          <Input
            id="media-url"
            placeholder="https://example.com/image.jpg"
            value={config.mediaUrl || ''}
            onChange={(e) => updateConfig('mediaUrl', e.target.value)}
            data-testid="input-media-url"
          />
        </div>
        <div>
          <Label htmlFor="media-caption">Caption</Label>
          <Textarea
            id="media-caption"
            placeholder="Optional caption..."
            value={config.caption || ''}
            onChange={(e) => updateConfig('caption', e.target.value)}
            rows={3}
            data-testid="input-media-caption"
          />
        </div>
      </div>
    );
  }

  // Location Message Configuration
  if (nodeType === 'location') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="location-lat">Latitude *</Label>
          <Input
            id="location-lat"
            type="number"
            step="any"
            placeholder="37.7749"
            value={config.latitude || ''}
            onChange={(e) => updateConfig('latitude', e.target.value)}
            data-testid="input-latitude"
          />
        </div>
        <div>
          <Label htmlFor="location-lng">Longitude *</Label>
          <Input
            id="location-lng"
            type="number"
            step="any"
            placeholder="-122.4194"
            value={config.longitude || ''}
            onChange={(e) => updateConfig('longitude', e.target.value)}
            data-testid="input-longitude"
          />
        </div>
        <div>
          <Label htmlFor="location-name">Location Name</Label>
          <Input
            id="location-name"
            placeholder="E.g., Golden Gate Bridge"
            value={config.name || ''}
            onChange={(e) => updateConfig('name', e.target.value)}
            data-testid="input-location-name"
          />
        </div>
      </div>
    );
  }

  // Interactive Message Configuration
  if (nodeType === 'interactive' || nodeType === 'interactiveDynamic') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="interactive-header">Header</Label>
          <Input
            id="interactive-header"
            placeholder="Message header"
            value={config.header || ''}
            onChange={(e) => updateConfig('header', e.target.value)}
            data-testid="input-interactive-header"
          />
        </div>
        <div>
          <Label htmlFor="interactive-body">Body *</Label>
          <Textarea
            id="interactive-body"
            placeholder="Message body..."
            value={config.body || ''}
            onChange={(e) => updateConfig('body', e.target.value)}
            rows={3}
            data-testid="input-interactive-body"
          />
        </div>
        <div>
          <Label htmlFor="interactive-footer">Footer</Label>
          <Input
            id="interactive-footer"
            placeholder="Message footer"
            value={config.footer || ''}
            onChange={(e) => updateConfig('footer', e.target.value)}
            data-testid="input-interactive-footer"
          />
        </div>
        <Separator />
        <div>
          <Label>Buttons (comma separated)</Label>
          <Input
            placeholder="Button 1, Button 2, Button 3"
            value={config.buttons || ''}
            onChange={(e) => updateConfig('buttons', e.target.value)}
            data-testid="input-interactive-buttons"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Up to 3 buttons, separated by commas
          </p>
        </div>
      </div>
    );
  }

  // Contact Message Configuration
  if (nodeType === 'contact') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="contact-name">Contact Name *</Label>
          <Input
            id="contact-name"
            placeholder="John Doe"
            value={config.name || ''}
            onChange={(e) => updateConfig('name', e.target.value)}
            data-testid="input-contact-name"
          />
        </div>
        <div>
          <Label htmlFor="contact-phone">Phone Number *</Label>
          <Input
            id="contact-phone"
            placeholder="+1234567890"
            value={config.phone || ''}
            onChange={(e) => updateConfig('phone', e.target.value)}
            data-testid="input-contact-phone"
          />
        </div>
      </div>
    );
  }

  // Message Trigger Configuration
  if (nodeType === 'messageTrigger') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="trigger-keyword">Keyword Pattern</Label>
          <Input
            id="trigger-keyword"
            placeholder="E.g., hello, hi, help"
            value={config.keyword || ''}
            onChange={(e) => updateConfig('keyword', e.target.value)}
            data-testid="input-trigger-keyword"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Trigger when message contains these keywords (comma separated)
          </p>
        </div>
        <div>
          <Label htmlFor="trigger-condition">Condition Type</Label>
          <Select value={config.condition || 'contains'} onValueChange={(v) => updateConfig('condition', v)}>
            <SelectTrigger data-testid="select-trigger-condition">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contains">Contains</SelectItem>
              <SelectItem value="equals">Equals</SelectItem>
              <SelectItem value="startsWith">Starts With</SelectItem>
              <SelectItem value="regex">Regex Pattern</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  // Schedule Trigger Configuration
  if (nodeType === 'scheduleTrigger') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="schedule-cron">Cron Expression *</Label>
          <Input
            id="schedule-cron"
            placeholder="0 9 * * *"
            value={config.cron || ''}
            onChange={(e) => updateConfig('cron', e.target.value)}
            data-testid="input-schedule-cron"
          />
          <p className="text-xs text-muted-foreground mt-1">
            E.g., "0 9 * * *" for daily at 9 AM
          </p>
        </div>
        <div>
          <Label htmlFor="schedule-timezone">Timezone</Label>
          <Input
            id="schedule-timezone"
            placeholder="UTC"
            value={config.timezone || 'UTC'}
            onChange={(e) => updateConfig('timezone', e.target.value)}
            data-testid="input-schedule-timezone"
          />
        </div>
      </div>
    );
  }

  // Webhook Trigger Configuration
  if (nodeType === 'webhookTrigger') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="webhook-event">Event Type</Label>
          <Select value={config.event || 'message'} onValueChange={(v) => updateConfig('event', v)}>
            <SelectTrigger data-testid="select-webhook-event">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="message">New Message</SelectItem>
              <SelectItem value="status">Status Update</SelectItem>
              <SelectItem value="presence">Presence Change</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  // Default configuration for unknown types
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        No specific configuration available for this node type.
      </div>
    </div>
  );
}
