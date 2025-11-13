import { Node } from '@xyflow/react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TestTube, Plus, X, RefreshCw } from 'lucide-react';
import { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';

// Generate random unique ID
function generateId(prefix: string = 'btn'): string {
  return `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
}

interface NodeConfigProps {
  node: Node;
  onUpdate: (nodeId: string, config: any) => void;
}

export function NodeConfigPanel({ node, onUpdate }: NodeConfigProps) {
  const nodeType = (node.data.type as string) || '';
  const config = (node.data.config as any) || {};
  const { toast } = useToast();
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const [testChannelId, setTestChannelId] = useState<number | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Fetch active channels for test functionality
  const { data: channels = [] } = useQuery<any[]>({
    queryKey: ['/api/channels'],
    enabled: testDialogOpen,
  });

  // Filter for ACTIVE and AUTHORIZED channels only
  const activeChannels = channels.filter(
    (ch) => ch.status === 'ACTIVE' && ch.authStatus === 'AUTHORIZED'
  );

  const updateConfig = (key: string, value: any) => {
    onUpdate(node.id, { ...config, [key]: value });
  };

  const handleTestSend = async () => {
    const phoneValue = phoneInputRef.current?.value.trim() || '';
    
    if (!phoneValue) {
      toast({
        title: 'Phone number required',
        description: 'Please enter a phone number',
        variant: 'destructive',
      });
      return;
    }

    if (!testChannelId) {
      toast({
        title: 'Channel required',
        description: 'Please select an active channel',
        variant: 'destructive',
      });
      return;
    }

    setIsSendingTest(true);
    try {
      await apiRequest('POST', '/api/workflows/test-message', {
        nodeType,
        config,
        phone: phoneValue,
        channelId: testChannelId,
      });

      toast({
        title: 'Test message sent',
        description: `Message sent to ${phoneValue}`,
      });
      setTestDialogOpen(false);
      if (phoneInputRef.current) {
        phoneInputRef.current.value = '';
      }
      setTestChannelId(null);
    } catch (error: any) {
      toast({
        title: 'Failed to send test',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const TestButton = () => (
    <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full" data-testid="button-test-message">
          <TestTube className="h-4 w-4 mr-2" />
          Test Message
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-test-message">
        <DialogHeader>
          <DialogTitle>Test Send Message</DialogTitle>
          <DialogDescription>
            Send this message to a phone number for testing
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="test-phone">Phone Number</Label>
            <input
              ref={phoneInputRef}
              id="test-phone"
              type="text"
              placeholder="97313300393"
              defaultValue="97313300393"
              data-testid="input-test-phone"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Enter phone number with country code
            </p>
          </div>
          <div>
            <Label htmlFor="test-channel">Select Channel</Label>
            <Select
              value={testChannelId?.toString() || ''}
              onValueChange={(val) => setTestChannelId(Number(val))}
            >
              <SelectTrigger id="test-channel" data-testid="select-test-channel">
                <SelectValue placeholder="Select a channel" />
              </SelectTrigger>
              <SelectContent>
                {activeChannels.length === 0 ? (
                  <SelectItem value="none" disabled>No active channels</SelectItem>
                ) : (
                  activeChannels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id.toString()}>
                      {channel.label} ({channel.phone})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <Button 
            onClick={handleTestSend} 
            disabled={isSendingTest || !testChannelId}
            className="w-full"
            data-testid="button-send-test"
          >
            {isSendingTest ? 'Sending...' : 'Send Test Message'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // Quick Reply Buttons Configuration
  if (nodeType === 'quickReply') {
    const buttons = config.buttons || [];

    const addButton = () => {
      if (buttons.length >= 3) {
        toast({
          title: 'Maximum buttons reached',
          description: 'Quick Reply supports up to 3 buttons',
          variant: 'destructive',
        });
        return;
      }
      updateConfig('buttons', [...buttons, { title: '', id: generateId('btn') }]);
    };

    const removeButton = (index: number) => {
      const newButtons = buttons.filter((_: any, i: number) => i !== index);
      updateConfig('buttons', newButtons);
    };

    const updateButton = (index: number, field: string, value: string) => {
      const newButtons = [...buttons];
      newButtons[index] = { ...newButtons[index], [field]: value };
      updateConfig('buttons', newButtons);
    };

    const regenerateId = (index: number) => {
      updateButton(index, 'id', generateId('btn'));
    };

    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="header-text">Header Text (Optional)</Label>
          <Input
            id="header-text"
            placeholder="Header with text"
            value={config.headerText || ''}
            onChange={(e) => updateConfig('headerText', e.target.value)}
            data-testid="input-header-text"
          />
        </div>
        <div>
          <Label htmlFor="body-text">Body Text *</Label>
          <Textarea
            id="body-text"
            placeholder="Body message"
            value={config.bodyText || ''}
            onChange={(e) => updateConfig('bodyText', e.target.value)}
            rows={3}
            data-testid="input-body-text"
          />
        </div>
        <div>
          <Label htmlFor="footer-text">Footer Text (Optional)</Label>
          <Input
            id="footer-text"
            placeholder="Footer message"
            value={config.footerText || ''}
            onChange={(e) => updateConfig('footerText', e.target.value)}
            data-testid="input-footer-text"
          />
        </div>
        <Separator />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Buttons (Up to 3)</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={addButton}
              disabled={buttons.length >= 3}
              data-testid="button-add-button"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Button
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Each button max 25 characters</p>
          {buttons.map((button: any, i: number) => (
            <div key={i} className="p-3 border rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Button {i + 1}</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeButton(i)}
                  data-testid={`button-remove-${i}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Button Title"
                value={button.title || ''}
                onChange={(e) => updateButton(i, 'title', e.target.value)}
                maxLength={25}
                data-testid={`input-button-${i}-title`}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Button ID"
                  value={button.id || ''}
                  onChange={(e) => updateButton(i, 'id', e.target.value)}
                  data-testid={`input-button-${i}-id`}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => regenerateId(i)}
                  title="Generate new ID"
                  data-testid={`button-regenerate-${i}-id`}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {buttons.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Click "Add Button" to create buttons
            </p>
          )}
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // Quick Reply with Image Configuration
  if (nodeType === 'quickReplyImage') {
    const buttons = config.buttons || [];

    const addButton = () => {
      if (buttons.length >= 3) {
        toast({
          title: 'Maximum buttons reached',
          description: 'Quick Reply supports up to 3 buttons',
          variant: 'destructive',
        });
        return;
      }
      updateConfig('buttons', [...buttons, { title: '', id: generateId('btn') }]);
    };

    const removeButton = (index: number) => {
      const newButtons = buttons.filter((_: any, i: number) => i !== index);
      updateConfig('buttons', newButtons);
    };

    const updateButton = (index: number, field: string, value: string) => {
      const newButtons = [...buttons];
      newButtons[index] = { ...newButtons[index], [field]: value };
      updateConfig('buttons', newButtons);
    };

    const regenerateId = (index: number) => {
      updateButton(index, 'id', generateId('btn'));
    };

    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="media-url">Image URL *</Label>
          <Input
            id="media-url"
            placeholder="https://example.com/image.jpg"
            value={config.mediaUrl || ''}
            onChange={(e) => updateConfig('mediaUrl', e.target.value)}
            data-testid="input-media-url"
          />
        </div>
        <div>
          <Label htmlFor="body-text">Body Text *</Label>
          <Textarea
            id="body-text"
            placeholder="Body message"
            value={config.bodyText || ''}
            onChange={(e) => updateConfig('bodyText', e.target.value)}
            rows={2}
            data-testid="input-body-text"
          />
        </div>
        <div>
          <Label htmlFor="footer-text">Footer Text (Optional)</Label>
          <Input
            id="footer-text"
            placeholder="Footer message"
            value={config.footerText || ''}
            onChange={(e) => updateConfig('footerText', e.target.value)}
            data-testid="input-footer-text"
          />
        </div>
        <Separator />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Buttons (Up to 3)</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={addButton}
              disabled={buttons.length >= 3}
              data-testid="button-add-button"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Button
            </Button>
          </div>
          {buttons.map((button: any, i: number) => (
            <div key={i} className="p-3 border rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Button {i + 1}</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeButton(i)}
                  data-testid={`button-remove-${i}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Button Title"
                value={button.title || ''}
                onChange={(e) => updateButton(i, 'title', e.target.value)}
                maxLength={25}
                data-testid={`input-button-${i}-title`}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Button ID"
                  value={button.id || ''}
                  onChange={(e) => updateButton(i, 'id', e.target.value)}
                  data-testid={`input-button-${i}-id`}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => regenerateId(i)}
                  title="Generate new ID"
                  data-testid={`button-regenerate-${i}-id`}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {buttons.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Click "Add Button" to create buttons
            </p>
          )}
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // Quick Reply with Video Configuration
  if (nodeType === 'quickReplyVideo') {
    const buttons = config.buttons || [];

    const addButton = () => {
      if (buttons.length >= 3) {
        toast({
          title: 'Maximum buttons reached',
          description: 'Quick Reply supports up to 3 buttons',
          variant: 'destructive',
        });
        return;
      }
      updateConfig('buttons', [...buttons, { title: '', id: generateId('btn') }]);
    };

    const removeButton = (index: number) => {
      const newButtons = buttons.filter((_: any, i: number) => i !== index);
      updateConfig('buttons', newButtons);
    };

    const updateButton = (index: number, field: string, value: string) => {
      const newButtons = [...buttons];
      newButtons[index] = { ...newButtons[index], [field]: value };
      updateConfig('buttons', newButtons);
    };

    const regenerateId = (index: number) => {
      updateButton(index, 'id', generateId('btn'));
    };

    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="media-url">Video URL *</Label>
          <Input
            id="media-url"
            placeholder="https://example.com/video.mp4"
            value={config.mediaUrl || ''}
            onChange={(e) => updateConfig('mediaUrl', e.target.value)}
            data-testid="input-media-url"
          />
        </div>
        <div>
          <Label htmlFor="body-text">Body Text *</Label>
          <Textarea
            id="body-text"
            placeholder="Body message"
            value={config.bodyText || ''}
            onChange={(e) => updateConfig('bodyText', e.target.value)}
            rows={2}
            data-testid="input-body-text"
          />
        </div>
        <div>
          <Label htmlFor="footer-text">Footer Text (Optional)</Label>
          <Input
            id="footer-text"
            placeholder="Footer message"
            value={config.footerText || ''}
            onChange={(e) => updateConfig('footerText', e.target.value)}
            data-testid="input-footer-text"
          />
        </div>
        <Separator />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Buttons (Up to 3)</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={addButton}
              disabled={buttons.length >= 3}
              data-testid="button-add-button"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Button
            </Button>
          </div>
          {buttons.map((button: any, i: number) => (
            <div key={i} className="p-3 border rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Button {i + 1}</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeButton(i)}
                  data-testid={`button-remove-${i}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Button Title"
                value={button.title || ''}
                onChange={(e) => updateButton(i, 'title', e.target.value)}
                maxLength={25}
                data-testid={`input-button-${i}-title`}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Button ID"
                  value={button.id || ''}
                  onChange={(e) => updateButton(i, 'id', e.target.value)}
                  data-testid={`input-button-${i}-id`}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => regenerateId(i)}
                  title="Generate new ID"
                  data-testid={`button-regenerate-${i}-id`}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {buttons.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Click "Add Button" to create buttons
            </p>
          )}
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // List Message Configuration
  if (nodeType === 'listMessage') {
    const sections = config.sections || [];

    const addSection = () => {
      if (sections.length >= 10) {
        toast({
          title: 'Maximum sections reached',
          description: 'List Message supports up to 10 sections',
          variant: 'destructive',
        });
        return;
      }
      updateConfig('sections', [...sections, { title: '', rows: [] }]);
    };

    const removeSection = (index: number) => {
      const newSections = sections.filter((_: any, i: number) => i !== index);
      updateConfig('sections', newSections);
    };

    const updateSection = (sIndex: number, field: string, value: any) => {
      const newSections = [...sections];
      newSections[sIndex] = { ...newSections[sIndex], [field]: value };
      updateConfig('sections', newSections);
    };

    const addRow = (sIndex: number) => {
      const newSections = [...sections];
      const rows = [...(newSections[sIndex].rows || [])];
      rows.push({ title: '', id: generateId('row'), description: '' });
      newSections[sIndex] = { ...newSections[sIndex], rows };
      updateConfig('sections', newSections);
    };

    const removeRow = (sIndex: number, rIndex: number) => {
      const newSections = [...sections];
      const rows = (newSections[sIndex].rows || []).filter((_: any, i: number) => i !== rIndex);
      newSections[sIndex] = { ...newSections[sIndex], rows };
      updateConfig('sections', newSections);
    };

    const updateRow = (sIndex: number, rIndex: number, field: string, value: string) => {
      const newSections = [...sections];
      const rows = [...(newSections[sIndex].rows || [])];
      rows[rIndex] = { ...rows[rIndex], [field]: value };
      newSections[sIndex] = { ...newSections[sIndex], rows };
      updateConfig('sections', newSections);
    };

    const regenerateRowId = (sIndex: number, rIndex: number) => {
      updateRow(sIndex, rIndex, 'id', generateId('row'));
    };

    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="header-text">Header Text (Optional)</Label>
          <Input
            id="header-text"
            placeholder="Header with text"
            value={config.headerText || ''}
            onChange={(e) => updateConfig('headerText', e.target.value)}
            data-testid="input-header-text"
          />
        </div>
        <div>
          <Label htmlFor="body-text">Body Text *</Label>
          <Textarea
            id="body-text"
            placeholder="Body message"
            value={config.bodyText || ''}
            onChange={(e) => updateConfig('bodyText', e.target.value)}
            rows={2}
            data-testid="input-body-text"
          />
        </div>
        <div>
          <Label htmlFor="footer-text">Footer Text (Optional)</Label>
          <Input
            id="footer-text"
            placeholder="Footer message"
            value={config.footerText || ''}
            onChange={(e) => updateConfig('footerText', e.target.value)}
            data-testid="input-footer-text"
          />
        </div>
        <div>
          <Label htmlFor="button-label">Button Label *</Label>
          <Input
            id="button-label"
            placeholder="Pick a hamburger!"
            value={config.buttonLabel || ''}
            onChange={(e) => updateConfig('buttonLabel', e.target.value)}
            data-testid="input-button-label"
          />
        </div>
        <Separator />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>List Sections (Up to 10)</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={addSection}
              disabled={sections.length >= 10}
              data-testid="button-add-section"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Section
            </Button>
          </div>
          {sections.map((section: any, sIndex: number) => (
            <div key={sIndex} className="p-3 border rounded-lg space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Section {sIndex + 1}</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeSection(sIndex)}
                  data-testid={`button-remove-section-${sIndex}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Section Title"
                value={section.title || ''}
                onChange={(e) => updateSection(sIndex, 'title', e.target.value)}
                data-testid={`input-section-${sIndex}-title`}
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Rows</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addRow(sIndex)}
                    data-testid={`button-add-row-${sIndex}`}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Row
                  </Button>
                </div>
                {(section.rows || []).map((row: any, rIndex: number) => (
                  <div key={rIndex} className="p-2 border rounded-md bg-background space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Row {rIndex + 1}</Label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeRow(sIndex, rIndex)}
                        data-testid={`button-remove-row-${sIndex}-${rIndex}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Row Title"
                      value={row.title || ''}
                      onChange={(e) => updateRow(sIndex, rIndex, 'title', e.target.value)}
                      data-testid={`input-row-${sIndex}-${rIndex}-title`}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Row ID"
                        value={row.id || ''}
                        onChange={(e) => updateRow(sIndex, rIndex, 'id', e.target.value)}
                        data-testid={`input-row-${sIndex}-${rIndex}-id`}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => regenerateRowId(sIndex, rIndex)}
                        title="Generate new ID"
                        data-testid={`button-regenerate-row-${sIndex}-${rIndex}-id`}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      placeholder="Row Description (Optional)"
                      value={row.description || ''}
                      onChange={(e) => updateRow(sIndex, rIndex, 'description', e.target.value)}
                      rows={2}
                      data-testid={`input-row-${sIndex}-${rIndex}-description`}
                    />
                  </div>
                ))}
                {(section.rows || []).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Click "Add Row" to create rows
                  </p>
                )}
              </div>
            </div>
          ))}
          {sections.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Click "Add Section" to create list sections
            </p>
          )}
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // Call Button Configuration
  if (nodeType === 'callButton') {
    const buttonId = config.buttonId || generateId('call');
    
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="header-text">Header Text (Optional)</Label>
          <Input
            id="header-text"
            placeholder="Header with text"
            value={config.headerText || ''}
            onChange={(e) => updateConfig('headerText', e.target.value)}
            data-testid="input-header-text"
          />
        </div>
        <div>
          <Label htmlFor="body-text">Body Text *</Label>
          <Textarea
            id="body-text"
            placeholder="Body message"
            value={config.bodyText || ''}
            onChange={(e) => updateConfig('bodyText', e.target.value)}
            rows={3}
            data-testid="input-body-text"
          />
        </div>
        <div>
          <Label htmlFor="footer-text">Footer Text (Optional)</Label>
          <Input
            id="footer-text"
            placeholder="Footer message"
            value={config.footerText || ''}
            onChange={(e) => updateConfig('footerText', e.target.value)}
            data-testid="input-footer-text"
          />
        </div>
        <Separator />
        <div>
          <Label htmlFor="button-title">Button Title *</Label>
          <Input
            id="button-title"
            placeholder="Call us"
            value={config.buttonTitle || ''}
            onChange={(e) => updateConfig('buttonTitle', e.target.value)}
            maxLength={25}
            data-testid="input-button-title"
          />
        </div>
        <div>
          <Label htmlFor="phone-number">Phone Number *</Label>
          <Input
            id="phone-number"
            placeholder="+1234567890"
            value={config.phoneNumber || ''}
            onChange={(e) => updateConfig('phoneNumber', e.target.value)}
            data-testid="input-phone-number"
          />
        </div>
        <div>
          <Label htmlFor="button-id">Button ID</Label>
          <div className="flex gap-2">
            <Input
              id="button-id"
              placeholder="Button ID"
              value={buttonId}
              onChange={(e) => updateConfig('buttonId', e.target.value)}
              data-testid="input-button-id"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateConfig('buttonId', generateId('call'))}
              title="Generate new ID"
              data-testid="button-regenerate-id"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // URL Button Configuration
  if (nodeType === 'urlButton') {
    const buttonId = config.buttonId || generateId('url');
    
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="header-text">Header Text (Optional)</Label>
          <Input
            id="header-text"
            placeholder="Header with text"
            value={config.headerText || ''}
            onChange={(e) => updateConfig('headerText', e.target.value)}
            data-testid="input-header-text"
          />
        </div>
        <div>
          <Label htmlFor="body-text">Body Text *</Label>
          <Textarea
            id="body-text"
            placeholder="Body message"
            value={config.bodyText || ''}
            onChange={(e) => updateConfig('bodyText', e.target.value)}
            rows={3}
            data-testid="input-body-text"
          />
        </div>
        <div>
          <Label htmlFor="footer-text">Footer Text (Optional)</Label>
          <Input
            id="footer-text"
            placeholder="Footer message"
            value={config.footerText || ''}
            onChange={(e) => updateConfig('footerText', e.target.value)}
            data-testid="input-footer-text"
          />
        </div>
        <Separator />
        <div>
          <Label htmlFor="button-title">Button Title *</Label>
          <Input
            id="button-title"
            placeholder="Visit Website"
            value={config.buttonTitle || ''}
            onChange={(e) => updateConfig('buttonTitle', e.target.value)}
            maxLength={25}
            data-testid="input-button-title"
          />
        </div>
        <div>
          <Label htmlFor="url">URL *</Label>
          <Input
            id="url"
            placeholder="https://whapi.cloud"
            value={config.url || ''}
            onChange={(e) => updateConfig('url', e.target.value)}
            data-testid="input-url"
          />
        </div>
        <div>
          <Label htmlFor="button-id">Button ID</Label>
          <div className="flex gap-2">
            <Input
              id="button-id"
              placeholder="Button ID"
              value={buttonId}
              onChange={(e) => updateConfig('buttonId', e.target.value)}
              data-testid="input-button-id"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateConfig('buttonId', generateId('url'))}
              title="Generate new ID"
              data-testid="button-regenerate-id"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // Copy/OTP Button Configuration
  if (nodeType === 'copyButton') {
    const buttonId = config.buttonId || generateId('copy');
    
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="header-text">Header Text (Optional)</Label>
          <Input
            id="header-text"
            placeholder="Header with text"
            value={config.headerText || ''}
            onChange={(e) => updateConfig('headerText', e.target.value)}
            data-testid="input-header-text"
          />
        </div>
        <div>
          <Label htmlFor="body-text">Body Text *</Label>
          <Textarea
            id="body-text"
            placeholder="Body message"
            value={config.bodyText || ''}
            onChange={(e) => updateConfig('bodyText', e.target.value)}
            rows={3}
            data-testid="input-body-text"
          />
        </div>
        <div>
          <Label htmlFor="footer-text">Footer Text (Optional)</Label>
          <Input
            id="footer-text"
            placeholder="Footer message"
            value={config.footerText || ''}
            onChange={(e) => updateConfig('footerText', e.target.value)}
            data-testid="input-footer-text"
          />
        </div>
        <Separator />
        <div>
          <Label htmlFor="button-title">Button Title *</Label>
          <Input
            id="button-title"
            placeholder="Copy OTP"
            value={config.buttonTitle || ''}
            onChange={(e) => updateConfig('buttonTitle', e.target.value)}
            maxLength={25}
            data-testid="input-button-title"
          />
        </div>
        <div>
          <Label htmlFor="copy-code">Code to Copy *</Label>
          <Input
            id="copy-code"
            placeholder="65545"
            value={config.copyCode || ''}
            onChange={(e) => updateConfig('copyCode', e.target.value)}
            data-testid="input-copy-code"
          />
        </div>
        <div>
          <Label htmlFor="button-id">Button ID</Label>
          <div className="flex gap-2">
            <Input
              id="button-id"
              placeholder="Button ID"
              value={buttonId}
              onChange={(e) => updateConfig('buttonId', e.target.value)}
              data-testid="input-button-id"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateConfig('buttonId', generateId('copy'))}
              title="Generate new ID"
              data-testid="button-regenerate-id"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // Merged Buttons Configuration (Call + URL mixed)
  if (nodeType === 'buttons') {
    const buttons = config.buttons || [];

    const addButton = () => {
      if (buttons.length >= 3) {
        toast({
          title: 'Maximum buttons reached',
          description: 'Buttons node supports up to 3 buttons',
          variant: 'destructive',
        });
        return;
      }
      updateConfig('buttons', [...buttons, { 
        kind: 'phone_number', 
        title: '', 
        value: '',
        id: generateId('btn') 
      }]);
    };

    const removeButton = (index: number) => {
      const newButtons = buttons.filter((_: any, i: number) => i !== index);
      updateConfig('buttons', newButtons);
    };

    const updateButton = (index: number, field: string, value: string) => {
      const newButtons = [...buttons];
      newButtons[index] = { ...newButtons[index], [field]: value };
      updateConfig('buttons', newButtons);
    };

    const regenerateId = (index: number) => {
      updateButton(index, 'id', generateId('btn'));
    };

    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="header-text">Header Text (Optional)</Label>
          <Input
            id="header-text"
            placeholder="Header with text"
            value={config.headerText || ''}
            onChange={(e) => updateConfig('headerText', e.target.value)}
            data-testid="input-header-text"
          />
        </div>
        <div>
          <Label htmlFor="body-text">Body Text *</Label>
          <Textarea
            id="body-text"
            placeholder="Body message"
            value={config.bodyText || ''}
            onChange={(e) => updateConfig('bodyText', e.target.value)}
            rows={3}
            data-testid="input-body-text"
          />
        </div>
        <div>
          <Label htmlFor="footer-text">Footer Text (Optional)</Label>
          <Input
            id="footer-text"
            placeholder="Footer message"
            value={config.footerText || ''}
            onChange={(e) => updateConfig('footerText', e.target.value)}
            data-testid="input-footer-text"
          />
        </div>
        <Separator />
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Buttons (up to 3)</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={addButton}
              disabled={buttons.length >= 3}
              data-testid="button-add-button"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Button
            </Button>
          </div>
          {buttons.map((button: any, index: number) => (
            <div key={index} className="border rounded-md p-3 mb-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Button {index + 1}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeButton(index)}
                  data-testid={`button-remove-${index}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div>
                <Label htmlFor={`button-${index}-kind`}>Button Type *</Label>
                <Select
                  value={button.kind || 'phone_number'}
                  onValueChange={(val) => updateButton(index, 'kind', val)}
                >
                  <SelectTrigger id={`button-${index}-kind`} data-testid={`select-button-${index}-kind`}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone_number">Phone Call</SelectItem>
                    <SelectItem value="url">URL Link</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor={`button-${index}-title`}>Button Title *</Label>
                <Input
                  id={`button-${index}-title`}
                  placeholder={button.kind === 'url' ? 'Visit Website' : 'Call Us'}
                  value={button.title || ''}
                  onChange={(e) => updateButton(index, 'title', e.target.value)}
                  maxLength={25}
                  data-testid={`input-button-${index}-title`}
                />
              </div>
              <div>
                <Label htmlFor={`button-${index}-value`}>
                  {button.kind === 'url' ? 'URL *' : 'Phone Number *'}
                </Label>
                <Input
                  id={`button-${index}-value`}
                  placeholder={button.kind === 'url' ? 'https://example.com' : '+1234567890'}
                  value={button.value || ''}
                  onChange={(e) => updateButton(index, 'value', e.target.value)}
                  data-testid={`input-button-${index}-value`}
                />
              </div>
              <div>
                <Label htmlFor={`button-${index}-id`}>Button ID</Label>
                <div className="flex gap-2">
                  <Input
                    id={`button-${index}-id`}
                    placeholder="Button ID"
                    value={button.id || ''}
                    onChange={(e) => updateButton(index, 'id', e.target.value)}
                    data-testid={`input-button-${index}-id`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => regenerateId(index)}
                    title="Generate new ID"
                    data-testid={`button-regenerate-${index}-id`}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {buttons.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Click "Add Button" to create buttons
            </p>
          )}
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // End Node: message.text
  if (nodeType === 'message.text') {
    return (
      <div className="space-y-4">
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-4">
          <p className="text-sm text-destructive font-medium">Terminal Node</p>
          <p className="text-xs text-muted-foreground mt-1">
            This message will be sent and the conversation will end. No further routing.
          </p>
        </div>
        <div>
          <Label htmlFor="text">Message Text *</Label>
          <Textarea
            id="text"
            placeholder="Thank you for contacting us!"
            value={config.text || ''}
            onChange={(e) => updateConfig('text', e.target.value)}
            rows={4}
            data-testid="input-text"
          />
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // End Node: message.media
  if (nodeType === 'message.media') {
    return (
      <div className="space-y-4">
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-4">
          <p className="text-sm text-destructive font-medium">Terminal Node</p>
          <p className="text-xs text-muted-foreground mt-1">
            This media message will be sent and the conversation will end.
          </p>
        </div>
        <div>
          <Label htmlFor="media-type">Media Type *</Label>
          <Select
            value={config.mediaType || 'image'}
            onValueChange={(val) => updateConfig('mediaType', val)}
          >
            <SelectTrigger id="media-type" data-testid="select-media-type">
              <SelectValue placeholder="Select media type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="image">Image</SelectItem>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="audio">Audio</SelectItem>
              <SelectItem value="document">Document</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="media-url">Media URL *</Label>
          <Input
            id="media-url"
            placeholder="https://example.com/image.jpg"
            value={config.mediaUrl || ''}
            onChange={(e) => updateConfig('mediaUrl', e.target.value)}
            data-testid="input-media-url"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Direct URL to the media file
          </p>
        </div>
        <div>
          <Label htmlFor="caption">Caption (Optional)</Label>
          <Textarea
            id="caption"
            placeholder="Check out this image!"
            value={config.caption || ''}
            onChange={(e) => updateConfig('caption', e.target.value)}
            rows={2}
            data-testid="input-caption"
          />
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // End Node: message.location
  if (nodeType === 'message.location') {
    return (
      <div className="space-y-4">
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-4">
          <p className="text-sm text-destructive font-medium">Terminal Node</p>
          <p className="text-xs text-muted-foreground mt-1">
            This location will be sent and the conversation will end.
          </p>
        </div>
        <div>
          <Label htmlFor="latitude">Latitude *</Label>
          <Input
            id="latitude"
            placeholder="26.0667"
            value={config.latitude || ''}
            onChange={(e) => updateConfig('latitude', e.target.value)}
            data-testid="input-latitude"
          />
        </div>
        <div>
          <Label htmlFor="longitude">Longitude *</Label>
          <Input
            id="longitude"
            placeholder="50.5577"
            value={config.longitude || ''}
            onChange={(e) => updateConfig('longitude', e.target.value)}
            data-testid="input-longitude"
          />
        </div>
        <div>
          <Label htmlFor="name">Location Name (Optional)</Label>
          <Input
            id="name"
            placeholder="Bahrain Office"
            value={config.name || ''}
            onChange={(e) => updateConfig('name', e.target.value)}
            data-testid="input-location-name"
          />
        </div>
        <div>
          <Label htmlFor="address">Address (Optional)</Label>
          <Textarea
            id="address"
            placeholder="123 Main Street, Manama, Bahrain"
            value={config.address || ''}
            onChange={(e) => updateConfig('address', e.target.value)}
            rows={2}
            data-testid="input-address"
          />
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // Carousel Configuration
  if (nodeType === 'carousel') {
    const cards = config.cards || [];

    const addCard = () => {
      if (cards.length >= 10) {
        toast({
          title: 'Maximum cards reached',
          description: 'Carousel supports up to 10 cards',
          variant: 'destructive',
        });
        return;
      }
      updateConfig('cards', [
        ...cards,
        {
          id: generateId('card'),
          media: '',
          text: '',
          buttons: [],
        },
      ]);
    };

    const removeCard = (index: number) => {
      const newCards = cards.filter((_: any, i: number) => i !== index);
      updateConfig('cards', newCards);
    };

    const updateCard = (cIndex: number, field: string, value: any) => {
      const newCards = [...cards];
      newCards[cIndex] = { ...newCards[cIndex], [field]: value };
      updateConfig('cards', newCards);
    };

    const addCardButton = (cIndex: number, buttonType: 'quick_reply' | 'url') => {
      const newCards = [...cards];
      const buttons = [...(newCards[cIndex].buttons || [])];
      if (buttonType === 'quick_reply') {
        buttons.push({ type: 'quick_reply', title: '', id: generateId('btn') });
      } else {
        buttons.push({ type: 'url', title: '', id: generateId('url'), url: '' });
      }
      newCards[cIndex] = { ...newCards[cIndex], buttons };
      updateConfig('cards', newCards);
    };

    const removeCardButton = (cIndex: number, bIndex: number) => {
      const newCards = [...cards];
      const buttons = (newCards[cIndex].buttons || []).filter((_: any, i: number) => i !== bIndex);
      newCards[cIndex] = { ...newCards[cIndex], buttons };
      updateConfig('cards', newCards);
    };

    const updateCardButton = (cIndex: number, bIndex: number, field: string, value: string) => {
      const newCards = [...cards];
      const buttons = [...(newCards[cIndex].buttons || [])];
      buttons[bIndex] = { ...buttons[bIndex], [field]: value };
      newCards[cIndex] = { ...newCards[cIndex], buttons };
      updateConfig('cards', newCards);
    };

    const regenerateCardId = (cIndex: number) => {
      updateCard(cIndex, 'id', generateId('card'));
    };

    const regenerateCardButtonId = (cIndex: number, bIndex: number) => {
      updateCardButton(cIndex, bIndex, 'id', generateId('btn'));
    };

    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="body-text">Introduction Text *</Label>
          <Textarea
            id="body-text"
            placeholder="Hey, we're having a big sale today!"
            value={config.bodyText || ''}
            onChange={(e) => updateConfig('bodyText', e.target.value)}
            rows={2}
            data-testid="input-body-text"
          />
        </div>
        <Separator />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Carousel Cards (Up to 10)</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={addCard}
              disabled={cards.length >= 10}
              data-testid="button-add-card"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Card
            </Button>
          </div>
          {cards.map((card: any, cIndex: number) => (
            <div key={cIndex} className="p-3 border rounded-lg space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Card {cIndex + 1}</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeCard(cIndex)}
                  data-testid={`button-remove-card-${cIndex}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div>
                <Label className="text-xs">Card ID</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="Card ID"
                    value={card.id || ''}
                    onChange={(e) => updateCard(cIndex, 'id', e.target.value)}
                    data-testid={`input-card-${cIndex}-id`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => regenerateCardId(cIndex)}
                    title="Generate new ID"
                    data-testid={`button-regenerate-card-${cIndex}-id`}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Media URL (Image/Video)</Label>
                <Input
                  placeholder="https://example.com/image.jpg"
                  value={card.media || ''}
                  onChange={(e) => updateCard(cIndex, 'media', e.target.value)}
                  data-testid={`input-card-${cIndex}-media`}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Card Text</Label>
                <Textarea
                  placeholder="Card description text"
                  value={card.text || ''}
                  onChange={(e) => updateCard(cIndex, 'text', e.target.value)}
                  rows={2}
                  data-testid={`input-card-${cIndex}-text`}
                  className="mt-1"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Buttons</Label>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addCardButton(cIndex, 'quick_reply')}
                      data-testid={`button-add-card-${cIndex}-quick-reply`}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Quick Reply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addCardButton(cIndex, 'url')}
                      data-testid={`button-add-card-${cIndex}-url`}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      URL
                    </Button>
                  </div>
                </div>
                {(card.buttons || []).map((button: any, bIndex: number) => (
                  <div key={bIndex} className="p-2 border rounded-md bg-background space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">
                        {button.type === 'quick_reply' ? 'Quick Reply' : 'URL'} Button {bIndex + 1}
                      </Label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeCardButton(cIndex, bIndex)}
                        data-testid={`button-remove-card-${cIndex}-button-${bIndex}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Button Title"
                      value={button.title || ''}
                      onChange={(e) => updateCardButton(cIndex, bIndex, 'title', e.target.value)}
                      maxLength={25}
                      data-testid={`input-card-${cIndex}-button-${bIndex}-title`}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Button ID"
                        value={button.id || ''}
                        onChange={(e) => updateCardButton(cIndex, bIndex, 'id', e.target.value)}
                        data-testid={`input-card-${cIndex}-button-${bIndex}-id`}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => regenerateCardButtonId(cIndex, bIndex)}
                        title="Generate new ID"
                        data-testid={`button-regenerate-card-${cIndex}-button-${bIndex}-id`}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    {button.type === 'url' && (
                      <Input
                        placeholder="URL"
                        value={button.url || ''}
                        onChange={(e) => updateCardButton(cIndex, bIndex, 'url', e.target.value)}
                        data-testid={`input-card-${cIndex}-button-${bIndex}-url`}
                      />
                    )}
                  </div>
                ))}
                {(card.buttons || []).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Click "Quick Reply" or "URL" to add buttons
                  </p>
                )}
              </div>
            </div>
          ))}
          {cards.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Click "Add Card" to create carousel cards
            </p>
          )}
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // HTTP Request Node Configuration
  if (nodeType === 'httpRequest') {
    const headers = config.headers || [];
    const queryParams = config.queryParams || [];
    const responseMapping = config.responseMapping || [];

    const addHeader = () => {
      updateConfig('headers', [...headers, { name: '', value: '' }]);
    };

    const removeHeader = (index: number) => {
      updateConfig('headers', headers.filter((_: any, i: number) => i !== index));
    };

    const updateHeader = (index: number, field: string, value: string) => {
      const newHeaders = [...headers];
      newHeaders[index] = { ...newHeaders[index], [field]: value };
      updateConfig('headers', newHeaders);
    };

    const addQueryParam = () => {
      updateConfig('queryParams', [...queryParams, { name: '', value: '' }]);
    };

    const removeQueryParam = (index: number) => {
      updateConfig('queryParams', queryParams.filter((_: any, i: number) => i !== index));
    };

    const updateQueryParam = (index: number, field: string, value: string) => {
      const newParams = [...queryParams];
      newParams[index] = { ...newParams[index], [field]: value };
      updateConfig('queryParams', newParams);
    };

    const addResponseMapping = () => {
      updateConfig('responseMapping', [...responseMapping, { jsonPath: '', variableName: '' }]);
    };

    const removeResponseMapping = (index: number) => {
      updateConfig('responseMapping', responseMapping.filter((_: any, i: number) => i !== index));
    };

    const updateResponseMapping = (index: number, field: string, value: string) => {
      const newMapping = [...responseMapping];
      newMapping[index] = { ...newMapping[index], [field]: value };
      updateConfig('responseMapping', newMapping);
    };

    return (
      <div className="space-y-4">
        {/* HTTP Method */}
        <div>
          <Label htmlFor="method">HTTP Method *</Label>
          <Select
            value={config.method || 'GET'}
            onValueChange={(value) => updateConfig('method', value)}
          >
            <SelectTrigger id="method" data-testid="select-http-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
              <SelectItem value="PATCH">PATCH</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* URL */}
        <div>
          <Label htmlFor="url">URL *</Label>
          <Input
            id="url"
            placeholder="https://api.example.com/endpoint"
            value={config.url || ''}
            onChange={(e) => updateConfig('url', e.target.value)}
            data-testid="input-http-url"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use {`{{variableName}}`} for variable substitution
          </p>
        </div>

        {/* Authentication */}
        <Separator />
        <div>
          <Label htmlFor="auth-type">Authentication</Label>
          <Select
            value={config.authType || 'none'}
            onValueChange={(value) => updateConfig('authType', value)}
          >
            <SelectTrigger id="auth-type" data-testid="select-auth-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="bearer">Bearer Token</SelectItem>
              <SelectItem value="basic">Basic Auth</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {config.authType === 'bearer' && (
          <div>
            <Label htmlFor="bearer-token">Bearer Token *</Label>
            <Input
              id="bearer-token"
              type="password"
              placeholder="your_bearer_token"
              value={config.bearerToken || ''}
              onChange={(e) => updateConfig('bearerToken', e.target.value)}
              data-testid="input-bearer-token"
            />
          </div>
        )}

        {config.authType === 'basic' && (
          <>
            <div>
              <Label htmlFor="basic-username">Username *</Label>
              <Input
                id="basic-username"
                placeholder="username"
                value={config.basicUsername || ''}
                onChange={(e) => updateConfig('basicUsername', e.target.value)}
                data-testid="input-basic-username"
              />
            </div>
            <div>
              <Label htmlFor="basic-password">Password *</Label>
              <Input
                id="basic-password"
                type="password"
                placeholder="password"
                value={config.basicPassword || ''}
                onChange={(e) => updateConfig('basicPassword', e.target.value)}
                data-testid="input-basic-password"
              />
            </div>
          </>
        )}

        {/* Query Parameters */}
        <Separator />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Query Parameters</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={addQueryParam}
              data-testid="button-add-query-param"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Parameter
            </Button>
          </div>
          {queryParams.map((param: any, index: number) => (
            <div key={index} className="flex gap-2">
              <Input
                placeholder="Parameter Name"
                value={param.name || ''}
                onChange={(e) => updateQueryParam(index, 'name', e.target.value)}
                data-testid={`input-query-param-${index}-name`}
              />
              <Input
                placeholder="Value"
                value={param.value || ''}
                onChange={(e) => updateQueryParam(index, 'value', e.target.value)}
                data-testid={`input-query-param-${index}-value`}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeQueryParam(index)}
                data-testid={`button-remove-query-param-${index}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Headers */}
        <Separator />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Headers</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={addHeader}
              data-testid="button-add-header"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Header
            </Button>
          </div>
          {headers.map((header: any, index: number) => (
            <div key={index} className="flex gap-2">
              <Input
                placeholder="Header Name"
                value={header.name || ''}
                onChange={(e) => updateHeader(index, 'name', e.target.value)}
                data-testid={`input-header-${index}-name`}
              />
              <Input
                placeholder="Value"
                value={header.value || ''}
                onChange={(e) => updateHeader(index, 'value', e.target.value)}
                data-testid={`input-header-${index}-value`}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeHeader(index)}
                data-testid={`button-remove-header-${index}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Request Body (for POST/PUT/PATCH) */}
        {['POST', 'PUT', 'PATCH'].includes(config.method) && (
          <>
            <Separator />
            <div>
              <Label htmlFor="body-content-type">Body Content Type</Label>
              <Select
                value={config.bodyContentType || 'json'}
                onValueChange={(value) => updateConfig('bodyContentType', value)}
              >
                <SelectTrigger id="body-content-type" data-testid="select-body-content-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="form">Form Data</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="body">Request Body</Label>
              <Textarea
                id="body"
                placeholder={config.bodyContentType === 'json' ? '{"key": "value"}' : 'key1=value1&key2=value2'}
                value={config.body || ''}
                onChange={(e) => updateConfig('body', e.target.value)}
                rows={5}
                data-testid="input-body"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {`{{variableName}}`} for variable substitution
              </p>
            </div>
          </>
        )}

        {/* Response Mapping */}
        <Separator />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Response Mapping</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={addResponseMapping}
              data-testid="button-add-response-mapping"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Mapping
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Map JSON response fields to variables for use in next nodes
          </p>
          {responseMapping.map((mapping: any, index: number) => (
            <div key={index} className="flex gap-2">
              <Input
                placeholder="JSON Path (e.g., data.user.id)"
                value={mapping.jsonPath || ''}
                onChange={(e) => updateResponseMapping(index, 'jsonPath', e.target.value)}
                data-testid={`input-mapping-${index}-jsonpath`}
              />
              <Input
                placeholder="Variable Name"
                value={mapping.variableName || ''}
                onChange={(e) => updateResponseMapping(index, 'variableName', e.target.value)}
                data-testid={`input-mapping-${index}-variable`}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeResponseMapping(index)}
                data-testid={`button-remove-mapping-${index}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Timeout */}
        <Separator />
        <div>
          <Label htmlFor="timeout">Timeout (seconds)</Label>
          <Input
            id="timeout"
            type="number"
            placeholder="30"
            value={config.timeout || '30'}
            onChange={(e) => updateConfig('timeout', e.target.value)}
            data-testid="input-timeout"
          />
        </div>

        <p className="text-xs text-amber-600 mt-4">
          Note: HTTP requests will have a success path (2xx responses) and an error path (non-2xx or network errors). Connect both paths to handle all scenarios.
        </p>
      </div>
    );
  }

  // Default fallback
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select a node type to configure its message settings.
      </p>
    </div>
  );
}
