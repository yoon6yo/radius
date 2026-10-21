import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // Same-origin signaling in dev: works for LAN IPs and later over https (wss) without mixed content.
  server: { proxy: { "/ws": { target: "ws://127.0.0.1:8787", ws: true, xfwd: true } } },
});
