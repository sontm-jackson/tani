import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: "@shared", replacement: fileURLToPath(new URL("../shared/src", import.meta.url)) }],
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:4000" },
  },
});
