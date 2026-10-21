// Usage: node scripts/shoot.mjs [url] [--full]   (default url: $DEV_URL or http://localhost:5173)
// Saves above-the-fold screenshots at 3 widths to ./shots and prints console errors.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const full = args.includes('--full');
const url = args.find((a) => !a.startsWith('--')) ?? process.env.DEV_URL ?? 'http://localhost:5173';
const out = 'shots';
const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let errorCount = 0;
try {
  for (const v of viewports) {
    const page = await browser.newPage({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    page.on('console', (m) => {
      if (m.type() === 'error') { errorCount++; console.log(`[console:${v.name}] ${m.text()}`); }
    });
    page.on('pageerror', (e) => { errorCount++; console.log(`[pageerror:${v.name}] ${e.message}`); });
    await page.goto(url, { waitUntil: 'networkidle' });
    const path = `${out}/${v.name}${full ? '-full' : ''}.png`;
    await page.screenshot({ path, fullPage: full });
    console.log(path);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`console errors: ${errorCount}`);
process.exitCode = errorCount ? 1 : 0;
