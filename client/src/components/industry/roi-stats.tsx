import { SectionHeading } from "@/components/industry/section-heading";
import type { IndustrySectionHeading, IndustryStat } from "@/data/industries";

export function RoiStatsSection({
  copy,
  stats,
}: {
  copy: IndustrySectionHeading;
  stats: IndustryStat[];
}) {
  return (
    <section id="results" className="bg-card/30 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeading copy={copy} />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-border bg-background p-6 text-center"
            >
              <p className="text-4xl font-bold tracking-tight text-primary">{stat.value}</p>
              <p className="mt-2 text-sm font-medium">{stat.label}</p>
              {stat.note && (
                <p className="mt-2 text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">
                  {stat.note}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
