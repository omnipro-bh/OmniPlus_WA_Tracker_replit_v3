import { Check, Quote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/industry/section-heading";
import type { IndustryCaseStudy, IndustrySectionHeading } from "@/data/industries";

export function CaseStudySection({
  copy,
  caseStudy,
}: {
  copy: IndustrySectionHeading;
  caseStudy: IndustryCaseStudy;
}) {
  return (
    <section id="case-study" className="bg-card/30 py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <SectionHeading copy={copy} />

        <Card>
          <CardContent className="space-y-6 p-8">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {caseStudy.org}
            </p>

            <h3 className="text-2xl font-bold tracking-tight">{caseStudy.headline}</h3>

            <blockquote className="relative border-l-2 border-primary pl-6">
              <Quote className="absolute -left-2.5 -top-1 h-4 w-4 bg-card text-primary" />
              <p className="text-base italic leading-relaxed">{caseStudy.quote}</p>
              <footer className="mt-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{caseStudy.author}</span>
                {", "}
                {caseStudy.role}
              </footer>
            </blockquote>

            {caseStudy.bullets.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2">
                {caseStudy.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
