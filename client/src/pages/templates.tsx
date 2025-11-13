import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit, Trash2, FileText, Smile, Loader2, Image as ImageIcon, Video, FileUp } from "lucide-react";
import type { Template, Channel } from "@shared/schema";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

// Helper type for template with mediaUrl
type TemplateWithMedia = Template & { mediaUrl: string | null };

export default function Templates() {
  const { toast } = useToast();
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateWithMedia | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  // Store original button IDs to preserve them during updates
  const [originalButtonIds, setOriginalButtonIds] = useState<{
    button1Id: string;
    button2Id: string;
    button3Id: string;
  }>({
    button1Id: "",
    button2Id: "",
    button3Id: "",
  });
  
  const [formData, setFormData] = useState({
    title: "",
    header: "",
    body: "",
    footer: "",
    messageType: "text_buttons",
    mediaUploadId: null as number | null,
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

  // Need channels for media upload
  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  const { data: templates = [], isLoading } = useQuery<TemplateWithMedia[]>({
    queryKey: ["/api/templates"],
  });

  const activeChannels = channels.filter((c) => c.status === "ACTIVE");

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      // Build structured buttons array
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

      return await apiRequest("POST", "/api/templates", {
        title: data.title,
        header: data.header || null,
        body: data.body,
        footer: data.footer || null,
        messageType: data.messageType,
        mediaUploadId: data.mediaUploadId,
        buttons,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: "Template created", description: "Template saved successfully." });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create template",
        description: error.message || "Could not create template",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      // Build structured buttons array - preserve original IDs when updating
      const buttons = [];
      for (let i = 1; i <= 3; i++) {
        const text = data[`button${i}Text`];
        if (text && text.trim()) {
          // Use form data ID if provided, otherwise preserve original ID, otherwise use default
          const originalId = originalButtonIds[`button${i}Id` as keyof typeof originalButtonIds];
          const formId = data[`button${i}Id`];
          const buttonId = (formId && formId.trim()) ? formId.trim() : (originalId || `btn${i}`);
          
          buttons.push({
            text: text.trim(),
            type: data[`button${i}Type`],
            value: data[`button${i}Value`] || null,
            id: buttonId,
          });
        }
      }

      return await apiRequest("PUT", `/api/templates/${id}`, {
        title: data.title,
        header: data.header || null,
        body: data.body,
        footer: data.footer || null,
        messageType: data.messageType,
        mediaUploadId: data.mediaUploadId,
        buttons,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: "Template updated", description: "Changes saved successfully." });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update template",
        description: error.message || "Could not update template",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/templates/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "Template deleted" });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      header: "",
      body: "",
      footer: "",
      messageType: "text_buttons",
      mediaUploadId: null,
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
    setOriginalButtonIds({
      button1Id: "",
      button2Id: "",
      button3Id: "",
    });
    setEditingTemplate(null);
  };

  const handleEdit = (template: TemplateWithMedia) => {
    setEditingTemplate(template);
    
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
    
    // Store original button IDs to preserve them during updates
    setOriginalButtonIds({
      button1Id: button1Id,
      button2Id: button2Id,
      button3Id: button3Id,
    });
    
    setFormData({
      title: template.title,
      header: template.header || "",
      body: template.body,
      footer: template.footer || "",
      messageType: template.messageType || "text_buttons",
      mediaUploadId: template.mediaUploadId || null,
      mediaUrl: template.mediaUrl || "",
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
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.title || !formData.body) {
      toast({
        title: "Validation error",
        description: "Title and body are required",
        variant: "destructive",
      });
      return;
    }

    // Validate media for media types
    if (["image", "image_buttons", "video_buttons", "document"].includes(formData.messageType) && !formData.mediaUrl) {
      toast({
        title: "Media required",
        description: "Please upload a file for this message type",
        variant: "destructive",
      });
      return;
    }

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEmojiSelect = (emoji: any) => {
    const textarea = bodyTextareaRef.current;
    if (!textarea) {
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

    // For templates, we need a channel to upload media - use first active channel
    const firstChannel = activeChannels[0];
    if (!firstChannel) {
      toast({
        title: "No active channel",
        description: "Please activate a channel first before uploading media",
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
          channelId: firstChannel.id.toString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();
      setFormData({ 
        ...formData, 
        mediaUrl: result.url,
        mediaUploadId: result.id,
      });
      toast({
        title: "File uploaded",
        description: "Media file ready to use in template",
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

  // Helper to render button badges for template cards - shows all slots including empty ones
  const renderButtonBadges = (buttons: any) => {
    if (!Array.isArray(buttons) || buttons.length === 0) return null;
    
    return (
      <div className="mt-3 flex flex-wrap gap-1">
        {buttons.map((button: any, index: number) => {
          // Extract button text from string or object format
          let buttonText = "";
          if (typeof button === "string") {
            buttonText = button;
          } else if (button && typeof button === "object" && button.text) {
            buttonText = button.text;
          }
          
          // Render placeholder for empty/invalid button slots
          if (!button || !buttonText || buttonText.trim().length === 0) {
            return (
              <span
                key={index}
                className="rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive"
                title="Empty button slot - edit template to fix"
              >
                [Empty]
              </span>
            );
          }
          
          // Extract button type
          const buttonType = (typeof button === "object" && button.type) ? button.type : "quick_reply";
          
          return (
            <span
              key={index}
              className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary flex items-center gap-1"
            >
              {buttonType === "url" && "🔗"}
              {buttonType === "call" && "📞"}
              {buttonText}
            </span>
          );
        })}
      </div>
    );
  };

  // Helper to get message type icon
  const getMessageTypeIcon = (messageType: string) => {
    switch (messageType) {
      case "image":
      case "image_buttons":
        return <ImageIcon className="h-3 w-3" />;
      case "video_buttons":
        return <Video className="h-3 w-3" />;
      case "document":
        return <FileUp className="h-3 w-3" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold">Templates</h1>
          <p className="text-muted-foreground mt-1">
            Create reusable message templates with media and interactive buttons
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-create-template">
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">No templates yet</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Create your first template to reuse message formats
            </p>
            <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} data-testid={`template-${template.id}`}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  {template.title}
                  {getMessageTypeIcon(template.messageType || "text_buttons")}
                </CardTitle>
                {template.header && (
                  <CardDescription className="font-semibold">{template.header}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3">{template.body}</p>
                {template.footer && (
                  <p className="text-xs text-muted-foreground mt-2">{template.footer}</p>
                )}
                {template.mediaUrl && (
                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                    {getMessageTypeIcon(template.messageType || "text_buttons")}
                    Has media attached
                  </p>
                )}
                {renderButtonBadges(template.buttons)}
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(template)}
                  data-testid={`button-edit-${template.id}`}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm("Delete this template?")) {
                      deleteMutation.mutate(template.id);
                    }
                  }}
                  data-testid={`button-delete-${template.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
            <DialogDescription>
              Design a reusable message template with media, interactive buttons, and rich content
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Template Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Payment Reminder"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  data-testid="input-title"
                />
              </div>

              {/* Message Type Selector */}
              <div className="space-y-2">
                <Label htmlFor="messageType">Message Type *</Label>
                <Select
                  value={formData.messageType}
                  onValueChange={(value) => setFormData({ ...formData, messageType: value, mediaUrl: "", mediaUploadId: null })}
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
                      disabled={uploadingFile || activeChannels.length === 0}
                      data-testid="input-file-upload"
                    />
                    {uploadingFile && <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                  {formData.mediaUrl && (
                    <p className="text-xs text-green-600">File uploaded successfully</p>
                  )}
                  {activeChannels.length === 0 && (
                    <p className="text-xs text-amber-600">No active channels - activate a channel to upload media</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="header">Header</Label>
                <Input
                  id="header"
                  placeholder="Optional header"
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
                  placeholder="Optional footer"
                  value={formData.footer}
                  onChange={(e) => setFormData({ ...formData, footer: e.target.value })}
                  data-testid="input-footer"
                />
              </div>

              {/* Enhanced Button Configuration */}
              {!["image", "document"].includes(formData.messageType) && (
                <div className="space-y-3">
                  <Label>Buttons (Optional - up to 3)</Label>
                  
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.title || !formData.body || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-template"
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>{editingTemplate ? "Update" : "Create"} Template</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
