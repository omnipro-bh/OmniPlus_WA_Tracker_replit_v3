import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { GitBranch, Copy } from "lucide-react";
import type { Workflow } from "@shared/schema";

export default function Workflows() {
  const { toast } = useToast();
  const [webhookToken, setWebhookToken] = useState("");

  const { data: workflows = [] } = useQuery<Workflow[]>({
    queryKey: ["/api/workflows"],
  });

  const webhookUrl = `${window.location.origin}/webhooks/whapi`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Workflows & Chatbot</h1>
        <p className="text-muted-foreground mt-1">
          Build automated conversation flows and chatbot responses
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Webhook & Credentials</CardTitle>
          <CardDescription>
            Configure your WHAPI integration to receive incoming messages
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Incoming Webhook URL</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-sm" />
              <Button
                variant="outline"
                onClick={() => copyToClipboard(webhookUrl)}
                data-testid="button-copy-webhook"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this URL to your WHAPI webhook configuration to receive messages
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="token">WHAPI Authorization Token</Label>
            <Input
              id="token"
              type="password"
              placeholder="Enter your WHAPI token"
              value={webhookToken}
              onChange={(e) => setWebhookToken(e.target.value)}
              data-testid="input-whapi-token"
            />
            <p className="text-xs text-muted-foreground">
              Your personal WHAPI token for authenticated requests
            </p>
          </div>

          <Button data-testid="button-save-credentials">
            Save Credentials
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="blocks">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="blocks">Blocks</TabsTrigger>
          <TabsTrigger value="greeting">Greeting</TabsTrigger>
          <TabsTrigger value="routing">Routing</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>

        <TabsContent value="blocks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Message Blocks</CardTitle>
              <CardDescription>
                Create reusable blocks for chatbot responses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <GitBranch className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium">No blocks yet</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Create message blocks to build automated conversation flows
                </p>
                <Button className="mt-4">Create Block</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="greeting">
          <Card>
            <CardHeader>
              <CardTitle>Greeting Message</CardTitle>
              <CardDescription>
                Set the initial message sent to new conversations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Configure your chatbot's greeting message here
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="routing">
          <Card>
            <CardHeader>
              <CardTitle>Message Routing</CardTitle>
              <CardDescription>
                Define how messages are routed through your workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Set up routing rules and conversation paths
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debug">
          <Card>
            <CardHeader>
              <CardTitle>Debug & Testing</CardTitle>
              <CardDescription>
                Test your chatbot and view incoming messages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Debug tools and message logs will appear here
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
