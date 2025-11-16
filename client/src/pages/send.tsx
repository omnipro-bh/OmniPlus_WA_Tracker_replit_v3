import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Send as SendIcon, Loader2, Smile, Info } from "lucide-react";
import type { Channel, Template } from "@shared/schema";
import { Link } from "wouter";
import { WhatsAppPreview } from "@/components/whatsapp-preview";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

type Phonebook = {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  createdAt: string;
};

export default function Send() {
  const { user } = useAuth();
  const { toast } = useToast();
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [sendMode, setSendMode] = useState<"single" | "bulk">("single");
  const [bulkStrategy, setBulkStrategy] = useState<"phonebook_fields" | "single_message">("phonebook_fields");
  const [phonebookId, setPhonebookId] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [enableSubscriberTracking, setEnableSubscriberTracking] = useState(false);

  const [formData, setFormData] = useState({
    channelId: "",
    templateId: "",
    to: "",
    name: "",
    email: "",
    header: "",
    body: "",
    footer: "",
    messageType: "text_buttons",
    mediaUrl: "",
    button1Text: "",
    button1Type: "quick_reply",
    button1Value: "",
    button1Id: "",
    button2Text: "",
    button2Type: "quick_reply",
    button2Value: "",
    button2Id: "",
    button3Text: "",
    button3Type: "quick_reply",
    button3Value: "",
    button3Id: "",
  });

  const [uploadingFile, setUploadingFile] = useState(false);

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
    enabled: !!user,
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
    enabled: !!user,
  });

  const { data: phonebooks = [] } = useQuery<Phonebook[]>({
    queryKey: ["/api/phonebooks"],
    enabled: !!user && sendMode === "bulk",
  });

  // Handler for subscriber tracking checkbox
  const handleSubscriberTrackingToggle = (checked: boolean) => {
    setEnableSubscriberTracking(checked);
    if (checked) {
      // Automatically populate button 1 and 2 with Subscribe/Unsubscribe
      setFormData({
        ...formData,
        button1Text: "Subscribe",
        button1Type: "quick_reply",
        button2Text: "Unsubscribe",
        button2Type: "quick_reply",
      });
    }
  };

  const sendMutation = useMutation({
    mutationFn: async (data: any) => {
      // Build buttons array from enhanced button configuration
      const buttons = [];
      for (let i = 1; i <= 3; i++) {
        const text = data[`button${i}Text`];
        if (text && text.trim()) {
          buttons.push({
            text: text.trim(),
            type: data[`button${i}Type`],
            value: data[`button${i}Value`] || null,
            id: data[`button${i}Id`] || `btn${i}`,
          });
        }
      }

      // Handle bulk mode
      if (sendMode === "bulk") {
        if (!phonebookId) {
          throw new Error("Please select a phonebook");
        }

        // For "single_message" strategy, send the same message to all contacts
        if (bulkStrategy === "single_message") {
          return await apiRequest("POST", `/api/phonebooks/${phonebookId}/send-uniform`, {
            channelId: parseInt(data.channelId),
            header: data.header || null,
            body: data.body,
            footer: data.footer || null,
            messageType: data.messageType,
            mediaUrl: data.mediaUrl || null,
            buttons,
          });
        } else {
          // For "phonebook_fields" strategy, use each contact's own message
          return await apiRequest("POST", `/api/phonebooks/${phonebookId}/send`, {
            channelId: parseInt(data.channelId),
          });
        }
      }

      // Handle single mode
      return await apiRequest("POST", "/api/messages/send", {
        ...data,
        buttons,
        channelId: parseInt(data.channelId),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      toast({
        title: "Message queued",
        description: "Track delivery in Outbox → Job Details.",
      });
      setFormData({
        channelId: formData.channelId,
        templateId: "",
        to: "",
        name: "",
        email: "",
        header: "",
        body: "",
        footer: "",
        messageType: "text_buttons",
        mediaUrl: "",
        button1Text: "",
        button1Type: "quick_reply",
        button1Value: "",
        button1Id: "",
        button2Text: "",
        button2Type: "quick_reply",
        button2Value: "",
        button2Id: "",
        button3Text: "",
        button3Type: "quick_reply",
        button3Value: "",
        button3Id: "",
      });
    },
    onError: (error: any) => {
      const isLimitReached = error.message?.includes("limit reached");
      toast({
        title: isLimitReached ? "Daily limit reached" : "Failed to send",
        description: error.message || "Could not send message",
        variant: "destructive",
      });
    },
  });

  const activeChannels = channels.filter((c) => c.status === "ACTIVE");
  const authorizedChannels = activeChannels.filter((c) => c.authStatus === "AUTHORIZED");
  // Check if user has any active, non-expired channels
  const hasNonExpiredChannels = authorizedChannels.some(c => {
    if (!c.expiresAt) return true;
    return new Date(c.expiresAt) > new Date();
  });
  const canSend = hasNonExpiredChannels && authorizedChannels.length > 0;

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === parseInt(templateId));
    if (template) {
      // Parse buttons - handle both old text[] format and new structured format
      let button1Text = "", button1Type = "quick_reply", button1Value = "", button1Id = "";
      let button2Text = "", button2Type = "quick_reply", button2Value = "", button2Id = "";
      let button3Text = "", button3Type = "quick_reply", button3Value = "", button3Id = "";
      
      if (Array.isArray(template.buttons)) {
        template.buttons.forEach((button: any, index: number) => {
          if (typeof button === "string") {
            // Old format: simple text strings
            if (index === 0) button1Text = button;
            if (index === 1) button2Text = button;
            if (index === 2) button3Text = button;
          } else if (button && typeof button === "object") {
            // New format: structured button objects
            if (index === 0) {
              button1Text = button.text || "";
              button1Type = button.type || "quick_reply";
              button1Value = button.value || "";
              button1Id = button.id || "";
            }
            if (index === 1) {
              button2Text = button.text || "";
              button2Type = button.type || "quick_reply";
              button2Value = button.value || "";
              button2Id = button.id || "";
            }
            if (index === 2) {
              button3Text = button.text || "";
              button3Type = button.type || "quick_reply";
              button3Value = button.value || "";
              button3Id = button.id || "";
            }
          }
        });
      }
      
      setFormData({
        ...formData,
        templateId,
        header: template.header || "",
        body: template.body,
        footer: template.footer || "",
        messageType: (template as any).messageType || "text_buttons",
        mediaUrl: (template as any).mediaUrl || "",
        button1Text,
        button1Type,
        button1Value,
        button1Id,
        button2Text,
        button2Type,
        button2Value,
        button2Id,
        button3Text,
        button3Type,
        button3Value,
        button3Id,
      });
    }
  };

  const handleEmojiSelect = (emoji: any) => {
    // Guard: Check if textarea ref is available
    const textarea = bodyTextareaRef.current;
    if (!textarea) {
      // Fallback: Just append emoji to body if textarea not mounted
      const currentBody = formData.body || "";
      setFormData({ ...formData, body: currentBody + emoji.native });
      setEmojiPickerOpen(false);
      return;
    }

    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const text = formData.body || "";
    const newText = text.substring(0, start) + emoji.native + text.substring(end);

    setFormData({ ...formData, body: newText });
    setEmojiPickerOpen(false);

    // Restore cursor position
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        const newPosition = start + emoji.native.length;
        textarea.setSelectionRange(newPosition, newPosition);
      }
    }, 0);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if channel is selected
    if (!formData.channelId) {
      toast({
        title: "Channel required",
        description: "Please select a channel first before uploading files",
        variant: "destructive",
      });
      return;
    }

    setUploadingFile(true);
    try {
      // Determine file type
      let fileType = "document";
      if (file.type.startsWith("image/")) {
        fileType = "image";
      } else if (file.type.startsWith("video/")) {
        fileType = "video";
      }

      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/media/upload", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: base64,
          fileType: fileType,
          channelId: formData.channelId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();
      setFormData({ ...formData, mediaUrl: result.url });
      toast({
        title: "File uploaded",
        description: "Media file ready to send",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Form */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Send Message</CardTitle>
            <CardDescription>Compose and send a WhatsApp message</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Send Mode Selector */}
            <div className="space-y-2">
              <Label htmlFor="send-mode">Send Mode</Label>
              <Select
                value={sendMode}
                onValueChange={(value: "single" | "bulk") => setSendMode(value)}
              >
                <SelectTrigger id="send-mode" data-testid="select-send-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Message</SelectItem>
                  <SelectItem value="bulk">Bulk Message</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Phonebook Selector (Bulk Mode Only) */}
            {sendMode === "bulk" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="phonebook">Select Phonebook *</Label>
                  <Select
                    value={phonebookId}
                    onValueChange={setPhonebookId}
                  >
                    <SelectTrigger id="phonebook" data-testid="select-phonebook">
                      <SelectValue placeholder="Choose phonebook" />
                    </SelectTrigger>
                    <SelectContent>
                      {phonebooks.map((phonebook) => (
                        <SelectItem key={phonebook.id} value={phonebook.id.toString()}>
                          {phonebook.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bulk-strategy">Bulk Send Strategy</Label>
                  <Select
                    value={bulkStrategy}
                    onValueChange={(value: "phonebook_fields" | "single_message") => setBulkStrategy(value)}
                  >
                    <SelectTrigger id="bulk-strategy" data-testid="select-bulk-strategy">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phonebook_fields">Use Phonebook Fields per Contact</SelectItem>
                      <SelectItem value="single_message">Use One Message for All</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {bulkStrategy === "phonebook_fields" 
                      ? "Each contact will receive their personalized message from the phonebook"
                      : "All contacts will receive the same message you compose below"}
                  </p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="channel">Sender Channel *</Label>
              <Select
                value={formData.channelId}
                onValueChange={(value) => setFormData({ ...formData, channelId: value })}
              >
                <SelectTrigger id="channel" data-testid="select-channel">
                  <SelectValue placeholder="Select channel" />
                </SelectTrigger>
                <SelectContent>
                  {activeChannels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id.toString()}>
                      {channel.label} ({channel.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template">Select Template (Optional)</Label>
              <Select value={formData.templateId} onValueChange={handleTemplateSelect}>
                <SelectTrigger id="template" data-testid="select-template">
                  <SelectValue placeholder="Choose template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Recipient fields (Single Mode Only) */}
            {sendMode === "single" && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    placeholder="+1234567890"
                    value={formData.to}
                    onChange={(e) => setFormData({ ...formData, to: e.target.value })}
                    data-testid="input-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="Recipient name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    data-testid="input-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    data-testid="input-email"
                  />
                </div>
              </div>
            )}

            {/* Message fields - Hidden when using phonebook fields in bulk mode */}
            {!(sendMode === "bulk" && bulkStrategy === "phonebook_fields") && (
              <>
            {/* Message Type Selector */}
            <div className="space-y-2">
              <Label htmlFor="messageType">Message Type *</Label>
              <Select
                value={formData.messageType}
                onValueChange={(value) => setFormData({ ...formData, messageType: value, mediaUrl: "" })}
              >
                <SelectTrigger data-testid="select-message-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text_buttons">Text + Buttons</SelectItem>
                  <SelectItem value="image">Image Only</SelectItem>
                  <SelectItem value="image_buttons">Image + Buttons</SelectItem>
                  <SelectItem value="video_buttons">Video + Buttons</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* File Upload (for media types) */}
            {["image", "image_buttons", "video_buttons", "document"].includes(formData.messageType) && (
              <div className="space-y-2">
                <Label htmlFor="file">Upload File *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="file"
                    type="file"
                    accept={
                      formData.messageType.includes("image") ? "image/*" :
                      formData.messageType.includes("video") ? "video/*" :
                      "*/*"
                    }
                    onChange={handleFileUpload}
                    disabled={uploadingFile}
                    data-testid="input-file-upload"
                  />
                  {uploadingFile && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
                {formData.mediaUrl && (
                  <p className="text-xs text-green-600">File uploaded successfully</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="header">Header</Label>
              <Input
                id="header"
                placeholder="Message header"
                value={formData.header}
                onChange={(e) => setFormData({ ...formData, header: e.target.value })}
                data-testid="input-header"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="body">Body *</Label>
                <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm"
                      data-testid="button-emoji-picker"
                    >
                      <Smile className="h-4 w-4 mr-1" />
                      Add Emoji
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0 border-none" align="end">
                    <Picker 
                      data={data} 
                      onEmojiSelect={handleEmojiSelect}
                      theme="auto"
                      previewPosition="none"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Textarea
                ref={bodyTextareaRef}
                id="body"
                placeholder="Message body"
                rows={6}
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                data-testid="input-body"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="footer">Footer</Label>
              <Input
                id="footer"
                placeholder="Message footer"
                value={formData.footer}
                onChange={(e) => setFormData({ ...formData, footer: e.target.value })}
                data-testid="input-footer"
              />
            </div>

            {/* Enhanced Button Configuration */}
            {!["image", "document"].includes(formData.messageType) && (
              <div className="space-y-3">
                <Label>Buttons (Optional - up to 3)</Label>
                
                {/* Subscriber Tracking Checkbox */}
                <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-md p-3">
                  <Checkbox
                    id="enable-subscriber-tracking"
                    checked={enableSubscriberTracking}
                    onCheckedChange={handleSubscriberTrackingToggle}
                    data-testid="checkbox-subscriber-tracking"
                  />
                  <div className="flex-1 flex items-start gap-1">
                    <Label htmlFor="enable-subscriber-tracking" className="text-sm font-normal cursor-pointer leading-relaxed">
                      Allow recipients to opt out of future campaigns
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 cursor-help flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">
                          By enabling this feature, you can easily allow recipients to opt in/out of campaign messages in the future. 
                          Button clicks matching your configured keywords will automatically track subscriber status. Reach out to support team if you need to use different opt out words.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                
                {/* Button 1 */}
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Button 1</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Button Text"
                      value={formData.button1Text}
                      onChange={(e) => setFormData({ ...formData, button1Text: e.target.value })}
                      data-testid="input-button1-text"
                    />
                    <Select
                      value={formData.button1Type}
                      onValueChange={(value) => setFormData({ ...formData, button1Type: value })}
                    >
                      <SelectTrigger data-testid="select-button1-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quick_reply">Quick Reply</SelectItem>
                        <SelectItem value="url">URL</SelectItem>
                        <SelectItem value="call">Call</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.button1Type !== "quick_reply" && (
                    <Input
                      placeholder={formData.button1Type === "url" ? "https://example.com" : "+1234567890"}
                      value={formData.button1Value}
                      onChange={(e) => setFormData({ ...formData, button1Value: e.target.value })}
                      data-testid="input-button1-value"
                    />
                  )}
                  <Input
                    placeholder="Button ID (optional)"
                    value={formData.button1Id}
                    onChange={(e) => setFormData({ ...formData, button1Id: e.target.value })}
                    data-testid="input-button1-id"
                  />
                </div>

                {/* Button 2 */}
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Button 2</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Button Text"
                      value={formData.button2Text}
                      onChange={(e) => setFormData({ ...formData, button2Text: e.target.value })}
                      data-testid="input-button2-text"
                    />
                    <Select
                      value={formData.button2Type}
                      onValueChange={(value) => setFormData({ ...formData, button2Type: value })}
                    >
                      <SelectTrigger data-testid="select-button2-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quick_reply">Quick Reply</SelectItem>
                        <SelectItem value="url">URL</SelectItem>
                        <SelectItem value="call">Call</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.button2Type !== "quick_reply" && (
                    <Input
                      placeholder={formData.button2Type === "url" ? "https://example.com" : "+1234567890"}
                      value={formData.button2Value}
                      onChange={(e) => setFormData({ ...formData, button2Value: e.target.value })}
                      data-testid="input-button2-value"
                    />
                  )}
                  <Input
                    placeholder="Button ID (optional)"
                    value={formData.button2Id}
                    onChange={(e) => setFormData({ ...formData, button2Id: e.target.value })}
                    data-testid="input-button2-id"
                  />
                </div>

                {/* Button 3 */}
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Button 3</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Button Text"
                      value={formData.button3Text}
                      onChange={(e) => setFormData({ ...formData, button3Text: e.target.value })}
                      data-testid="input-button3-text"
                    />
                    <Select
                      value={formData.button3Type}
                      onValueChange={(value) => setFormData({ ...formData, button3Type: value })}
                    >
                      <SelectTrigger data-testid="select-button3-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quick_reply">Quick Reply</SelectItem>
                        <SelectItem value="url">URL</SelectItem>
                        <SelectItem value="call">Call</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.button3Type !== "quick_reply" && (
                    <Input
                      placeholder={formData.button3Type === "url" ? "https://example.com" : "+1234567890"}
                      value={formData.button3Value}
                      onChange={(e) => setFormData({ ...formData, button3Value: e.target.value })}
                      data-testid="input-button3-value"
                    />
                  )}
                  <Input
                    placeholder="Button ID (optional)"
                    value={formData.button3Id}
                    onChange={(e) => setFormData({ ...formData, button3Id: e.target.value })}
                    data-testid="input-button3-id"
                  />
                </div>
              </div>
            )}
              </>
            )}

            <Button
              className="w-full"
              onClick={() => sendMutation.mutate(formData)}
              disabled={
                !canSend || 
                !formData.channelId || 
                (sendMode === "single" && !formData.to) || 
                (sendMode === "bulk" && !phonebookId) ||
                (sendMode === "bulk" && bulkStrategy === "single_message" && !formData.body) ||
                sendMutation.isPending
              }
              data-testid="button-send-message"
            >
              {sendMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <SendIcon className="h-4 w-4 mr-2" />
              Send Message
            </Button>

            {!canSend && (
              <p className="text-sm text-muted-foreground text-center">
                {activeChannels.length === 0 ? (
                  <>
                    No active channels. Please{" "}
                    <Link href="/channels">
                      <a className="text-primary hover:underline">add and activate a channel</a>
                    </Link>
                  </>
                ) : authorizedChannels.length === 0 ? (
                  <>
                    No authorized channels. Please{" "}
                    <Link href="/channels">
                      <a className="text-primary hover:underline">authorize your channels</a>
                    </Link>
                    {" "}by scanning the QR code.
                  </>
                ) : !hasNonExpiredChannels ? (
                  <>
                    All channels have expired. Please{" "}
                    <Link href="/channels">
                      <a className="text-primary hover:underline">add days to your channels</a>
                    </Link>
                    {" "}to continue sending messages.
                  </>
                ) : null}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>How your message will look on WhatsApp</CardDescription>
          </CardHeader>
          <CardContent>
            <WhatsAppPreview
              header={formData.header}
              body={formData.body}
              footer={formData.footer}
              messageType={formData.messageType}
              mediaUrl={formData.mediaUrl}
              buttons={[
                formData.button1Text.trim() ? {
                  text: formData.button1Text,
                  type: formData.button1Type,
                  value: formData.button1Value,
                } : null,
                formData.button2Text.trim() ? {
                  text: formData.button2Text,
                  type: formData.button2Type,
                  value: formData.button2Value,
                } : null,
                formData.button3Text.trim() ? {
                  text: formData.button3Text,
                  type: formData.button3Type,
                  value: formData.button3Value,
                } : null,
              ].filter(Boolean) as Array<{text: string; type: string; value?: string}>}
              uploadingFile={uploadingFile}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
