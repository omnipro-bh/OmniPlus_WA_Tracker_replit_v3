import { IndustryIcon } from "@/components/industry/industry-icon";
import { SectionHeading } from "@/components/industry/section-heading";
import type { IndustrySectionHeading, IndustryStep } from "@/data/industries";

export function HowItWorksSection({
  copy,
  steps,
}: {
  copy: IndustrySectionHeading;
  steps: IndustryStep[];
}) {
  return (
    <section id="how-it-works" className="py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeading copy={copy} />

        <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="relative rounded-lg border border-border p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <IndustryIcon name={step.icon} className="h-5 w-5" />
                </div>
                <span className="text-2xl font-bold text-muted-foreground/40">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mb-2 text-sm font-semibold leading-snug">{step.title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
