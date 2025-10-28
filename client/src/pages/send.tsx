import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Send as SendIcon, Loader2 } from "lucide-react";
import type { Channel, Template } from "@shared/schema";
import { Link } from "wouter";

export default function Send() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    channelId: "",
    templateId: "",
    to: "",
    name: "",
    email: "",
    header: "",
    body: "",
    footer: "",
    buttons: ["", "", ""],
  });

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
    enabled: !!user,
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
    enabled: !!user,
  });

  const sendMutation = useMutation({
    mutationFn: async (data: any) => {
      // Convert button strings to WHAPI button objects
      const buttons = data.buttons
        .filter((b: string) => b.trim() !== "")
        .map((title: string, index: number) => ({
          type: "quick_reply",
          title: title.trim(),
          id: `btn${index + 1}`,
        }));

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
        buttons: ["", "", ""],
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
      setFormData({
        ...formData,
        templateId,
        header: template.header || "",
        body: template.body,
        footer: template.footer || "",
        buttons: [
          template.buttons[0] || "",
          template.buttons[1] || "",
          template.buttons[2] || "",
        ],
      });
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
              <Label htmlFor="body">Body *</Label>
              <Textarea
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

            <div className="space-y-2">
              <Label>Buttons (up to 3)</Label>
              <div className="space-y-2">
                {formData.buttons.map((button, index) => (
                  <Input
                    key={index}
                    placeholder={`Button ${index + 1}`}
                    value={button}
                    onChange={(e) => {
                      const newButtons = [...formData.buttons];
                      newButtons[index] = e.target.value;
                      setFormData({ ...formData, buttons: newButtons });
                    }}
                    data-testid={`input-button-${index + 1}`}
                  />
                ))}
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => sendMutation.mutate(formData)}
              disabled={!canSend || !formData.channelId || !formData.to || !formData.body || sendMutation.isPending}
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
            <CardDescription>How your message will look</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-[#DCF8C6] dark:bg-[#005C4B] p-4 max-w-sm">
              {formData.header && (
                <div className="font-semibold mb-2 text-sm">{formData.header}</div>
              )}
              <div className="whitespace-pre-wrap text-sm">
                {formData.body || "Your message will appear here..."}
              </div>
              {formData.footer && (
                <div className="text-xs text-muted-foreground mt-2">{formData.footer}</div>
              )}
              {formData.buttons.some((b) => b.trim()) && (
                <div className="mt-3 space-y-1">
                  {formData.buttons
                    .filter((b) => b.trim())
                    .map((button, index) => (
                      <button
                        key={index}
                        className="w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm font-medium hover-elevate"
                      >
                        {button}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
