import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { IndustryIcon } from "@/components/industry/industry-icon";
import { SectionHeading } from "@/components/industry/section-heading";
import type { IndustryComplianceBadge, IndustrySectionHeading } from "@/data/industries";

export function ComplianceSection({
  copy,
  badges,
}: {
  copy: IndustrySectionHeading;
  badges: IndustryComplianceBadge[];
}) {
  return (
    <section id="compliance" className="py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeading copy={copy} />

        <div className="grid gap-6 md:grid-cols-2">
          {badges.map((badge) => (
            <div
              key={badge.label}
              className="flex gap-4 rounded-lg border border-border p-6"
              data-testid={`compliance-${badge.label}`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <IndustryIcon name={badge.icon} className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">{badge.label}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {badge.description}
                </p>
                {badge.href && (
                  <Link href={badge.href}>
                    <a className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      {badge.hrefLabel ?? badge.label}
                      <ArrowRight className="h-3 w-3" />
                    </a>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
