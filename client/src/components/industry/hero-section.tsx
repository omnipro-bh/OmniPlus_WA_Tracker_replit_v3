import { Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IndustryIcon } from "@/components/industry/industry-icon";
import type { IndustryConfig } from "@/data/industries";

/**
 * CSS-only hero. No image asset: the visual is a WhatsApp-style conversation
 * mockup built from `config.heroMock`, on a soft gradient.
 */
export function HeroSection({ config }: { config: IndustryConfig }) {
  return (
    <section id="hero" className="relative overflow-hidden py-20 lg:py-28">
      {/* Decorative gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-info/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Copy */}
          <div className="space-y-8">
            <div className="space-y-4">
              {config.eyebrow && (
                <Badge variant="secondary" className="px-3 py-1">
                  {config.eyebrow}
                </Badge>
              )}
              <h1 className="text-4xl font-bold tracking-tight lg:text-6xl">
                {config.headline}
              </h1>
              <p className="text-lg text-muted-foreground">{config.subtext}</p>
            </div>

            {config.heroBullets && config.heroBullets.length > 0 && (
              <ul className="space-y-3">
                {config.heroBullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="text-sm text-muted-foreground">{bullet}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <a href={config.cta.primaryHref}>{config.cta.primaryLabel}</a>
              </Button>
              {config.cta.secondaryLabel && config.cta.secondaryHref && (
                <Button asChild size="lg" variant="outline">
                  <a href={config.cta.secondaryHref}>{config.cta.secondaryLabel}</a>
                </Button>
              )}
            </div>
          </div>

          {/* Mockup */}
          {config.heroMock && (
            <div className="relative mx-auto w-full max-w-sm">
              <div className="rounded-2xl border border-border bg-card p-3 shadow-2xl">
                {/* Chat header */}
                <div className="flex items-center gap-3 border-b border-border pb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <IndustryIcon name="bot" className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{config.heroMock.header}</p>
                    {config.heroMock.status && (
                      <p className="truncate text-xs text-muted-foreground">
                        {config.heroMock.status}
                      </p>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="space-y-2 py-4">
                  {config.heroMock.messages.map((message, index) => {
                    const fromBusiness = message.from === "business";
                    return (
                      <div
                        key={`${message.from}-${index}`}
                        className={
                          fromBusiness
                            ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2"
                            : "mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2"
                        }
                      >
                        <p
                          className={
                            fromBusiness
                              ? "text-xs leading-relaxed text-primary-foreground"
                              : "text-xs leading-relaxed text-foreground"
                          }
                        >
                          {message.text}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Composer */}
                <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2">
                  <span className="flex-1 truncate text-xs text-muted-foreground">
                    {config.heroMock.inputPlaceholder ?? ""}
                  </span>
                  <Send className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
