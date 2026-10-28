import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Marketing nav for standalone marketing pages.
 *
 * Copy/behaviour mirrors landing.tsx:240-285, with two deliberate differences:
 *  - section links are absolute (/#features …) because this nav renders on a
 *    subpage, not on the landing page itself;
 *  - "Contact" opens the user's mail client instead of the landing-page quote
 *    dialog (that dialog is local state inside Landing and not extractable
 *    without touching landing.tsx).
 *
 * landing.tsx intentionally keeps its own copy of this markup.
 */
export function SiteNav() {
  const { data: authSettings } = useQuery<{
    enableSignin: boolean;
    enableSignup: boolean;
    signupButtonText: string;
  }>({ queryKey: ["/api/settings/auth"] });

  const enableSignin = authSettings?.enableSignin ?? true;
  const enableSignup = authSettings?.enableSignup ?? true;

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/">
            <a
              className="flex items-center gap-2 hover-elevate transition-all"
              data-testid="link-home"
            >
              <MessageSquare className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold">omniplus</span>
            </a>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <a href="/#features" className="text-sm font-medium hover-elevate rounded-md px-3 py-2">
              Features
            </a>
            <a href="/#use-cases" className="text-sm font-medium hover-elevate rounded-md px-3 py-2">
              Use Cases
            </a>
            <a href="/#pricing" className="text-sm font-medium hover-elevate rounded-md px-3 py-2">
              Pricing
            </a>
            <a
              href="mailto:support@omniplus-bh.com"
              className="text-sm font-medium hover-elevate rounded-md px-3 py-2"
              data-testid="link-contact"
            >
              Contact
            </a>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {enableSignin && (
              <Link href="/login">
                <Button variant="ghost" data-testid="button-login">
                  Log In
                </Button>
              </Link>
            )}
            {enableSignup && (
              <Link href="/signup">
                <Button data-testid="button-signup">Sign Up</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
