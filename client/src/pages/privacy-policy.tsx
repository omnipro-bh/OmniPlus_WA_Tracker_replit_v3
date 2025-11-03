import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import { Link } from "wouter";

export default function PrivacyPolicy() {
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
            <CardTitle className="text-3xl">Privacy Policy</CardTitle>
            <p className="text-sm text-muted-foreground">Last Updated: November 2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p>
              This Privacy Policy describes how OMNI PLUS collects, uses, and protects personal data of users in accordance with the data protection standards applicable in the Kingdom of Bahrain.
            </p>

            <h3>1. Information Collection</h3>
            <p>
              We collect information provided directly by users (e.g., registration data, contact details) and data automatically generated during Service use, including IP addresses, device information, and browser logs.
            </p>

            <h3>2. Use of Information</h3>
            <p>
              We use collected data to operate, maintain, and improve our services; provide technical support; and communicate updates or changes. We may also analyze usage trends for service optimization.
            </p>

            <h3>3. Data Retention</h3>
            <p>
              Personal data is retained only as long as necessary for the purpose collected or required by Bahraini law. Users may request deletion or correction of personal data by contacting <a href="mailto:support@omniplus-bh.com">support@omniplus-bh.com</a>.
            </p>

            <h3>4. Security</h3>
            <p>
              We implement administrative, technical, and physical safeguards to protect user data from unauthorized access or misuse. Despite our efforts, no system can be guaranteed 100% secure.
            </p>

            <h3>5. Sharing of Information</h3>
            <p>
              OMNI PLUS may share limited personal data with third-party providers strictly to enable service delivery. Data will not be sold, rented, or shared for marketing without consent.
            </p>

            <h3>6. International Data Transfer</h3>
            <p>
              Data may be transferred or processed outside Bahrain only where adequate protection measures are in place.
            </p>

            <h3>7. User Rights</h3>
            <p>
              Users have the right to access, correct, or delete their data and to withdraw consent for processing by contacting OMNI PLUS support.
            </p>

            <h3>8. Contact</h3>
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
