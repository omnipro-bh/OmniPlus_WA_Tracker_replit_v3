import { cn } from "@/lib/utils";
import type { IndustrySectionHeading } from "@/data/industries";

/** Shared section heading block, matching landing.tsx's rhythm. */
export function SectionHeading({
  copy,
  className,
}: {
  copy: IndustrySectionHeading;
  className?: string;
}) {
  return (
    <div className={cn("mb-14 space-y-4 text-center", className)}>
      <h2 className="text-3xl font-bold tracking-tight lg:text-4xl">{copy.heading}</h2>
      {copy.subtext && (
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">{copy.subtext}</p>
      )}
    </div>
  );
}
