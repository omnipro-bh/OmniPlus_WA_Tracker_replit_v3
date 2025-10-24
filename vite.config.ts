// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
// Only used in dev on Replit
// @ts-ignore
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    ...(process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
      ? [
          (await import("@replit/vite-plugin-cartographer")).default?.(),
          runtimeErrorOverlay(),
          (await import("@replit/vite-plugin-dev-banner")).default?.(),
        ]
      : []),
  ],

  resolve: {
    alias: [
      // IMPORTANT: use regex so we match "@/..." only, not "@radix-ui/..."
      { find: /^@\//, replacement: path.resolve(import.meta.dirname, "client", "src") + "/" },
      { find: /^@shared\//, replacement: path.resolve(import.meta.dirname, "shared") + "/" },
      { find: /^@assets\//, replacement: path.resolve(import.meta.dirname, "attached_assets") + "/" },
    ],
  },

  // Build the React client from /client
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    // Output to /app/client-dist
    outDir: path.resolve(import.meta.dirname, "client-dist"),
    emptyOutDir: true,
    sourcemap: false,
  },

  // Works behind Coolify’s domain
  base: "/",

  // Dev server hardening
  server: {
    fs: { strict: true, deny: ["**/.**"] },
  },
});
