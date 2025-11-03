import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import { Link } from "wouter";

export default function TermsConditions() {
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
            <CardTitle className="text-3xl">Terms & Conditions</CardTitle>
            <p className="text-sm text-muted-foreground">Last Updated: November 2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p>
              By accessing or using OMNI PLUS (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree with any of these Terms, please discontinue use of the Service. If anything in these Terms is unclear, contact us at <a href="mailto:support@omniplus-bh.com">support@omniplus-bh.com</a>.
            </p>
            <p>
              <strong>Note:</strong> Use of WhatsApp button functionality is subject to additional terms described in the <Link href="/button-terms"><a className="text-primary hover:underline">Terms of Use for Button Functionality on WhatsApp with OMNI PLUS API</a></Link>.
            </p>

            <h3>2. Changes to These Terms</h3>
            <p>
              We may modify these Terms from time to time—for example, when introducing new features or for compliance with Bahraini law. Any revised Terms become effective 30 days after posting (the "Last Updated" date above). Your continued use of the Service after that date constitutes acceptance.
            </p>

            <h3>3. Privacy Policy</h3>
            <p>
              Our collection and use of your data are described in the <Link href="/privacy-policy"><a className="text-primary hover:underline">OMNI PLUS Privacy Policy</a></Link>. Please review it carefully.
            </p>

            <h3>4. Account Creation and Security</h3>
            <p>
              When creating an account, you must provide accurate information and keep your login credentials secure. You are responsible for all activities occurring under your account. If you suspect any unauthorized use or security breach, immediately email <a href="mailto:support@omniplus-bh.com">support@omniplus-bh.com</a>.
            </p>

            <h3>5. Service Fees and Payments</h3>
            <p>
              Service fees are displayed on the OMNI PLUS website. All payments are due in advance according to your selected plan. We reserve the right to revise pricing with 10 days' prior notice. Refunds, when applicable, will be processed net of any payment-gateway fees. Non-use of the Service after payment does not constitute grounds for a refund.
            </p>

            <h3>6. Subscription Cancellation</h3>
            <p>
              You may cancel your subscription at any time through your account dashboard or by contacting our support team. Cancellation takes effect at the end of the current paid term.
            </p>

            <h3>7. Third-Party Services</h3>
            <p>
              Our Service may link to or rely on third-party software or platforms (including WhatsApp by Meta Platforms Inc.). Use of those services is subject to their own terms and policies. OMNI PLUS is not responsible for any third-party actions or failures.
            </p>

            <h3>8. Disclaimer and Limitation of Liability</h3>
            <p>
              OMNI PLUS is an independent automation platform for business communications via WhatsApp and other channels. It is not endorsed by or affiliated with WhatsApp™, Meta™, or any subsidiary.
            </p>
            <p>
              Using OMNI PLUS may involve interaction with WhatsApp systems subject to Meta's policies. OMNI PLUS assumes no liability if WhatsApp restricts or blocks accounts for violations of its own terms.
            </p>
            <p>
              The Service is provided "as is." Temporary interruptions may occur due to platform updates or external network issues. OMNI PLUS is not liable for business losses arising from downtime and does not issue refunds for such events.
            </p>

            <h3>9. User Content and Conduct</h3>
            <p>
              You are responsible for all data and communications you transmit through the Service. You must not:
            </p>
            <ul>
              <li>Send defamatory, fraudulent, or illegal content</li>
              <li>Infringe intellectual property rights</li>
              <li>Send spam</li>
              <li>Share third-party data without consent</li>
              <li>Promote violence or hate</li>
            </ul>
            <p>
              Violation may result in account termination without refund and possible legal action under Bahraini law.
            </p>

            <h3>10. Termination</h3>
            <p>
              We may suspend or terminate access at any time if you breach these Terms or applicable law. You may terminate your account voluntarily by closing it through the dashboard.
            </p>

            <h3>11. Contact</h3>
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
