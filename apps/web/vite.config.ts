import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// crypto.subtle / OPFS are secure-context only: plain http on a LAN IP leaves the app stuck on "connecting".
const certDir = path.resolve(import.meta.dirname, ".certs");
const https = fs.existsSync(path.join(certDir, "dev.crt"))
  ? { cert: fs.readFileSync(path.join(certDir, "dev.crt")), key: fs.readFileSync(path.join(certDir, "dev.key")) }
  : undefined;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // Same-origin signaling in dev: works for LAN IPs and later over https (wss) without mixed content.
  server: { ...(https ? { https } : {}), host: true, port: 5180, strictPort: true, proxy: { "/ws": { target: "ws://127.0.0.1:8787", ws: true, xfwd: true } } },
});
