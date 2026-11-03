// client/src/components/chat/phone-frame.tsx
//
// CSS-only device frame for the public web chat. Renders the device chrome
// (rounded screen, dark bezel, notch, shadow) around any child. Contains no chat
// logic — this is pure presentation.
//
// Desktop (md+): fixed portrait ratio, centered vertically by its parent, with
//                the bezel + notch visible.
// Mobile (<md):  edge-to-edge full height, no bezel or notch (the chat fills
//                the screen).

import type { ReactNode } from "react";

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#111] shadow-2xl md:mx-auto md:aspect-[9/19.5] md:h-[min(92dvh,780px)] md:w-auto md:rounded-[2.5rem] md:border-[10px] md:border-[#1a1a1a]">
      {/* Notch (desktop only) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[10px] z-20 hidden h-5 w-32 -translate-x-1/2 rounded-full bg-[#111] md:block"
      />

      {/* Screen */}
      <div className="relative min-h-0 flex-1 overflow-hidden md:rounded-[1.9rem]">
        {children}
      </div>
    </div>
  );
}

export default PhoneFrame;
