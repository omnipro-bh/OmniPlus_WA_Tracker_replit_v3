import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Chatbot() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Chatbot Builder</h1>
        <p className="text-muted-foreground mt-1">
          Create intelligent automated responses for your WhatsApp channels
        </p>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <Bot className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-medium">Chatbot Builder</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            The chatbot builder allows you to create automated conversation flows. Configure your
            chatbot settings in the Workflows section.
          </p>
          <Link href="/workflows">
            <Button className="mt-6" data-testid="button-go-to-workflows">
              Go to Workflows
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
