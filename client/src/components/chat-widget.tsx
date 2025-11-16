import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

export function ChatWidget() {
  const [location] = useLocation();
  const isHomepage = location === "/" || location === "";

  // Fetch chat widget location setting
  const { data: settings, isLoading } = useQuery<{ chatWidgetLocation: string }>({
    queryKey: ["/api/settings/chat-widget-location"],
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const chatWidgetLocation = settings?.chatWidgetLocation || "all-pages";

  useEffect(() => {
    // Wait for settings to load before making any decisions
    if (isLoading) {
      return;
    }

    // Helper function to cleanup Tawk.to completely
    const cleanupTawkWidget = () => {
      // Remove script tag
      const existingScript = document.getElementById("tawk-script");
      if (existingScript) {
        existingScript.remove();
      }

      // Remove all Tawk.to DOM elements (they use dynamic IDs)
      const tawkElements = document.querySelectorAll('[id^="tawk_"], [id^="tawkchat"]');
      tawkElements.forEach((el) => el.remove());

      // Reset Tawk_API state
      if ((window as any).Tawk_API) {
        try {
          if (typeof (window as any).Tawk_API.hideWidget === 'function') {
            (window as any).Tawk_API.hideWidget();
          }
        } catch (e) {
          // Ignore errors during cleanup
        }
        delete (window as any).Tawk_API;
        delete (window as any).Tawk_LoadStart;
      }
    };

    // Determine if widget should be shown
    const shouldShowWidget = chatWidgetLocation === "all-pages" || 
                            (chatWidgetLocation === "homepage-only" && isHomepage);

    if (!shouldShowWidget) {
      cleanupTawkWidget();
      return;
    }

    // Check if script already exists
    if (document.getElementById("tawk-script")) {
      // Widget should be shown and script exists, show the widget if it was hidden
      if ((window as any).Tawk_API && typeof (window as any).Tawk_API.showWidget === 'function') {
        (window as any).Tawk_API.showWidget();
      }
      return;
    }

    // Load Tawk.to script
    const script = document.createElement("script");
    script.id = "tawk-script";
    script.type = "text/javascript";
    script.async = true;
    script.src = "https://embed.tawk.to/690896ac607713194fe5092a/1j94op4kn";
    script.charset = "UTF-8";
    script.setAttribute("crossorigin", "*");

    // Initialize Tawk_API
    (window as any).Tawk_API = (window as any).Tawk_API || {};
    (window as any).Tawk_LoadStart = new Date();

    document.body.appendChild(script);

    // Cleanup only runs on component unmount, not on every effect re-run
  }, [chatWidgetLocation, isHomepage, isLoading]);

  return null; // This component doesn't render anything
}
