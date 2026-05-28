// Retry the serial shots with much longer goto + selector timeouts.
import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const here  = dirname(fileURLToPath(import.meta.url));
const OUT   = resolve(here, "../../docs/screenshots");
const PROXY = process.env.PROXY_URL || "http://127.0.0.1:5712";

const SHOTS = [
  { name: "serial-desktop", path: "/serial", w: 1280, h: 900, hold: 3500 },
  { name: "serial-mobile",  path: "/serial", w: 390,  h: 844, hold: 3000 },
];

const browser = await chromium.launch({ headless: true });
const ctx     = await browser.newContext({ colorScheme: "dark", viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

for (const s of SHOTS) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: s.w, height: s.h });
    try {
      // commit/network-idle wait, generous timeouts.
      await page.goto(PROXY + s.path, { waitUntil: "load", timeout: 75000 });
      await page.waitForSelector("header", { timeout: 30000 });
      await page.waitForTimeout(s.hold);
      const file = resolve(OUT, s.name + ".png");
      await page.screenshot({ path: file, fullPage: false });
      const sz = statSync(file).size;
      console.log(`  ${sz > 50000 ? "✓" : "⚠"}  ${s.name.padEnd(28)}  ${s.w}×${s.h}  ${sz} bytes  (try ${attempt})`);
      await page.close();
      break;
    } catch (e) {
      console.log(`  ⏵  ${s.name}  try ${attempt}: ${e.message.split("\n")[0]}`);
      await page.close();
      if (attempt === 3) console.log(`  ✗  ${s.name}  giving up`);
    }
  }
}

await ctx.close();
await browser.close();
