import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import { Link } from "wouter";

export default function ButtonTerms() {
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
            <CardTitle className="text-3xl">Terms of Use for Button Functionality on WhatsApp API</CardTitle>
            <p className="text-sm text-muted-foreground">Last Updated: November 2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p>
              By activating the button functionality in WhatsApp through OMNI PLUS, you agree to the terms outlined in this document.
            </p>

            <h3>1. Functionality Description</h3>
            <p>
              The endpoint for sending interactive button messages via OMNI PLUS API is used to send messages with buttons that allow users to engage, reply, or open URLs within WhatsApp.
            </p>

            <h3>2. Disclaimer</h3>
            <p>
              OMNI PLUS is not responsible for any changes, suspension, or removal of button features by Meta Platforms Inc. Meta may modify or discontinue such functionality at any time without prior notice.
            </p>

            <h3>3. Risk Notice</h3>
            <p>
              Users acknowledge that Meta may, at its discretion, modify, limit, or terminate button features without notice. OMNI PLUS assumes no liability for resulting data interruptions or business losses.
            </p>

            <h3>4. Limitation of Liability</h3>
            <p>
              OMNI PLUS shall not be liable for direct, indirect, incidental, or consequential damages arising from changes in WhatsApp's interactive button functionality by Meta Platforms Inc.
            </p>

            <h3>5. Changes to Terms</h3>
            <p>
              OMNI PLUS reserves the right to update these terms at any time. Continued use after updates constitutes acceptance of the new terms.
            </p>

            <h3>6. Contact</h3>
            <p>
              <strong>OMNI PLUS Support Team</strong><br />
              <a href="mailto:support@omniplus-bh.com">support@omniplus-bh.com</a><br />
              Manama, Kingdom of Bahrain
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
