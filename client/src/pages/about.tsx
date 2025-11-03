import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <a className="flex items-center gap-2 hover-elevate transition-all" data-testid="link-home">
              <MessageSquare className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold">omniplus</span>
            </a>
          </Link>
          <Link href="/">
            <a className="text-sm text-muted-foreground hover:text-foreground" data-testid="link-back">
              Back to Home
            </a>
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">About OMNI PLUS</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
            <p className="text-lg">
              OMNI PLUS is a WhatsApp business automation platform that helps companies communicate and grow faster.
            </p>
            
            <p className="text-base">
              It lets you send broadcast messages, build chatbots, automate tasks and notifications, and manage contacts and campaigns — all from a single, easy-to-use dashboard.
            </p>
            
            <p className="text-base">
              With OMNI PLUS, businesses can streamline customer support, run marketing campaigns, and handle CRM operations in one place, boosting efficiency, engagement, and sales growth.
            </p>

            <div className="pt-6">
              <Link href="/">
                <Button data-testid="button-home">
                  Go to Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
