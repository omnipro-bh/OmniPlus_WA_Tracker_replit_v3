import { Button } from "@/components/ui/button";
import type { IndustryCta } from "@/data/industries";

export function FinalCtaSection({ cta }: { cta: IndustryCta }) {
  return (
    <section id="cta" className="py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-info/10 px-6 py-14 text-center lg:px-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
          />
          <div className="relative mx-auto max-w-2xl space-y-6">
            <h2 className="text-3xl font-bold tracking-tight lg:text-4xl">{cta.heading}</h2>
            {cta.subtext && <p className="text-lg text-muted-foreground">{cta.subtext}</p>}
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <a href={cta.primaryHref}>{cta.primaryLabel}</a>
              </Button>
              {cta.secondaryLabel && cta.secondaryHref && (
                <Button asChild size="lg" variant="outline">
                  <a href={cta.secondaryHref}>{cta.secondaryLabel}</a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
