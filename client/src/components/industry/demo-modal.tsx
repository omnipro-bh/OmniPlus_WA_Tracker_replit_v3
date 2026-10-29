import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Watch the demo" modal, shared by the hero play button and the demo section.
 *
 * The iframe is mounted only while `open` is true. The animation in
 * `medical.html` autoplays and loops forever, so unmounting it on close means
 * every open restarts at step 1 instead of resuming mid-conversation.
 *
 * Sizing: the animation is authored for a *landscape* 790x680 stage (phone and
 * feature list side by side) and only reflows to a stacked 380x1010 layout
 * below 760px of its own width. It also self-scales to its viewport (`fit()` in
 * medical.html), so the frame needs a real, wide box. A portrait
 * `aspect-[9/19]` frame would push it under that 760px breakpoint and shrink
 * the phone mockup to roughly 140px wide on a phone.
 *
 * Measured inside the frame (width x height -> phone width): 896x720 -> 306px,
 * 780x660 -> 280px, 348x534 -> 156px. Stacked mode is height-driven, so the
 * frame is kept as tall as the viewport allows. Height stays in `dvh` so the
 * dialog never exceeds the visible viewport under mobile browser chrome.
 */
export function DemoModal({
  open,
  onOpenChange,
  htmlPath,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  htmlPath: string | null;
  title: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 px-6 pb-4 pr-14 pt-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Animated walkthrough of a WhatsApp conversation. Playback starts
            automatically.
          </DialogDescription>
        </DialogHeader>

        {open && htmlPath && (
          <iframe
            src={htmlPath}
            title={title}
            loading="lazy"
            allow="autoplay; fullscreen"
            className="block h-[min(80dvh,720px)] w-full border-0 bg-background"
            data-testid="iframe-demo"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
