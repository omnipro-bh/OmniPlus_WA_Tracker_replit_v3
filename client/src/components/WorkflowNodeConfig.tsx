import { Node } from '@xyflow/react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TestTube, Plus, X, RefreshCw, Database, ChevronDown } from 'lucide-react';
import { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import { RESERVED_CONTEXT_KEYS, VARIABLE_NAME_RE, VARIABLE_PATH_RE } from '@shared/workflow-validation';
import { AI_DEFAULT_SYSTEM_PROMPT, AI_SHEET_TAB_SCHEMA } from '@shared/ai-defaults';

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
  
  // HTTP Request test states
  const [httpTestDialogOpen, setHttpTestDialogOpen] = useState(false);
  const [isTestingHttp, setIsTestingHttp] = useState(false);
  const [httpTestResult, setHttpTestResult] = useState<any>(null);

  // Google Sheets test states
  const [sheetsTestDialogOpen, setSheetsTestDialogOpen] = useState(false);
  const [isTestingSheets, setIsTestingSheets] = useState(false);
  const [sheetsTestResult, setSheetsTestResult] = useState<any>(null);

  // AI Agent test states
  const [aiTestDialogOpen, setAiTestDialogOpen] = useState(false);
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<any>(null);
  const [aiTestMessage, setAiTestMessage] = useState('Hello! What are your opening hours?');

  // Fetch active channels for test functionality
  const { data: channels = [] } = useQuery<any[]>({
    queryKey: ['/api/channels'],
    enabled: testDialogOpen,
  });

  // Fetch booking services for book_appointment nodes
  const { data: bookingServices = [] } = useQuery<any[]>({
    queryKey: ['/api/booking/services'],
    enabled: nodeType === 'booking.book_appointment' || nodeType === 'booking.check_bookings',
  });

  // Filter for ACTIVE and AUTHORIZED channels only
  const activeChannels = channels.filter(
    (ch) => ch.status === 'ACTIVE' && ch.authStatus === 'AUTHORIZED'
  );

  const updateConfig = (key: string, value: any) => {
    onUpdate(node.id, { ...config, [key]: value });
  };

  // Capture Settings state - managed in parent to avoid nested component hook issues
  const [captureSettingsOpen, setCaptureSettingsOpen] = useState(
    config.isCaptureStart || config.isCaptureEnd || false
  );
  
  // Interactive node types that can have capture settings
  const captureEligibleTypes = [
    'quickReply', 'quickReplyImage', 'quickReplyVideo', 
    'listMessage', 'buttons', 'carousel'
  ];
  
  const isCaptureEligible = captureEligibleTypes.includes(nodeType);

  const handleStartCaptureToggle = (checked: boolean) => {
    if (checked) {
      onUpdate(node.id, { ...config, isCaptureStart: true, isCaptureEnd: false });
    } else {
      onUpdate(node.id, { ...config, isCaptureStart: false, captureSequenceName: '' });
    }
  };

  const handleEndCaptureToggle = (checked: boolean) => {
    if (checked) {
      onUpdate(node.id, { ...config, isCaptureEnd: true, isCaptureStart: false, captureSequenceName: '' });
    } else {
      onUpdate(node.id, { ...config, isCaptureEnd: false });
    }
  };

  // Capture Settings Section JSX - for data collection workflows
  const captureSettingsJsx = isCaptureEligible ? (
    <>
      <Collapsible open={captureSettingsOpen} onOpenChange={setCaptureSettingsOpen}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="outline" 
            className="w-full justify-between"
            data-testid="button-capture-settings-toggle"
          >
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span>Capture Settings</span>
              {(config.isCaptureStart || config.isCaptureEnd) && (
                <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                  {config.isCaptureStart ? 'Start' : 'End'}
                </span>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${captureSettingsOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-3">
          <div className="p-3 border rounded-lg space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <Label htmlFor="start-capture" className="text-sm">Start Capture</Label>
              <Switch
                id="start-capture"
                checked={config.isCaptureStart || false}
                onCheckedChange={handleStartCaptureToggle}
                data-testid="switch-start-capture"
              />
            </div>
            
            {config.isCaptureStart && (
              <div>
                <Label htmlFor="capture-sequence-name" className="text-sm">Sequence Name *</Label>
                <Input
                  id="capture-sequence-name"
                  placeholder="e.g., Medical Follow-Up"
                  value={config.captureSequenceName || ''}
                  onChange={(e) => updateConfig('captureSequenceName', e.target.value)}
                  data-testid="input-capture-sequence-name"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This name identifies the capture sequence in your data collection
                </p>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <Label htmlFor="end-capture" className="text-sm">End Capture</Label>
              <Switch
                id="end-capture"
                checked={config.isCaptureEnd || false}
                onCheckedChange={handleEndCaptureToggle}
                data-testid="switch-end-capture"
              />
            </div>
            
            {config.isCaptureEnd && (
              <p className="text-xs text-amber-600">
                This node ends the capture. User must click a button with text "Save" or "حفظ" to save the collected data.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
      <Separator />
    </>
  ) : null;

  const handleTestHttpRequest = async () => {
    if (!config.url) {
      toast({
        title: 'URL required',
        description: 'Please enter a URL to test',
        variant: 'destructive',
      });
      return;
    }

    setIsTestingHttp(true);
    setHttpTestResult(null);

    try {
      const res = await apiRequest('POST', '/api/workflows/test-http-request', {
        config: {
          method: config.method || 'GET',
          url: config.url,
          authType: config.authType || 'none',
          bearerToken: config.bearerToken,
          basicUsername: config.basicUsername,
          basicPassword: config.basicPassword,
          headers: config.headers || [],
          queryParams: config.queryParams || [],
          bodyContentType: config.bodyContentType || 'json',
          body: config.body,
          responseMapping: config.responseMapping || [],
          timeout: (parseInt(config.timeout) || 30) * 1000, // Convert UI seconds to backend milliseconds
        },
        testContext: {}, // Empty context for testing
      });
      const result: any = await res.json();

      setHttpTestResult(result);
      setHttpTestDialogOpen(true);

      if (result.success) {
        toast({
          title: 'Test successful',
          description: `HTTP ${config.method || 'GET'} request completed with status ${result.status}`,
        });
      } else {
        toast({
          title: 'Test failed',
          description: result.error || 'HTTP request failed',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      setHttpTestResult({
        success: false,
        error: error.message || 'Failed to test HTTP request',
      });
      setHttpTestDialogOpen(true);
      toast({
        title: 'Test error',
        description: error.message || 'Failed to test HTTP request',
        variant: 'destructive',
      });
    } finally {
      setIsTestingHttp(false);
    }
  };

  const handleTestGoogleSheets = async () => {
    if (!config.spreadsheetId) {
      toast({
        title: 'Spreadsheet ID required',
        description: 'Please enter a spreadsheet ID to test',
        variant: 'destructive',
      });
      return;
    }

    setIsTestingSheets(true);
    setSheetsTestResult(null);

    try {
      const res = await apiRequest('POST', '/api/workflows/test-google-sheets', {
        config: {
          operation: config.operation || 'read',
          spreadsheetId: config.spreadsheetId,
          range: config.range,
          lookupKey: config.lookupKey,
          lookupColumn: config.lookupColumn,
          returnColumn: config.returnColumn,
          returnVariable: config.returnVariable,
          returnMappings: config.returnMappings || [],
          dataMapping: config.dataMapping || [],
        },
        testContext: {}, // Empty context for testing
      });
      const result: any = await res.json();

      setSheetsTestResult(result);
      setSheetsTestDialogOpen(true);

      if (result.success) {
        toast({
          title: 'Test successful',
          description: `Google Sheets ${config.operation || 'read'} operation completed`,
        });
      } else {
        toast({
          title: 'Test failed',
          description: result.error || 'Google Sheets operation failed',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      setSheetsTestResult({
        success: false,
        error: error.message || 'Failed to test Google Sheets node',
      });
      setSheetsTestDialogOpen(true);
      toast({
        title: 'Test error',
        description: error.message || 'Failed to test Google Sheets node',
        variant: 'destructive',
      });
    } finally {
      setIsTestingSheets(false);
    }
  };

  const handleTestAi = async () => {
    setIsTestingAi(true);
    setAiTestResult(null);

    try {
      const res = await apiRequest('POST', '/api/workflows/test-ai', {
        config: {
          provider: config.provider || 'deepseek',
          model: config.model,
          systemPrompt: config.systemPrompt,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          historyLimit: config.historyLimit,
          responseVariable: config.responseVariable,
        },
        testContext: {},
        message: aiTestMessage,
      });
      const result: any = await res.json();

      setAiTestResult(result);
      setAiTestDialogOpen(true);

      if (result.success) {
        toast({
          title: 'Test successful',
          description: `${result.provider} answered in ${result.latencyMs} ms`,
        });
      } else {
        toast({
          title: 'Test failed',
          description: result.error || 'AI provider call failed',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      setAiTestResult({
        success: false,
        error: error.message || 'Failed to test AI Agent node',
      });
      setAiTestDialogOpen(true);
      toast({
        title: 'Test error',
        description: error.message || 'Failed to test AI Agent node',
        variant: 'destructive',
      });
    } finally {
      setIsTestingAi(false);
    }
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
        {captureSettingsJsx}
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
        {captureSettingsJsx}
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
        {captureSettingsJsx}
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
        {captureSettingsJsx}
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
        {captureSettingsJsx}
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
        {captureSettingsJsx}
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
  if (nodeType === 'action.http_request') {
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

        {/* Request Body */}
        <Separator />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enable-body">Request Body</Label>
              <p className="text-xs text-muted-foreground">
                Send data in the request body (for POST/PUT/PATCH)
              </p>
            </div>
            <Switch
              id="enable-body"
              checked={config.enableBody || false}
              onCheckedChange={(checked) => updateConfig('enableBody', checked)}
              data-testid="switch-enable-body"
            />
          </div>

          {config.enableBody && (
            <>
              <div>
                <Label htmlFor="body-content-type">Body Type</Label>
                <Select
                  value={config.bodyContentType || 'json'}
                  onValueChange={(value) => updateConfig('bodyContentType', value)}
                >
                  <SelectTrigger id="body-content-type" data-testid="select-body-content-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="raw">Raw</SelectItem>
                    <SelectItem value="form-data">Multipart/form-data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="body">Body Content</Label>
                <Textarea
                  id="body"
                  placeholder={
                    config.bodyContentType === 'json' 
                      ? '{\n  "key": "value",\n  "name": "{{userName}}"\n}' 
                      : config.bodyContentType === 'raw'
                      ? 'Raw text content with {{variables}}'
                      : 'field1=value1&field2={{variable2}}'
                  }
                  value={config.body || ''}
                  onChange={(e) => updateConfig('body', e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                  data-testid="input-body"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use <code className="bg-muted px-1 py-0.5 rounded">{'{{variableName}}'}</code> for variable substitution
                </p>
              </div>
            </>
          )}
        </div>

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

        {/* Test Button */}
        <Separator />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleTestHttpRequest}
            disabled={isTestingHttp || !config.url}
            data-testid="button-test-http-request"
            className="w-full"
          >
            {isTestingHttp ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <TestTube className="h-4 w-4 mr-2" />
                Test Request
              </>
            )}
          </Button>
        </div>

        {/* Test Results Dialog */}
        <Dialog open={httpTestDialogOpen} onOpenChange={setHttpTestDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>HTTP Test Results</DialogTitle>
              <DialogDescription>
                {httpTestResult?.success ? 'Request completed successfully' : 'Request failed'}
              </DialogDescription>
            </DialogHeader>
            
            {httpTestResult && (
              <div className="space-y-4">
                {/* Status */}
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div className={`text-sm p-2 rounded border ${
                    httpTestResult.success 
                      ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' 
                      : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  }`}>
                    {httpTestResult.success ? (
                      <>✓ Success - {httpTestResult.status} {httpTestResult.statusText}</>
                    ) : (
                      <>✗ Failed - {httpTestResult.error}</>
                    )}
                  </div>
                </div>

                {/* Response Data */}
                {httpTestResult.data && (
                  <div>
                    <Label className="text-sm font-medium">Response Data</Label>
                    <pre className="text-xs p-3 bg-muted rounded border overflow-x-auto">
                      {JSON.stringify(httpTestResult.data, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Mapped Variables */}
                {httpTestResult.mappedVariables && Object.keys(httpTestResult.mappedVariables).length > 0 && (
                  <div>
                    <Label className="text-sm font-medium">Mapped Variables</Label>
                    <pre className="text-xs p-3 bg-muted rounded border overflow-x-auto">
                      {JSON.stringify(httpTestResult.mappedVariables, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Error Details */}
                {httpTestResult.error && (
                  <div>
                    <Label className="text-sm font-medium text-destructive">Error</Label>
                    <div className="text-sm p-3 bg-destructive/10 rounded border border-destructive/20 text-destructive">
                      {httpTestResult.error}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <p className="text-xs text-amber-600 mt-4">
          Note: HTTP requests will have a success path (2xx responses) and an error path (non-2xx or network errors). Connect both paths to handle all scenarios.
        </p>
      </div>
    );
  }

  // Google Sheets Node Configuration
  if (nodeType === 'action.google_sheets') {
    const dataMapping = config.dataMapping || [];
    const operation = config.operation || 'read';

    const addMapping = () => {
      updateConfig('dataMapping', [...dataMapping, { column: '', value: '' }]);
    };

    const removeMapping = (index: number) => {
      updateConfig('dataMapping', dataMapping.filter((_: any, i: number) => i !== index));
    };

    const updateMapping = (index: number, field: string, value: string) => {
      const newMapping = [...dataMapping];
      newMapping[index] = { ...newMapping[index], [field]: value };
      updateConfig('dataMapping', newMapping);
    };

    const returnMappings = config.returnMappings || [];

    const addReturnMapping = () => {
      updateConfig('returnMappings', [...returnMappings, { column: '', variable: '' }]);
    };

    const removeReturnMapping = (index: number) => {
      updateConfig('returnMappings', returnMappings.filter((_: any, i: number) => i !== index));
    };

    const updateReturnMapping = (index: number, field: string, value: string) => {
      const newMapping = [...returnMappings];
      newMapping[index] = { ...newMapping[index], [field]: value };
      updateConfig('returnMappings', newMapping);
    };

    return (
      <div className="space-y-4">
        {/* Operation */}
        <div>
          <Label htmlFor="sheets-operation">Operation *</Label>
          <Select
            value={operation}
            onValueChange={(value) => updateConfig('operation', value)}
          >
            <SelectTrigger id="sheets-operation" data-testid="select-sheets-operation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read">Read / Lookup</SelectItem>
              <SelectItem value="append">Append Row</SelectItem>
              <SelectItem value="update">Update Row</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Spreadsheet ID */}
        <div>
          <Label htmlFor="spreadsheet-id">Spreadsheet ID *</Label>
          <Input
            id="spreadsheet-id"
            placeholder="1c9aMFP34N20EtG2SeZy4jK5dMGlSa2eIZyWk4"
            value={config.spreadsheetId || ''}
            onChange={(e) => updateConfig('spreadsheetId', e.target.value)}
            data-testid="input-sheets-spreadsheet-id"
          />
          <p className="text-xs text-muted-foreground mt-1">
            From the sheet URL: /d/[id]/edit. The sheet must be shared with the service account.
          </p>
        </div>

        {/* Range */}
        <div>
          <Label htmlFor="sheets-range">Range *</Label>
          <Input
            id="sheets-range"
            placeholder="Sheet1!A:F"
            value={config.range || ''}
            onChange={(e) => updateConfig('range', e.target.value)}
            data-testid="input-sheets-range"
          />
          <p className="text-xs text-muted-foreground mt-1">
            A1 notation, e.g. <code className="bg-muted px-1 py-0.5 rounded">Sheet1!A:F</code>
          </p>
        </div>

        {/* Lookup fields (read + update) */}
        {(operation === 'read' || operation === 'update') && (
          <>
            <Separator />
            <div>
              <Label htmlFor="lookup-column">Lookup Column *</Label>
              <Input
                id="lookup-column"
                placeholder="A (or header name, e.g. Student ID)"
                value={config.lookupColumn || ''}
                onChange={(e) => updateConfig('lookupColumn', e.target.value)}
                data-testid="input-sheets-lookup-column"
              />
            </div>
            <div>
              <Label htmlFor="lookup-key">Lookup Key *</Label>
              <Input
                id="lookup-key"
                placeholder="12345 or {{studentId}}"
                value={config.lookupKey || ''}
                onChange={(e) => updateConfig('lookupKey', e.target.value)}
                data-testid="input-sheets-lookup-key"
              />
            </div>
          </>
        )}

        {/* Return fields (read only) */}
        {operation === 'read' && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Return Mappings</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addReturnMapping}
                  data-testid="button-add-sheets-return-mapping"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Mapping
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Map multiple columns to context variables for use in later nodes.
              </p>
              {returnMappings.map((mapping: any, index: number) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Column (e.g. A)"
                    value={mapping.column || ''}
                    onChange={(e) => updateReturnMapping(index, 'column', e.target.value)}
                    data-testid={`input-sheets-return-mapping-${index}-column`}
                  />
                  <Input
                    placeholder="Variable (e.g. fees)"
                    value={mapping.variable || ''}
                    onChange={(e) => updateReturnMapping(index, 'variable', e.target.value)}
                    data-testid={`input-sheets-return-mapping-${index}-variable`}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeReturnMapping(index)}
                    data-testid={`button-remove-sheets-return-mapping-${index}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Separator />
            <p className="text-xs text-amber-600">
              Legacy single-column return (kept for old workflows — prefer Return Mappings above).
            </p>
            <div>
              <Label htmlFor="return-column">Return Column (legacy)</Label>
              <Input
                id="return-column"
                placeholder="B (or header name, e.g. Fees)"
                value={config.returnColumn || ''}
                onChange={(e) => updateConfig('returnColumn', e.target.value)}
                data-testid="input-sheets-return-column"
              />
            </div>
            <div>
              <Label htmlFor="return-variable">Return Variable (legacy)</Label>
              <Input
                id="return-variable"
                placeholder="fees"
                value={config.returnVariable || ''}
                onChange={(e) => updateConfig('returnVariable', e.target.value)}
                data-testid="input-sheets-return-variable"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Store the returned value in this context variable for use in later nodes.
              </p>
            </div>
          </>
        )}

        {/* Data mapping (append + update) */}
        {(operation === 'append' || operation === 'update') && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Column Mapping</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addMapping}
                  data-testid="button-add-sheets-mapping"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Column
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Map columns to values. Use {`{{variableName}}`} for variable substitution.
              </p>
              {dataMapping.map((mapping: any, index: number) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Column (e.g. A)"
                    value={mapping.column || ''}
                    onChange={(e) => updateMapping(index, 'column', e.target.value)}
                    data-testid={`input-sheets-mapping-${index}-column`}
                  />
                  <Input
                    placeholder="Value"
                    value={mapping.value || ''}
                    onChange={(e) => updateMapping(index, 'value', e.target.value)}
                    data-testid={`input-sheets-mapping-${index}-value`}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeMapping(index)}
                    data-testid={`button-remove-sheets-mapping-${index}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Test Button */}
        <Separator />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleTestGoogleSheets}
            disabled={isTestingSheets || !config.spreadsheetId}
            data-testid="button-test-google-sheets"
            className="w-full"
          >
            {isTestingSheets ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <TestTube className="h-4 w-4 mr-2" />
                Test Operation
              </>
            )}
          </Button>
        </div>

        {/* Test Results Dialog */}
        <Dialog open={sheetsTestDialogOpen} onOpenChange={setSheetsTestDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Google Sheets Test Results</DialogTitle>
              <DialogDescription>
                {sheetsTestResult?.success ? 'Operation completed successfully' : 'Operation failed'}
              </DialogDescription>
            </DialogHeader>

            {sheetsTestResult && (
              <div className="space-y-4">
                {/* Status */}
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div className={`text-sm p-2 rounded border ${
                    sheetsTestResult.success
                      ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                      : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  }`}>
                    {sheetsTestResult.success ? (
                      <>✓ Success - {sheetsTestResult.operation}</>
                    ) : (
                      <>✗ Failed - {sheetsTestResult.error}</>
                    )}
                  </div>
                </div>

                {/* Row index */}
                {sheetsTestResult.rowIndex && (
                  <div>
                    <Label className="text-sm font-medium">Row</Label>
                    <div className="text-sm">{sheetsTestResult.rowIndex}</div>
                  </div>
                )}

                {/* Result Data */}
                {sheetsTestResult.data !== undefined && sheetsTestResult.data !== null && (
                  <div>
                    <Label className="text-sm font-medium">Result Data</Label>
                    <pre className="text-xs p-3 bg-muted rounded border overflow-x-auto">
                      {JSON.stringify(sheetsTestResult.data, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Mapped Variables */}
                {sheetsTestResult.mappedVariables && Object.keys(sheetsTestResult.mappedVariables).length > 0 && (
                  <div>
                    <Label className="text-sm font-medium">Mapped Variables</Label>
                    <pre className="text-xs p-3 bg-muted rounded border overflow-x-auto">
                      {JSON.stringify(sheetsTestResult.mappedVariables, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Error Details */}
                {sheetsTestResult.error && (
                  <div>
                    <Label className="text-sm font-medium text-destructive">Error</Label>
                    <div className="text-sm p-3 bg-destructive/10 rounded border border-destructive/20 text-destructive">
                      {sheetsTestResult.error}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <p className="text-xs text-amber-600 mt-4">
          Note: Google Sheets nodes have a success path and an error path (API errors or a lookup with no match). Connect both paths to handle all scenarios.
        </p>
      </div>
    );
  }

  // AI Agent Node Configuration (Phase 1: DeepSeek + Groq + Mock, no tools)
  if (nodeType === 'action.ai_agent') {
    const provider = config.provider || 'deepseek';
    const temperature = typeof config.temperature === 'number' ? config.temperature : 0.7;
    const modelPlaceholder =
      provider === 'groq'
        ? 'qwen/qwen3.8-27b'
        : provider === 'mock'
          ? 'mock-model'
          : 'deepseek-flash';

    // Phase 2: declared button slots (send_buttons) and handover departments.
    // Stored as `buttons` / `handoverDepartments` — the exact keys the executor reads.
    const aiButtons = config.buttons || [];
    const aiDepartments = config.handoverDepartments || [];

    const addAiButton = () => {
      if (aiButtons.length >= 3) {
        toast({
          title: 'Maximum buttons reached',
          description: 'AI Agent supports up to 3 buttons',
          variant: 'destructive',
        });
        return;
      }
      updateConfig('buttons', [...aiButtons, { title: '', id: generateId('btn') }]);
    };
    const removeAiButton = (index: number) => {
      updateConfig('buttons', aiButtons.filter((_: any, i: number) => i !== index));
    };
    const updateAiButton = (index: number, field: string, value: string) => {
      const next = [...aiButtons];
      next[index] = { ...next[index], [field]: value };
      updateConfig('buttons', next);
    };
    const regenerateAiButtonId = (index: number) => updateAiButton(index, 'id', generateId('btn'));

    const addAiDepartment = () => {
      updateConfig('handoverDepartments', [...aiDepartments, { title: '', id: generateId('dept') }]);
    };
    const removeAiDepartment = (index: number) => {
      updateConfig('handoverDepartments', aiDepartments.filter((_: any, i: number) => i !== index));
    };
    const updateAiDepartment = (index: number, field: string, value: string) => {
      const next = [...aiDepartments];
      next[index] = { ...next[index], [field]: value };
      updateConfig('handoverDepartments', next);
    };
    const regenerateAiDepartmentId = (index: number) => updateAiDepartment(index, 'id', generateId('dept'));

    // Phase 2.5: declared list rows (send_list). Same affordance as buttons, for
    // 4–10 options; the AI chooses buttons vs list. Stored as `listRows`.
    const aiListRows = config.listRows || [];

    const addAiListRow = () => {
      if (aiListRows.length >= 10) {
        toast({
          title: 'Maximum rows reached',
          description: 'AI Agent supports up to 10 list rows',
          variant: 'destructive',
        });
        return;
      }
      updateConfig('listRows', [
        ...aiListRows,
        { title: '', description: '', id: generateId('row') },
      ]);
    };
    const removeAiListRow = (index: number) => {
      updateConfig('listRows', aiListRows.filter((_: any, i: number) => i !== index));
    };
    const updateAiListRow = (index: number, field: string, value: string) => {
      const next = [...aiListRows];
      next[index] = { ...next[index], [field]: value };
      updateConfig('listRows', next);
    };
    const regenerateAiListRowId = (index: number) => updateAiListRow(index, 'id', generateId('row'));

    // Phase 3: schedule / usage limits / message cap.
    const aiSchedule = config.aiSchedule || {};
    const aiScheduleDays: number[] = Array.isArray(aiSchedule.daysOfWeek)
      ? aiSchedule.daysOfWeek
      : [];
    const usageLimits = config.usageLimits || {};
    const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const updateAiSchedule = (patch: Record<string, any>) => {
      updateConfig('aiSchedule', { ...aiSchedule, ...patch });
    };
    const toggleScheduleDay = (day: number) => {
      const next = aiScheduleDays.includes(day)
        ? aiScheduleDays.filter((d) => d !== day)
        : [...aiScheduleDays, day].sort((a, b) => a - b);
      updateAiSchedule({ daysOfWeek: next });
    };
    const updateUsageLimit = (field: string, value: string) => {
      const next = { ...usageLimits, [field]: value === '' ? undefined : Number(value) };
      updateConfig('usageLimits', next);
    };

    // Phase 4: Google Sheets data source (two-tab model).
    const googleSheets = config.googleSheets || {};
    const sheetTabs: string[] = Array.isArray(googleSheets.tabs) ? googleSheets.tabs : [];
    const sheetColumns: Record<string, Record<string, string>> = googleSheets.columns || {};
    const sheetConnected = Boolean(googleSheets.spreadsheetId || sheetTabs.length > 0);

    const updateSheets = (patch: Record<string, any>) => {
      updateConfig('googleSheets', { ...googleSheets, ...patch });
    };
    const connectSheet = () => {
      updateConfig('googleSheets', {
        spreadsheetId: '',
        tabs: AI_SHEET_TAB_SCHEMA.map((t) => t.tab),
        columns: {},
      });
    };
    const disconnectSheet = () => {
      updateConfig('googleSheets', undefined);
    };
    const updateSheetTabs = (raw: string) => {
      updateSheets({
        tabs: raw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
    };
    const updateSheetColumn = (tab: string, key: string, header: string) => {
      const tabMap = { ...(sheetColumns[tab] || {}) };
      const trimmed = header.trim();
      if (trimmed) tabMap[key] = trimmed;
      else delete tabMap[key];
      updateSheets({ columns: { ...sheetColumns, [tab]: tabMap } });
    };
    // Match a tab name to the canonical schema (exact, then by keyword) so the
    // mapping editor shows the right columns for custom tab names.
    const schemaForTab = (tab: string) => {
      const lower = tab.toLowerCase();
      return (
        AI_SHEET_TAB_SCHEMA.find((s) => s.tab.toLowerCase() === lower) ||
        AI_SHEET_TAB_SCHEMA.find((s) => s.tab.toLowerCase().includes('step') && lower.includes('step')) ||
        AI_SHEET_TAB_SCHEMA.find(
          (s) => s.tab.toLowerCase().includes('intent') && lower.includes('intent')
        )
      );
    };

    return (
      <div className="space-y-4">
        {/* Provider */}
        <div>
          <Label htmlFor="ai-provider">Provider *</Label>
          <Select
            value={provider}
            onValueChange={(value) => updateConfig('provider', value)}
          >
            <SelectTrigger id="ai-provider" data-testid="select-ai-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deepseek">DeepSeek</SelectItem>
              <SelectItem value="groq">Groq</SelectItem>
              <SelectItem value="mock">Mock (no API call)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Uses the platform API key — nothing to configure per workflow. Mock never calls a
            provider and costs nothing (the sandbox preview always uses it).
          </p>
        </div>

        {/* Model */}
        <div>
          <Label htmlFor="ai-model">Model</Label>
          <Input
            id="ai-model"
            placeholder={modelPlaceholder}
            value={config.model || ''}
            onChange={(e) => updateConfig('model', e.target.value)}
            data-testid="input-ai-model"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Leave empty to use the provider default ({modelPlaceholder}).
          </p>
        </div>

        {/* System prompt */}
        <div>
          <Label htmlFor="ai-system-prompt">System Prompt</Label>
          <Textarea
            id="ai-system-prompt"
            placeholder={AI_DEFAULT_SYSTEM_PROMPT}
            value={config.systemPrompt || ''}
            onChange={(e) => updateConfig('systemPrompt', e.target.value)}
            rows={8}
            data-testid="textarea-ai-system-prompt"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Business instructions only. Tool rules (send_buttons / send_list / handover, "don't
            re-send a menu after a click") and language rules (Arabic in → Arabic out) are added
            automatically. You can use {`{{variableName}}`} placeholders.
          </p>
        </div>

        {/* Temperature */}
        <div>
          <div className="flex items-center justify-between">
            <Label>Temperature</Label>
            <span className="text-xs text-muted-foreground">{temperature.toFixed(1)}</span>
          </div>
          <Slider
            value={[temperature]}
            min={0}
            max={2}
            step={0.1}
            onValueChange={(value) => updateConfig('temperature', value[0])}
            data-testid="slider-ai-temperature"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Lower is more predictable (0.2–0.5 for support), higher is more creative.
          </p>
        </div>

        <Separator />

        {/* Limits */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ai-max-tokens">Max tokens</Label>
            <Input
              id="ai-max-tokens"
              type="number"
              min={1}
              max={8192}
              placeholder="500"
              value={config.maxTokens ?? ''}
              onChange={(e) =>
                updateConfig('maxTokens', e.target.value === '' ? undefined : Number(e.target.value))
              }
              data-testid="input-ai-max-tokens"
            />
          </div>
          <div>
            <Label htmlFor="ai-history-limit">History messages</Label>
            <Input
              id="ai-history-limit"
              type="number"
              min={1}
              max={50}
              placeholder="12"
              value={config.historyLimit ?? ''}
              onChange={(e) =>
                updateConfig('historyLimit', e.target.value === '' ? undefined : Number(e.target.value))
              }
              data-testid="input-ai-history-limit"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          History is capped at 12 messages / 8 KB per conversation so the workflow context cannot
          overflow.
        </p>

        {/* Response variable */}
        <div>
          <Label htmlFor="ai-response-variable">Response Variable</Label>
          <Input
            id="ai-response-variable"
            placeholder="ai_response"
            value={config.responseVariable || ''}
            onChange={(e) => updateConfig('responseVariable', e.target.value)}
            data-testid="input-ai-response-variable"
          />
          <p className="text-xs text-muted-foreground mt-1">
            The reply is stored in this variable and in {`{{ai.<nodeId>.text}}`}. Use it in a
            downstream message node, e.g. {`{{ai_response}}`}.
          </p>
        </div>

        <Separator />

        {/* AI Buttons (send_buttons) — hidden for mock (no tool calls) */}
        {provider !== 'mock' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>AI Buttons (max 3)</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={addAiButton}
                disabled={aiButtons.length >= 3}
                data-testid="button-ai-add"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Button
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The AI can offer one or more of these as quick replies via the send_buttons tool. A tap
              comes back to this node as the visitor's next message, so the per-button handles are
              decorative — you don't need to wire them.
            </p>
            {aiButtons.map((button: any, i: number) => (
              <div key={button.id || i} className="p-3 border rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Button {i + 1}</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeAiButton(i)}
                    data-testid={`button-ai-remove-${i}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  placeholder="Button Title"
                  value={button.title || ''}
                  onChange={(e) => updateAiButton(i, 'title', e.target.value)}
                  maxLength={20}
                  data-testid={`input-ai-button-${i}-title`}
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="Button ID"
                    value={button.id || ''}
                    onChange={(e) => updateAiButton(i, 'id', e.target.value)}
                    data-testid={`input-ai-button-${i}-id`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => regenerateAiButtonId(i)}
                    title="Generate new ID"
                    data-testid={`button-ai-regenerate-${i}-id`}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {aiButtons.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Click "Add Button" to let the AI offer choices
              </p>
            )}

            {/* AI List Rows (send_list) — same switch, 4–10 options */}
            <div className="flex items-center justify-between pt-2">
              <Label>AI List Rows (max 10)</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={addAiListRow}
                disabled={aiListRows.length >= 10}
                data-testid="button-ai-list-add"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Row
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The AI decides whether to send buttons (≤3 options) or a list (4–10 options). You
              configure both sets; the AI chooses based on the question. A selection also returns to
              this node as the visitor's next message.
            </p>
            {aiListRows.map((row: any, i: number) => (
              <div key={row.id || i} className="p-3 border rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Row {i + 1}</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeAiListRow(i)}
                    data-testid={`button-ai-list-remove-${i}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  placeholder="Row Title (max 24)"
                  value={row.title || ''}
                  onChange={(e) => updateAiListRow(i, 'title', e.target.value)}
                  maxLength={24}
                  data-testid={`input-ai-list-${i}-title`}
                />
                <Input
                  placeholder="Description (optional, max 72)"
                  value={row.description || ''}
                  onChange={(e) => updateAiListRow(i, 'description', e.target.value)}
                  maxLength={72}
                  data-testid={`input-ai-list-${i}-description`}
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="Row ID"
                    value={row.id || ''}
                    onChange={(e) => updateAiListRow(i, 'id', e.target.value)}
                    maxLength={24}
                    data-testid={`input-ai-list-${i}-id`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => regenerateAiListRowId(i)}
                    title="Generate new ID"
                    data-testid={`button-ai-list-regenerate-${i}-id`}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {aiListRows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                Optional — click "Add Row" to let the AI offer a 4–10 option list
              </p>
            )}
          </div>
        )}

        {/* Handover Departments */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Handover Departments</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={addAiDepartment}
              data-testid="button-ai-dept-add"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Department
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Departments the AI can escalate to via the handover tool (e.g. Sales, Support). Each
            must have a unique ID.
          </p>
          {aiDepartments.map((dept: any, i: number) => (
            <div key={dept.id || i} className="p-3 border rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Department {i + 1}</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeAiDepartment(i)}
                  data-testid={`button-ai-dept-remove-${i}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Department Title"
                value={dept.title || ''}
                onChange={(e) => updateAiDepartment(i, 'title', e.target.value)}
                data-testid={`input-ai-dept-${i}-title`}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Department ID"
                  value={dept.id || ''}
                  onChange={(e) => updateAiDepartment(i, 'id', e.target.value)}
                  data-testid={`input-ai-dept-${i}-id`}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => regenerateAiDepartmentId(i)}
                  title="Generate new ID"
                  data-testid={`button-ai-dept-regenerate-${i}-id`}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {aiDepartments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Click "Add Department" to enable AI handover
            </p>
          )}
        </div>

        {/* Force Tool Choice */}
        <div>
          <Label htmlFor="ai-force-tool-choice">Tool Choice</Label>
          <Select
            value={config.forceToolChoice || 'auto'}
            onValueChange={(value) => updateConfig('forceToolChoice', value)}
          >
            <SelectTrigger id="ai-force-tool-choice" data-testid="select-ai-force-tool-choice">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (let AI decide)</SelectItem>
              <SelectItem value="send_buttons">Force: Send Buttons</SelectItem>
              <SelectItem value="handover">Force: Handover</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Force the model to use a specific tool instead of letting it decide. Forcing requires
            the matching tool to be configured (buttons / departments).
          </p>
        </div>

        <Separator />

        {/* Schedule (optional) */}
        <div className="space-y-3">
          <Label>Schedule (optional)</Label>
          <p className="text-xs text-muted-foreground">
            Restrict the AI to business hours. Leave both hours empty to stay always active.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ai-schedule-start">Start hour (0–23)</Label>
              <Input
                id="ai-schedule-start"
                type="number"
                min={0}
                max={23}
                placeholder="9"
                value={aiSchedule.startHour ?? ''}
                onChange={(e) =>
                  updateAiSchedule({
                    startHour: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                data-testid="input-ai-schedule-start"
              />
            </div>
            <div>
              <Label htmlFor="ai-schedule-end">End hour (0–23)</Label>
              <Input
                id="ai-schedule-end"
                type="number"
                min={0}
                max={23}
                placeholder="17"
                value={aiSchedule.endHour ?? ''}
                onChange={(e) =>
                  updateAiSchedule({
                    endHour: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                data-testid="input-ai-schedule-end"
              />
            </div>
          </div>
          <div>
            <Label>Days active</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {DAY_LABELS.map((label, day) => (
                <label key={day} className="flex items-center gap-1 text-xs cursor-pointer">
                  <Checkbox
                    checked={aiScheduleDays.includes(day)}
                    onCheckedChange={() => toggleScheduleDay(day)}
                    data-testid={`checkbox-ai-schedule-day-${day}`}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Leave all days unchecked for every day.
            </p>
          </div>
          <div>
            <Label htmlFor="ai-schedule-tz">Timezone</Label>
            <Input
              id="ai-schedule-tz"
              placeholder="Asia/Bahrain"
              value={aiSchedule.tz || ''}
              onChange={(e) => updateAiSchedule({ tz: e.target.value })}
              data-testid="input-ai-schedule-tz"
            />
            <p className="text-xs text-muted-foreground mt-1">
              IANA name, e.g. Asia/Bahrain. Leave empty for the platform default.
            </p>
          </div>
        </div>

        <Separator />

        {/* Usage Limits (optional) */}
        <div className="space-y-3">
          <Label>Usage Limits (optional)</Label>
          <p className="text-xs text-muted-foreground">
            Cap how many AI calls this workflow can make. Counted per workflow across all its AI
            nodes.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ai-daily-cap">Daily cap</Label>
              <Input
                id="ai-daily-cap"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={usageLimits.dailyMax ?? ''}
                onChange={(e) => updateUsageLimit('dailyMax', e.target.value)}
                data-testid="input-ai-daily-cap"
              />
            </div>
            <div>
              <Label htmlFor="ai-monthly-cap">Monthly cap</Label>
              <Input
                id="ai-monthly-cap"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={usageLimits.monthlyMax ?? ''}
                onChange={(e) => updateUsageLimit('monthlyMax', e.target.value)}
                data-testid="input-ai-monthly-cap"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Resets at midnight / on the 1st in Asia/Bahrain. When reached, the AI routes to its
            error handle.
          </p>
        </div>

        <Separator />

        {/* Max AI Calls Per User Per Day (optional) */}
        <div>
          <Label htmlFor="ai-daily-user-cap">Max AI Calls Per User Per Day (optional)</Label>
          <Input
            id="ai-daily-user-cap"
            type="number"
            min={1}
            placeholder="Unlimited"
            value={config.maxAiCallsPerDay ?? ''}
            onChange={(e) =>
              updateConfig(
                'maxAiCallsPerDay',
                e.target.value === '' ? undefined : Number(e.target.value)
              )
            }
            data-testid="input-ai-daily-user-cap"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Limits how many AI replies each user can receive per day on this workflow. Resets at
            midnight (Bahrain time). Users who exceed the cap are routed to the handover handle.
            Prevents abuse (spam) while allowing normal usage. Recommended for most workflows:
            15–30. Leave empty to disable.
          </p>
        </div>

        <Separator />

        {/* Google Sheets Data Source (optional) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Google Sheets Data Source (optional)</Label>
            <Button
              size="sm"
              variant={sheetConnected ? 'ghost' : 'outline'}
              onClick={sheetConnected ? disconnectSheet : connectSheet}
              data-testid="button-ai-sheets-toggle"
            >
              {sheetConnected ? 'Remove' : 'Connect Sheet'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Lets the AI look up rows with the lookup_sheet tool. Use one spreadsheet with an
            Intents tab and a Workflow_Steps tab; the AI finds the intent, loads its steps, then
            answers.
          </p>

          {sheetConnected && (
            <>
              <div>
                <Label htmlFor="ai-sheets-spreadsheet-id">Spreadsheet ID</Label>
                <Input
                  id="ai-sheets-spreadsheet-id"
                  placeholder="1AbC… (from the sheet URL)"
                  value={googleSheets.spreadsheetId || ''}
                  onChange={(e) => updateSheets({ spreadsheetId: e.target.value })}
                  data-testid="input-ai-sheets-spreadsheet-id"
                />
              </div>

              <div>
                <Label htmlFor="ai-sheets-tabs">Tab names (comma-separated)</Label>
                <Input
                  id="ai-sheets-tabs"
                  placeholder="Intents, Workflow_Steps"
                  value={sheetTabs.join(', ')}
                  onChange={(e) => updateSheetTabs(e.target.value)}
                  data-testid="input-ai-sheets-tabs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  These are the only tabs the AI may read. Matches the tab names in the sheet.
                </p>
              </div>

              {sheetTabs.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Column mapping — the header name in your sheet for each field. Leave empty to
                    use the default.
                  </p>
                  {sheetTabs.map((tab) => {
                    const schema = schemaForTab(tab);
                    if (!schema) return null;
                    return (
                      <div key={tab} className="p-3 border rounded-md space-y-2">
                        <Label className="text-xs">{tab} columns</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {schema.columns.map((col) => (
                            <div key={col.key}>
                              <Label
                                htmlFor={`ai-sheets-col-${tab}-${col.key}`}
                                className="text-[11px] text-muted-foreground"
                              >
                                {col.label}
                              </Label>
                              <Input
                                id={`ai-sheets-col-${tab}-${col.key}`}
                                placeholder={col.column}
                                value={sheetColumns[tab]?.[col.key] || ''}
                                onChange={(e) => updateSheetColumn(tab, col.key, e.target.value)}
                                data-testid={`input-ai-sheets-col-${tab}-${col.key}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <Separator />

        {/* Test */}
        <div className="space-y-2">
          <Label htmlFor="ai-test-message">Test message</Label>
          <Input
            id="ai-test-message"
            value={aiTestMessage}
            onChange={(e) => setAiTestMessage(e.target.value)}
            data-testid="input-ai-test-message"
          />
          <Button
            variant="outline"
            onClick={handleTestAi}
            disabled={isTestingAi || !aiTestMessage.trim()}
            data-testid="button-test-ai"
            className="w-full"
          >
            {isTestingAi ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <TestTube className="h-4 w-4 mr-2" />
                Test AI Reply
              </>
            )}
          </Button>
          {provider === 'mock' && (
            <p className="text-xs text-muted-foreground">
              Mock returns the test message echoed back — useful to check wiring without spending.
            </p>
          )}
        </div>

        {/* Test Results Dialog */}
        <Dialog open={aiTestDialogOpen} onOpenChange={setAiTestDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>AI Agent Test Results</DialogTitle>
              <DialogDescription>
                {aiTestResult?.success ? 'The model answered' : 'The model call failed'}
              </DialogDescription>
            </DialogHeader>

            {aiTestResult && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div className={`text-sm p-2 rounded border ${
                    aiTestResult.success
                      ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                      : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  }`}>
                    {aiTestResult.success ? (
                      <>✓ Success - {aiTestResult.provider} / {aiTestResult.model}</>
                    ) : (
                      <>✗ Failed - {aiTestResult.error}</>
                    )}
                  </div>
                </div>

                {aiTestResult.text && (
                  <div>
                    <Label className="text-sm font-medium">Reply</Label>
                    <div className="text-sm p-3 bg-muted rounded border whitespace-pre-wrap">
                      {aiTestResult.text}
                    </div>
                  </div>
                )}

                {aiTestResult.usage && (
                  <div>
                    <Label className="text-sm font-medium">Usage</Label>
                    <pre className="text-xs p-3 bg-muted rounded border overflow-x-auto">
                      {JSON.stringify(
                        {
                          ...aiTestResult.usage,
                          latencyMs: aiTestResult.latencyMs,
                          attempts: aiTestResult.attempts,
                          finishReason: aiTestResult.finishReason,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}

                {aiTestResult.error && (
                  <div>
                    <Label className="text-sm font-medium text-destructive">Error</Label>
                    <div className="text-sm p-3 bg-destructive/10 rounded border border-destructive/20 text-destructive">
                      {aiTestResult.error}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <p className="text-xs text-amber-600 mt-4">
          Note: AI Agent nodes have a success path and an error path (missing API key, timeout,
          provider error). Connect both paths to handle all scenarios.
        </p>
      </div>
    );
  }

  // Book Appointment Node Configuration
  if (nodeType === 'booking.book_appointment') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="serviceId">Booking Service *</Label>
          <Select
            value={config.serviceId ? String(config.serviceId) : ''}
            onValueChange={(value) => updateConfig('serviceId', parseInt(value))}
          >
            <SelectTrigger data-testid="select-booking-service">
              <SelectValue placeholder="Select a booking service" />
            </SelectTrigger>
            <SelectContent>
              {bookingServices.length === 0 ? (
                <SelectItem value="no-services" disabled>
                  No services available - create one in Booking Scheduler
                </SelectItem>
              ) : (
                bookingServices.map((service: any) => (
                  <SelectItem key={service.id} value={String(service.id)}>
                    {service.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Select which booking service this node uses (create services in Booking Scheduler page)
          </p>
        </div>

        <div>
          <Label htmlFor="bookingLabel">Booking Label *</Label>
          <Input
            id="bookingLabel"
            placeholder="e.g., Appointment, Consultation"
            value={config.bookingLabel || ''}
            onChange={(e) => updateConfig('bookingLabel', e.target.value)}
            data-testid="input-booking-label"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Unique label to identify this booking scheduler in the workflow
          </p>
        </div>

        <Separator />

        <div>
          <Label htmlFor="promptMessage">Service Selection Message *</Label>
          <Textarea
            id="promptMessage"
            placeholder="Please select a service to book your appointment..."
            value={config.promptMessage || ''}
            onChange={(e) => updateConfig('promptMessage', e.target.value)}
            data-testid="input-prompt-message"
            rows={2}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Message shown when asking user to select a service
          </p>
        </div>

        <div>
          <Label htmlFor="departmentButtonLabel">Service Button Label</Label>
          <Input
            id="departmentButtonLabel"
            placeholder="Select Service"
            value={config.departmentButtonLabel || ''}
            onChange={(e) => updateConfig('departmentButtonLabel', e.target.value)}
            data-testid="input-department-button-label"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Button text for service selection (default: Select Service)
          </p>
        </div>

        <div>
          <Label htmlFor="staffPromptMessage">Provider Selection Message *</Label>
          <Textarea
            id="staffPromptMessage"
            placeholder="Please select a provider for your appointment..."
            value={config.staffPromptMessage || ''}
            onChange={(e) => updateConfig('staffPromptMessage', e.target.value)}
            data-testid="input-staff-prompt-message"
            rows={2}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Message shown when asking user to select a provider
          </p>
        </div>

        <div>
          <Label htmlFor="staffButtonLabel">Provider Button Label</Label>
          <Input
            id="staffButtonLabel"
            placeholder="Select Provider"
            value={config.staffButtonLabel || ''}
            onChange={(e) => updateConfig('staffButtonLabel', e.target.value)}
            data-testid="input-staff-button-label"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Button text for provider selection (default: Select Provider)
          </p>
        </div>

        <div>
          <Label htmlFor="slotPromptMessage">Time Slot Selection Message *</Label>
          <Textarea
            id="slotPromptMessage"
            placeholder="Please select an available time slot..."
            value={config.slotPromptMessage || ''}
            onChange={(e) => updateConfig('slotPromptMessage', e.target.value)}
            data-testid="input-slot-prompt-message"
            rows={2}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Message shown when asking user to select a time slot
          </p>
        </div>

        <div>
          <Label htmlFor="slotButtonLabel">Slot Button Label</Label>
          <Input
            id="slotButtonLabel"
            placeholder="Select Time"
            value={config.slotButtonLabel || ''}
            onChange={(e) => updateConfig('slotButtonLabel', e.target.value)}
            data-testid="input-slot-button-label"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Button text for time slot selection (default: Select Time)
          </p>
        </div>

        <div>
          <Label htmlFor="successMessage">Success Message *</Label>
          <Textarea
            id="successMessage"
            placeholder="Your appointment has been booked! Date: {{date}}, Time: {{time}}"
            value={config.successMessage || ''}
            onChange={(e) => updateConfig('successMessage', e.target.value)}
            data-testid="input-success-message"
            rows={3}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use {`{{date}}`}, {`{{time}}`}, {`{{service}}`}, {`{{provider}}`}, {`{{name}}`} for placeholders ({`{{department}}`}/{`{{staff}}`} also work)
          </p>
        </div>

        <div>
          <Label htmlFor="noSlotsMessage">No Slots Message</Label>
          <Textarea
            id="noSlotsMessage"
            placeholder="Sorry, no available slots at this time. Please try again later."
            value={config.noSlotsMessage || ''}
            onChange={(e) => updateConfig('noSlotsMessage', e.target.value)}
            data-testid="input-no-slots-message"
            rows={2}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="requireName">Require Customer Name</Label>
            <p className="text-xs text-muted-foreground">Ask for name before booking</p>
          </div>
          <Switch
            id="requireName"
            checked={config.requireName || false}
            onCheckedChange={(checked) => updateConfig('requireName', checked)}
            data-testid="switch-require-name"
          />
        </div>

        {config.requireName && (
          <div>
            <Label htmlFor="namePromptMessage">Name Prompt Message</Label>
            <Textarea
              id="namePromptMessage"
              placeholder="Please enter your full name to complete the booking..."
              value={config.namePromptMessage || ''}
              onChange={(e) => updateConfig('namePromptMessage', e.target.value)}
              data-testid="input-name-prompt-message"
              rows={2}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Message shown when asking user to enter their name
            </p>
          </div>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="customQuestion1Enabled">Custom Question 1</Label>
            <p className="text-xs text-muted-foreground">Ask an additional question</p>
          </div>
          <Switch
            id="customQuestion1Enabled"
            checked={config.customQuestion1Enabled || false}
            onCheckedChange={(checked) => updateConfig('customQuestion1Enabled', checked)}
            data-testid="switch-custom-question-1"
          />
        </div>

        {config.customQuestion1Enabled && (
          <>
            <div>
              <Label htmlFor="customQuestion1Label">Question 1 Label</Label>
              <Input
                id="customQuestion1Label"
                placeholder="e.g., Email, Phone Number, ID Number"
                value={config.customQuestion1Label || ''}
                onChange={(e) => updateConfig('customQuestion1Label', e.target.value)}
                data-testid="input-custom-question-1-label"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Label for this question (stored with booking)
              </p>
            </div>
            <div>
              <Label htmlFor="customQuestion1Prompt">Question 1 Prompt</Label>
              <Textarea
                id="customQuestion1Prompt"
                placeholder="Please enter your email address..."
                value={config.customQuestion1Prompt || ''}
                onChange={(e) => updateConfig('customQuestion1Prompt', e.target.value)}
                data-testid="input-custom-question-1-prompt"
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Message shown when asking this question
              </p>
            </div>
          </>
        )}

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="customQuestion2Enabled">Custom Question 2</Label>
            <p className="text-xs text-muted-foreground">Ask another additional question</p>
          </div>
          <Switch
            id="customQuestion2Enabled"
            checked={config.customQuestion2Enabled || false}
            onCheckedChange={(checked) => updateConfig('customQuestion2Enabled', checked)}
            data-testid="switch-custom-question-2"
          />
        </div>

        {config.customQuestion2Enabled && (
          <>
            <div>
              <Label htmlFor="customQuestion2Label">Question 2 Label</Label>
              <Input
                id="customQuestion2Label"
                placeholder="e.g., Notes, Reason for Visit"
                value={config.customQuestion2Label || ''}
                onChange={(e) => updateConfig('customQuestion2Label', e.target.value)}
                data-testid="input-custom-question-2-label"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Label for this question (stored with booking)
              </p>
            </div>
            <div>
              <Label htmlFor="customQuestion2Prompt">Question 2 Prompt</Label>
              <Textarea
                id="customQuestion2Prompt"
                placeholder="Please describe the reason for your visit..."
                value={config.customQuestion2Prompt || ''}
                onChange={(e) => updateConfig('customQuestion2Prompt', e.target.value)}
                data-testid="input-custom-question-2-prompt"
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Message shown when asking this question
              </p>
            </div>
          </>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="allowMultiple">Allow Multiple Bookings</Label>
            <p className="text-xs text-muted-foreground">Allow same customer to book multiple appointments</p>
          </div>
          <Switch
            id="allowMultiple"
            checked={config.allowMultiple || false}
            onCheckedChange={(checked) => updateConfig('allowMultiple', checked)}
            data-testid="switch-allow-multiple"
          />
        </div>

        {!config.allowMultiple && (
          <div>
            <Label htmlFor="existingBookingMessage">Existing Booking Message</Label>
            <Textarea
              id="existingBookingMessage"
              placeholder="You already have an active appointment. Please cancel your existing booking first."
              value={config.existingBookingMessage || ''}
              onChange={(e) => updateConfig('existingBookingMessage', e.target.value)}
              data-testid="textarea-existing-booking-message"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Message shown when customer already has a booking
            </p>
          </div>
        )}

        <div>
          <Label htmlFor="maxAdvanceDays">Max Slots to Show</Label>
          <Input
            id="maxAdvanceDays"
            type="number"
            min={1}
            max={365}
            placeholder="30"
            value={config.maxAdvanceDays || 30}
            onChange={(e) => updateConfig('maxAdvanceDays', parseInt(e.target.value) || 30)}
            data-testid="input-max-advance-days"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Maximum number of time slots to display
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="startToday">Include Today</Label>
            <p className="text-xs text-muted-foreground">Show today's available slots</p>
          </div>
          <Switch
            id="startToday"
            checked={config.startToday !== false}
            onCheckedChange={(checked) => updateConfig('startToday', checked)}
            data-testid="switch-start-today"
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="reminderEnabled">Appointment Reminder</Label>
            <p className="text-xs text-muted-foreground">Send reminder before appointment</p>
          </div>
          <Switch
            id="reminderEnabled"
            checked={config.reminderEnabled || false}
            onCheckedChange={(checked) => updateConfig('reminderEnabled', checked)}
            data-testid="switch-reminder-enabled"
          />
        </div>

        {config.reminderEnabled && (
          <>
            <div>
              <Label htmlFor="reminderHoursBefore">Hours Before Appointment</Label>
              <Input
                id="reminderHoursBefore"
                type="number"
                min={1}
                max={168}
                placeholder="24"
                value={config.reminderHoursBefore || 24}
                onChange={(e) => updateConfig('reminderHoursBefore', parseInt(e.target.value) || 24)}
                data-testid="input-reminder-hours-before"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Send reminder this many hours before the appointment (1-168)
              </p>
            </div>

            <div>
              <Label htmlFor="reminderMessage">Reminder Message *</Label>
              <Textarea
                id="reminderMessage"
                placeholder="Reminder: You have an appointment on {{date}} at {{time}} with {{provider}} in {{service}}."
                value={config.reminderMessage || ''}
                onChange={(e) => updateConfig('reminderMessage', e.target.value)}
                data-testid="input-reminder-message"
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {`{{date}}`}, {`{{time}}`}, {`{{service}}`}, {`{{provider}}`}, {`{{name}}`} for placeholders ({`{{department}}`}/{`{{staff}}`} also work)
              </p>
            </div>
          </>
        )}

        <Separator />

        <div>
          <Label htmlFor="defaultBookingStatus">Default Booking Status</Label>
          <Select
            value={config.defaultBookingStatus || 'confirmed'}
            onValueChange={(value) => updateConfig('defaultBookingStatus', value)}
          >
            <SelectTrigger id="defaultBookingStatus" data-testid="select-default-booking-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="confirmed">Confirmed (Instant)</SelectItem>
              <SelectItem value="pending">Pending (Requires Manual Confirmation)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Confirmed: Booking is instantly confirmed. Pending: Requires manual confirmation from admin.
          </p>
        </div>

        {config.defaultBookingStatus === 'pending' && (
          <div>
            <Label htmlFor="pendingMessage">Pending Booking Message *</Label>
            <Textarea
              id="pendingMessage"
              placeholder="Your booking request has been submitted. Our team will review and confirm your appointment soon."
              value={config.pendingMessage || ''}
              onChange={(e) => updateConfig('pendingMessage', e.target.value)}
              data-testid="input-pending-message"
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Message sent when booking is created as pending. Use {`{{date}}`}, {`{{time}}`}, {`{{service}}`}, {`{{provider}}`}, {`{{name}}`} for placeholders ({`{{department}}`}/{`{{staff}}`} also work).
            </p>
          </div>
        )}

        <p className="text-xs text-amber-600 mt-4">
          Note: Configure services, providers, and time slots in the Booking Scheduler page. The chatbot will dynamically show available options.
        </p>
      </div>
    );
  }

  // Check Bookings Node Configuration
  if (nodeType === 'booking.check_bookings') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="checkType">Check Type *</Label>
          <Select
            value={config.checkType || 'my_bookings'}
            onValueChange={(value) => updateConfig('checkType', value)}
          >
            <SelectTrigger id="checkType" data-testid="select-check-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="my_bookings">My Bookings</SelectItem>
              <SelectItem value="cancel_booking">Cancel Booking</SelectItem>
              <SelectItem value="reschedule">Reschedule Booking</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="statusFilter">Status Filter</Label>
          <Select
            value={config.statusFilter || 'upcoming'}
            onValueChange={(value) => updateConfig('statusFilter', value)}
          >
            <SelectTrigger id="statusFilter" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Upcoming Only (Confirmed)</SelectItem>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="confirmed">Confirmed Only</SelectItem>
              <SelectItem value="pending">Pending Only</SelectItem>
              <SelectItem value="completed">Completed Only</SelectItem>
              <SelectItem value="cancelled">Cancelled Only</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Filter which bookings to show the customer
          </p>
        </div>

        <div>
          <Label htmlFor="maxBookings">Max Bookings to Show</Label>
          <Select
            value={config.maxBookings?.toString() || '0'}
            onValueChange={(value) => updateConfig('maxBookings', parseInt(value))}
          >
            <SelectTrigger id="maxBookings" data-testid="select-max-bookings">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">All Bookings</SelectItem>
              <SelectItem value="1">Last 1</SelectItem>
              <SelectItem value="2">Last 2</SelectItem>
              <SelectItem value="3">Last 3</SelectItem>
              <SelectItem value="5">Last 5</SelectItem>
              <SelectItem value="10">Last 10</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Limit number of bookings shown (0 = no limit)
          </p>
        </div>

        <Separator />

        <div>
          <Label htmlFor="noBookingsMessage">No Bookings Message</Label>
          <Textarea
            id="noBookingsMessage"
            placeholder="You don't have any upcoming appointments."
            value={config.noBookingsMessage || ''}
            onChange={(e) => updateConfig('noBookingsMessage', e.target.value)}
            data-testid="input-no-bookings-message"
            rows={2}
          />
        </div>

        <div>
          <Label htmlFor="bookingListFormat">Booking List Format</Label>
          <Textarea
            id="bookingListFormat"
            placeholder="📅 {{date}} at {{time}}\n📍 {{service}} - {{provider}}\nStatus: {{status}}"
            value={config.bookingListFormat || ''}
            onChange={(e) => updateConfig('bookingListFormat', e.target.value)}
            data-testid="input-booking-list-format"
            rows={3}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Format for each booking. Use {`{{date}}`}, {`{{time}}`}, {`{{service}}`}, {`{{provider}}`}, {`{{status}}`} ({`{{department}}`}/{`{{staff}}`} also work)
          </p>
        </div>

        {config.checkType === 'cancel_booking' && (
          <>
            <Separator />
            <div>
              <Label htmlFor="cancelPromptMessage">Cancel Selection Message</Label>
              <Textarea
                id="cancelPromptMessage"
                placeholder="Select the appointment you want to cancel:"
                value={config.cancelPromptMessage || ''}
                onChange={(e) => updateConfig('cancelPromptMessage', e.target.value)}
                data-testid="input-cancel-prompt-message"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="cancelButtonLabel">Cancel Button Label</Label>
              <Input
                id="cancelButtonLabel"
                placeholder="Select Appointment"
                value={config.cancelButtonLabel || ''}
                onChange={(e) => updateConfig('cancelButtonLabel', e.target.value)}
                data-testid="input-cancel-button-label"
              />
            </div>
            <div>
              <Label htmlFor="cancelSuccessMessage">Cancel Success Message</Label>
              <Textarea
                id="cancelSuccessMessage"
                placeholder="Your appointment on {{date}} at {{time}} has been cancelled."
                value={config.cancelSuccessMessage || ''}
                onChange={(e) => updateConfig('cancelSuccessMessage', e.target.value)}
                data-testid="input-cancel-success-message"
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {`{{date}}`}, {`{{time}}`}, {`{{service}}`}, {`{{provider}}`} for placeholders ({`{{department}}`}/{`{{staff}}`} also work)
              </p>
            </div>
          </>
        )}

        {config.checkType === 'reschedule' && (
          <>
            <Separator />
            <div>
              <Label htmlFor="reschedulePromptMessage">Reschedule Selection Message</Label>
              <Textarea
                id="reschedulePromptMessage"
                placeholder="Select the appointment you want to reschedule:"
                value={config.reschedulePromptMessage || ''}
                onChange={(e) => updateConfig('reschedulePromptMessage', e.target.value)}
                data-testid="input-reschedule-prompt-message"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="rescheduleButtonLabel">Reschedule Button Label</Label>
              <Input
                id="rescheduleButtonLabel"
                placeholder="Select Appointment"
                value={config.rescheduleButtonLabel || ''}
                onChange={(e) => updateConfig('rescheduleButtonLabel', e.target.value)}
                data-testid="input-reschedule-button-label"
              />
            </div>
            <div>
              <Label htmlFor="rescheduleSlotMessage">New Slot Selection Message</Label>
              <Textarea
                id="rescheduleSlotMessage"
                placeholder="Select a new time for your appointment:"
                value={config.rescheduleSlotMessage || ''}
                onChange={(e) => updateConfig('rescheduleSlotMessage', e.target.value)}
                data-testid="input-reschedule-slot-message"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="rescheduleSlotButtonLabel">New Slot Button Label</Label>
              <Input
                id="rescheduleSlotButtonLabel"
                placeholder="Select New Time"
                value={config.rescheduleSlotButtonLabel || ''}
                onChange={(e) => updateConfig('rescheduleSlotButtonLabel', e.target.value)}
                data-testid="input-reschedule-slot-button-label"
              />
            </div>
            <div>
              <Label htmlFor="rescheduleSuccessMessage">Reschedule Success Message</Label>
              <Textarea
                id="rescheduleSuccessMessage"
                placeholder="Your appointment has been rescheduled to {{date}} at {{time}}."
                value={config.rescheduleSuccessMessage || ''}
                onChange={(e) => updateConfig('rescheduleSuccessMessage', e.target.value)}
                data-testid="input-reschedule-success-message"
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {`{{date}}`}, {`{{time}}`}, {`{{service}}`}, {`{{provider}}`} for placeholders ({`{{department}}`}/{`{{staff}}`} also work)
              </p>
            </div>
          </>
        )}

        <p className="text-xs text-amber-600 mt-4">
          Note: Customer is identified by their WhatsApp phone number.
        </p>
      </div>
    );
  }

  // Phase 4A-1: Text Input node
  if (nodeType === 'input.text') {
    const variableName = (config.variableName || '') as string;
    const variableNameInvalid = !!variableName && !VARIABLE_NAME_RE.test(variableName);

    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="input-text-prompt">Prompt *</Label>
          <Textarea
            id="input-text-prompt"
            placeholder="What is your full name?"
            value={config.prompt || ''}
            onChange={(e) => updateConfig('prompt', e.target.value)}
            rows={3}
            data-testid="input-text-prompt"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Sent as a static message. Template variables such as {`{{name}}`} are not supported in prompts.
          </p>
        </div>

        <div>
          <Label htmlFor="input-text-variable">Save reply to variable *</Label>
          <Input
            id="input-text-variable"
            placeholder="customer_name"
            value={variableName}
            onChange={(e) => updateConfig('variableName', e.target.value)}
            data-testid="input-text-variable"
          />
          {variableNameInvalid ? (
            <p className="text-xs text-destructive mt-1">
              Use letters, numbers and underscores only, and do not start with a digit.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Stored in the conversation context for later Condition, Set Variable and HTTP nodes.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="input-text-min">Min length</Label>
            <Input
              id="input-text-min"
              type="number"
              min={0}
              max={2000}
              placeholder="0"
              value={config.minLength ?? ''}
              onChange={(e) =>
                updateConfig(
                  'minLength',
                  e.target.value === ''
                    ? undefined
                    : Math.max(0, Math.min(2000, parseInt(e.target.value) || 0))
                )
              }
              data-testid="input-text-min-length"
            />
          </div>
          <div>
            <Label htmlFor="input-text-max">Max length</Label>
            <Input
              id="input-text-max"
              type="number"
              min={1}
              max={2000}
              placeholder="2000"
              value={config.maxLength ?? ''}
              onChange={(e) =>
                updateConfig(
                  'maxLength',
                  e.target.value === ''
                    ? undefined
                    : Math.max(1, Math.min(2000, parseInt(e.target.value) || 1))
                )
              }
              data-testid="input-text-max-length"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="input-text-invalid">Validation message (optional)</Label>
          <Textarea
            id="input-text-invalid"
            placeholder="Please enter at least 3 characters."
            value={config.invalidMessage || ''}
            onChange={(e) => updateConfig('invalidMessage', e.target.value)}
            rows={2}
            data-testid="input-text-invalid-message"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Sent when the reply fails the length rules. The customer is re-prompted.
          </p>
        </div>

        <div className="bg-muted/40 border rounded-md p-3 text-xs text-muted-foreground space-y-1">
          <p>Replies are trimmed. Maximum captured length is 2000 characters.</p>
          <p>Booking nodes must be reached via button replies, not directly after text input.</p>
        </div>
      </div>
    );
  }

  // Phase 4A-1: Condition node
  if (nodeType === 'condition') {
    const variablePath = (config.variable || '') as string;
    const variablePathInvalid = !!variablePath && !VARIABLE_PATH_RE.test(variablePath);
    const operator = (config.operator || 'equals') as string;
    const valueHidden = ['exists', 'not_exists', 'is_empty', 'is_not_empty'].includes(operator);

    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="condition-variable">Variable path *</Label>
          <Input
            id="condition-variable"
            placeholder="bookingState.status"
            value={variablePath}
            onChange={(e) => updateConfig('variable', e.target.value)}
            data-testid="condition-variable"
          />
          {variablePathInvalid ? (
            <p className="text-xs text-destructive mt-1">
              Use dot notation, for example bookingState.status or http.node_123.data.id.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Dot notation, e.g. {`http.node_123.status`} or {`bookingState.status`}. Array items use [0].
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="condition-operator">Operator *</Label>
          <Select value={operator} onValueChange={(value) => updateConfig('operator', value)}>
            <SelectTrigger id="condition-operator" data-testid="condition-operator">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="equals">Equals</SelectItem>
              <SelectItem value="not_equals">Does not equal</SelectItem>
              <SelectItem value="greater_than">Greater than</SelectItem>
              <SelectItem value="less_than">Less than</SelectItem>
              <SelectItem value="is_empty">Is empty</SelectItem>
              <SelectItem value="is_not_empty">Is not empty</SelectItem>
              <SelectItem value="exists">Exists</SelectItem>
              <SelectItem value="not_exists">Does not exist</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!valueHidden && (
          <div>
            <Label htmlFor="condition-value">Comparison value</Label>
            <Input
              id="condition-value"
              placeholder="confirmed"
              value={config.value ?? ''}
              onChange={(e) => updateConfig('value', e.target.value)}
              data-testid="condition-value"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Literal only — templates are not resolved here.
            </p>
          </div>
        )}

        <div className="bg-muted/40 border rounded-md p-3 text-xs text-muted-foreground space-y-1">
          <p>Comparisons are case-sensitive. Numeric operators coerce both sides to numbers.</p>
          <p>Whitespace-only values are treated as empty. 0 and false are not empty.</p>
        </div>
      </div>
    );
  }

  // Phase 4A-1: Set Variable node
  if (nodeType === 'setVariable') {
    const variableName = (config.variable || '') as string;
    const variableNameInvalid = !!variableName && !VARIABLE_NAME_RE.test(variableName);
    const variableNameReserved = RESERVED_CONTEXT_KEYS.includes(variableName);

    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="set-variable-name">Variable name *</Label>
          <Input
            id="set-variable-name"
            placeholder="appointment_confirmed"
            value={variableName}
            onChange={(e) => updateConfig('variable', e.target.value)}
            data-testid="set-variable-name"
          />
          {variableNameInvalid ? (
            <p className="text-xs text-destructive mt-1">
              Use letters, numbers and underscores only, and do not start with a digit.
            </p>
          ) : variableNameReserved ? (
            <p className="text-xs text-destructive mt-1">
              "{variableName}" is a reserved internal variable and cannot be overwritten.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Letters, numbers and underscores only. Dots are not allowed.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="set-variable-value">Value</Label>
          <Textarea
            id="set-variable-value"
            placeholder="appointment_confirmed"
            value={config.value ?? ''}
            onChange={(e) => updateConfig('value', e.target.value)}
            rows={3}
            data-testid="set-variable-value"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use {`{{path.to.value}}`} to interpolate. Unresolved references become an empty string.
          </p>
        </div>

        <div className="bg-muted/40 border rounded-md p-3 text-xs text-muted-foreground">
          Values are stored as text. Condition numeric operators coerce them when comparing.
        </div>
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
