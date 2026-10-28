import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IndustryIcon } from "@/components/industry/industry-icon";
import { SectionHeading } from "@/components/industry/section-heading";
import type { IndustryPainPoint, IndustrySectionHeading } from "@/data/industries";

export function PainPointsSection({
  copy,
  painPoints,
}: {
  copy: IndustrySectionHeading;
  painPoints: IndustryPainPoint[];
}) {
  return (
    <section id="pain-points" className="bg-card/30 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeading copy={copy} />

        <div className="grid gap-6 md:grid-cols-2">
          {painPoints.map((point) => (
            <Card key={point.title} className="hover-elevate transition-all">
              <CardHeader>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <IndustryIcon name={point.icon} className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">{point.title}</CardTitle>
                <CardDescription>{point.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
