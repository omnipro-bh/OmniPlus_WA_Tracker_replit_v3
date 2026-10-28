import { Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IndustryIcon } from "@/components/industry/industry-icon";
import { SectionHeading } from "@/components/industry/section-heading";
import type { IndustryDemo, IndustrySectionHeading } from "@/data/industries";

/**
 * "Watch the demo" call to action.
 *
 * Phase A: `demo.htmlPath` is null, so the button renders disabled and NO iframe
 * exists anywhere in the tree. Phase B swaps the disabled button for a shadcn
 * <Dialog> whose content mounts the iframe only while open.
 */
export function DemoSection({
  copy,
  demo,
}: {
  copy: IndustrySectionHeading;
  demo: IndustryDemo;
}) {
  const hasDemo = Boolean(demo.htmlPath);

  return (
    <section id="demo" className="py-20 lg:py-28">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <SectionHeading copy={copy} />

        {/* Placeholder frame — visually reserves the 16:9 area the modal will use. */}
        <div className="overflow-hidden rounded-xl border border-dashed border-border bg-muted/30">
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <IndustryIcon name="bot" className="h-7 w-7" />
            </div>
            {!hasDemo && (
              <Badge variant="outline" className="text-xs">
                {demo.disabledLabel}
              </Badge>
            )}
            <Button size="lg" disabled={!hasDemo} data-testid="button-watch-demo">
              <Play className="mr-2 h-4 w-4" />
              {hasDemo ? demo.label : demo.disabledLabel}
            </Button>
            {demo.caption && (
              <p className="max-w-sm text-xs text-muted-foreground">{demo.caption}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
