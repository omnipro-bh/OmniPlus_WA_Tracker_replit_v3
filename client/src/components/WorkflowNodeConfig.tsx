import { Node } from '@xyflow/react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TestTube, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface NodeConfigProps {
  node: Node;
  onUpdate: (nodeId: string, config: any) => void;
}

export function NodeConfigPanel({ node, onUpdate }: NodeConfigProps) {
  const nodeType = (node.data.type as string) || '';
  const config = (node.data.config as any) || {};
  const { toast } = useToast();
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);

  const updateConfig = (key: string, value: any) => {
    onUpdate(node.id, { ...config, [key]: value });
  };

  const updateButton = (index: number, field: string, value: string) => {
    const buttons = [...(config.buttons || [{}, {}, {}])];
    buttons[index] = { ...buttons[index], [field]: value };
    updateConfig('buttons', buttons);
  };

  const handleTestSend = async () => {
    if (!testPhone.trim()) {
      toast({
        title: 'Phone number required',
        description: 'Please enter a phone number to send the test message',
        variant: 'destructive',
      });
      return;
    }

    setIsSendingTest(true);
    try {
      await apiRequest('POST', '/api/workflows/test-message', {
        nodeType,
        config,
        phone: testPhone,
      });

      toast({
        title: 'Test message sent',
        description: `Message sent to ${testPhone}`,
      });
      setTestDialogOpen(false);
      setTestPhone('');
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
            <Label htmlFor="test-phone">Phone Number (E.164 format)</Label>
            <Input
              id="test-phone"
              placeholder="+1234567890"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              data-testid="input-test-phone"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Include country code (e.g., +1 for US)
            </p>
          </div>
          <Button 
            onClick={handleTestSend} 
            disabled={isSendingTest}
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
    const buttons = config.buttons || [{}, {}, {}];
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
          <Label>Buttons (Up to 3)</Label>
          <p className="text-xs text-muted-foreground mb-2">Each button max 25 characters</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 mb-3">
              <Input
                placeholder={`Button ${i + 1} Title`}
                value={buttons[i]?.title || ''}
                onChange={(e) => updateButton(i, 'title', e.target.value)}
                maxLength={25}
                data-testid={`input-button-${i}-title`}
              />
              <Input
                placeholder={`Button ${i + 1} ID`}
                value={buttons[i]?.id || ''}
                onChange={(e) => updateButton(i, 'id', e.target.value)}
                data-testid={`input-button-${i}-id`}
              />
            </div>
          ))}
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // Quick Reply with Image Configuration
  if (nodeType === 'quickReplyImage') {
    const buttons = config.buttons || [{}, {}, {}];
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
        <div>
          <Label>Buttons (Up to 3)</Label>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 mb-3">
              <Input
                placeholder={`Button ${i + 1} Title`}
                value={buttons[i]?.title || ''}
                onChange={(e) => updateButton(i, 'title', e.target.value)}
                maxLength={25}
                data-testid={`input-button-${i}-title`}
              />
              <Input
                placeholder={`Button ${i + 1} ID`}
                value={buttons[i]?.id || ''}
                onChange={(e) => updateButton(i, 'id', e.target.value)}
                data-testid={`input-button-${i}-id`}
              />
            </div>
          ))}
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // Quick Reply with Video Configuration
  if (nodeType === 'quickReplyVideo') {
    const buttons = config.buttons || [{}, {}, {}];
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
        <div>
          <Label>Buttons (Up to 3)</Label>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 mb-3">
              <Input
                placeholder={`Button ${i + 1} Title`}
                value={buttons[i]?.title || ''}
                onChange={(e) => updateButton(i, 'title', e.target.value)}
                maxLength={25}
                data-testid={`input-button-${i}-title`}
              />
              <Input
                placeholder={`Button ${i + 1} ID`}
                value={buttons[i]?.id || ''}
                onChange={(e) => updateButton(i, 'id', e.target.value)}
                data-testid={`input-button-${i}-id`}
              />
            </div>
          ))}
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // List Message Configuration
  if (nodeType === 'listMessage') {
    const sections = config.sections || [{ title: '', rows: [{}, {}] }];
    
    const updateSection = (sIndex: number, field: string, value: any) => {
      const newSections = [...sections];
      newSections[sIndex] = { ...newSections[sIndex], [field]: value };
      updateConfig('sections', newSections);
    };

    const updateRow = (sIndex: number, rIndex: number, field: string, value: string) => {
      const newSections = [...sections];
      const rows = [...(newSections[sIndex].rows || [])];
      rows[rIndex] = { ...rows[rIndex], [field]: value };
      newSections[sIndex] = { ...newSections[sIndex], rows };
      updateConfig('sections', newSections);
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
        <div>
          <Label>List Section</Label>
          <Input
            placeholder="Section Title"
            value={sections[0]?.title || ''}
            onChange={(e) => updateSection(0, 'title', e.target.value)}
            className="mb-2"
            data-testid="input-section-title"
          />
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2 mb-3 p-2 border rounded-md">
              <Input
                placeholder={`Row ${i + 1} Title`}
                value={sections[0]?.rows?.[i]?.title || ''}
                onChange={(e) => updateRow(0, i, 'title', e.target.value)}
                data-testid={`input-row-${i}-title`}
              />
              <Input
                placeholder={`Row ${i + 1} ID`}
                value={sections[0]?.rows?.[i]?.id || ''}
                onChange={(e) => updateRow(0, i, 'id', e.target.value)}
                data-testid={`input-row-${i}-id`}
              />
              <Textarea
                placeholder={`Row ${i + 1} Description (Optional)`}
                value={sections[0]?.rows?.[i]?.description || ''}
                onChange={(e) => updateRow(0, i, 'description', e.target.value)}
                rows={2}
                data-testid={`input-row-${i}-description`}
              />
            </div>
          ))}
        </div>
        <Separator />
        <TestButton />
      </div>
    );
  }

  // Call Button Configuration
  if (nodeType === 'callButton') {
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
        <Separator />
        <TestButton />
      </div>
    );
  }

  // URL Button Configuration
  if (nodeType === 'urlButton') {
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
        <Separator />
        <TestButton />
      </div>
    );
  }

  // Copy/OTP Button Configuration
  if (nodeType === 'copyButton') {
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
        <Separator />
        <TestButton />
      </div>
    );
  }

  // Carousel Configuration
  if (nodeType === 'carousel') {
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
        <p className="text-sm text-muted-foreground">
          Carousel cards are managed through workflow definition. Up to 10 cards supported.
        </p>
        <Separator />
        <TestButton />
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
