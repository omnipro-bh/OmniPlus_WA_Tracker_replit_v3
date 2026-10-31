import { useState } from "react";
import { Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DemoModal } from "@/components/industry/demo-modal";
import { IndustryIcon } from "@/components/industry/industry-icon";
import { SectionHeading } from "@/components/industry/section-heading";
import type { IndustryDemo, IndustrySectionHeading } from "@/data/industries";

/**
 * "Watch the demo" call to action.
 *
 * When `demo.htmlPath` is set the preview frame becomes one big play button that
 * opens `DemoModal`, which mounts the iframe only while open. When it is null the
 * placeholder stays and its button is disabled, so an industry without an
 * animation costs nothing.
 *
 * The preview is a still captured from the animation (`<slug>/demo-thumb.png`).
 * It is a plain `<img>` rather than a CSS background so it carries alt text, and
 * if the file is missing the original placeholder renders instead — a broken
 * thumbnail would be worse than the box it replaced.
 */
export function DemoSection({
  copy,
  demo,
  slug,
}: {
  copy: IndustrySectionHeading;
  demo: IndustryDemo;
  slug: string;
}) {
  const [demoOpen, setDemoOpen] = useState(false);
  const [thumbBroken, setThumbBroken] = useState(false);
  const hasDemo = Boolean(demo.htmlPath);
  const thumbSrc = `/industries/${slug}/demo-thumb.png`;
  const showThumb = hasDemo && !thumbBroken;

  return (
    <section id="demo" className="py-20 lg:py-28">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <SectionHeading copy={copy} />

        {showThumb ? (
          <button
            type="button"
            onClick={() => setDemoOpen(true)}
            aria-label={`Watch the demo: ${demo.modalTitle}`}
            data-testid="button-watch-demo"
            className="group relative block w-full overflow-hidden rounded-xl border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <img
              src={thumbSrc}
              alt={`Preview of the WhatsApp flow: ${demo.modalTitle}`}
              loading="lazy"
              onError={() => setThumbBroken(true)}
              className="block w-full"
              data-testid="img-demo-thumb"
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-background/95 shadow-xl ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-105">
                <Play className="ml-0.5 h-6 w-6 fill-current text-primary" />
              </span>
            </span>
          </button>
        ) : (
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
              <Button
                size="lg"
                disabled={!hasDemo}
                onClick={() => setDemoOpen(true)}
                data-testid="button-watch-demo"
              >
                <Play className="mr-2 h-4 w-4" />
                {hasDemo ? demo.label : demo.disabledLabel}
              </Button>
            </div>
          </div>
        )}

        {demo.caption && (
          <p className="mt-4 text-center text-xs text-muted-foreground">{demo.caption}</p>
        )}
      </div>

      {hasDemo && (
        <DemoModal
          open={demoOpen}
          onOpenChange={setDemoOpen}
          htmlPath={demo.htmlPath}
          title={demo.modalTitle}
        />
      )}
    </section>
  );
}
