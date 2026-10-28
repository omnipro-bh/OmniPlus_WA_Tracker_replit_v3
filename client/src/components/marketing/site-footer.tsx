import { MessageSquare } from "lucide-react";

/**
 * Marketing footer for standalone marketing pages.
 *
 * Copy mirrors landing.tsx:653-736. "Contact" is a mailto link here because the
 * landing-page quote dialog lives in Landing's local state.
 *
 * landing.tsx intentionally keeps its own copy of this markup.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold">omniplus</span>
            </div>
            <p className="text-sm text-muted-foreground">
              The all-in-one WhatsApp automation platform for modern businesses.
            </p>
          </div>

          <div>
            <h3 className="mb-4 font-semibold">Product</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="/#features" className="hover:text-foreground">
                  Features
                </a>
              </li>
              <li>
                <a href="/#pricing" className="hover:text-foreground">
                  Pricing
                </a>
              </li>
              <li>
                <a href="/#use-cases" className="hover:text-foreground">
                  Use Cases
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-semibold">Company</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="/about" className="hover:text-foreground" data-testid="link-about">
                  About
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@omniplus-bh.com"
                  className="hover:text-foreground"
                  data-testid="link-footer-contact"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-semibold">Legal</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="/privacy-policy" className="hover:text-foreground" data-testid="link-privacy">
                  Privacy
                </a>
              </li>
              <li>
                <a href="/terms-conditions" className="hover:text-foreground" data-testid="link-terms">
                  Terms
                </a>
              </li>
              <li>
                <a href="/button-terms" className="hover:text-foreground" data-testid="link-button-terms">
                  Button Terms
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-8 text-center text-sm text-muted-foreground">
          © 2024 OmniPlus. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
