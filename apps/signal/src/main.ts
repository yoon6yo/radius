import { startSignalServer } from "./server.ts";

const origins = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean);
const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid PORT: ${process.env.PORT}`);

const server = await startSignalServer({
  port,
  trustProxy: process.env.TRUST_PROXY === "1",
  ...(origins?.length ? { allowedOrigins: origins } : {}),
});
console.log(`signal listening on :${server.port}`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => void server.close().then(() => process.exit(0)));
}
