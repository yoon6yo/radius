// Usage: PLAYWRIGHT_BROWSERS_PATH=... node run.mjs   (needs `npm i` here first)
import { build } from "esbuild";
import { chromium } from "../../../apps/web/node_modules/playwright/index.mjs";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const { outputFiles } = await build({
  entryPoints: [dir + "entry.js"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  loader: { ".wasm": "file" },
  assetNames: "[name]",
  outdir: "/virtual",
  conditions: ["browser"],
  define: { "import.meta.url": '"http://127.0.0.1:5199/"' },
});
const files = new Map(outputFiles.map((f) => [f.path.split("/").pop(), f.contents]));
files.set("zstd.wasm", readFileSync(dir + "node_modules/@bokuweb/zstd-wasm/dist/web/zstd.wasm"));
const server = createServer((req, res) => {
  const name = req.url.slice(1);
  if (name === "") res.end('<script src="/entry.js"></script>');
  else if (files.has(name)) res.end(files.get(name));
  else if (name.endsWith(".wasm")) (res.setHeader("content-type", "application/wasm"), res.end(files.get(name)));
  else (res.statusCode = 404), res.end();
}).listen(5199, "127.0.0.1");

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on("pageerror", (e) => console.error("pageerror", e.message));
await page.goto("http://127.0.0.1:5199/");
const out = await page.evaluate(() => window.runBench());
console.log(`Chromium ${browser.version()}  (main thread, 4 MiB blocks, 64 MiB/set, best of N)`);
console.log("\nHash (MB/s)");
for (const h of out.hash) console.log(`  ${h.name.padEnd(28)} ${h.mbps.toFixed(0).padStart(7)}`);
console.log("\nCompress (ratio = out/in; MB/s)");
console.log("  set     algo                 ratio  comp   decomp");
for (const r of out.rows)
  console.log(`  ${r.set.padEnd(7)} ${r.name.padEnd(20)} ${r.ratio.toFixed(3)} ${r.cMBps.toFixed(0).padStart(6)} ${r.dMBps.toFixed(0).padStart(7)}`);
await browser.close();
server.close();
process.exit(0);
