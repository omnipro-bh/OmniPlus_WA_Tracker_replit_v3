import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IndustryIcon } from "@/components/industry/industry-icon";
import { SectionHeading } from "@/components/industry/section-heading";
import type { IndustryFeatureGroup, IndustrySectionHeading } from "@/data/industries";

export function DepartmentFeaturesSection({
  copy,
  featureGroups,
}: {
  copy: IndustrySectionHeading;
  featureGroups: IndustryFeatureGroup[];
}) {
  return (
    <section id="capabilities" className="bg-card/30 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeading copy={copy} />

        <div className="grid gap-6 md:grid-cols-2">
          {featureGroups.map((group) => (
            <Card
              key={group.department}
              className="flex flex-col"
              data-testid={`department-${group.department}`}
            >
              <CardHeader className="border-b border-border">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <IndustryIcon name={group.icon} className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{group.label}</CardTitle>
                    <p className="text-sm text-muted-foreground">{group.tagline}</p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex-1 divide-y divide-border pt-4">
                {group.features.map((feature) => (
                  <div key={feature.title} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <IndustryIcon
                      name={feature.icon}
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium leading-none">{feature.title}</p>
                        {feature.badge && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                            {feature.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
