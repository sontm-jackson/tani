import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "Tani — Farmer",
        short_name: "Tani",
        description: "Get paid the moment your delivery is verified.",
        theme_color: "#1b4d3e",
        background_color: "#1b4d3e",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      // Service worker only in production builds. In dev it aggressively caches
      // (stale index.html / favicons), which fights iteration. Test install via
      // `npm run build && npm run preview`.
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: [{ find: "@shared", replacement: fileURLToPath(new URL("../shared/src", import.meta.url)) }],
  },
  server: {
    port: 5174,
    proxy: { "/api": "http://localhost:4000" },
  },
});
