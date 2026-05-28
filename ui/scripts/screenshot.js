// ---------------------------------------------------------------------------
// JouleSuite UI · screenshot
// Author: Chinmoy Bhuyan <dikibhuyan@gmail.com>  (c) 2026 — MIT
// ---------------------------------------------------------------------------
//
// In-process screenshot pipeline using Playwright. Replaces the fragile
// `chrome --headless --screenshot` shell loop — Playwright keeps a single
// browser instance alive, waits for actual page-load + network-idle, and
// can poll until a specific selector renders before capturing. Much more
// reliable on weak Wi-Fi where the underlying device may take 5–15 s to
// finish streaming a chunked response.
//
//   PROXY_URL=http://127.0.0.1:5712 node scripts/screenshot.js

import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, statSync } from "node:fs";

const here  = dirname(fileURLToPath(import.meta.url));
const OUT   = resolve(here, "../../docs/screenshots");
const PROXY = process.env.PROXY_URL || "http://127.0.0.1:5712";

mkdirSync(OUT, { recursive: true });

const SHOTS = [
  // ---- Desktop 1280×900 ----
  { name: "dash-desktop-overview",  path: "/dash",                w: 1280, h: 900,  wait: ".joule-card", hold: 2500 },
  { name: "dash-desktop-energy",    path: "/dash#energy",         w: 1280, h: 900,  wait: ".joule-card", hold: 2500 },
  { name: "dash-desktop-controls",  path: "/dash#controls",       w: 1280, h: 900,  wait: ".joule-card", hold: 1500 },
  { name: "dash-desktop-diag",      path: "/dash#diagnostics",    w: 1280, h: 900,  wait: ".joule-card", hold: 2500 },
  { name: "ota-desktop",            path: "/ota",                 w: 1280, h: 900,  wait: ".joule-card", hold: 1500 },
  { name: "wifi-desktop",           path: "/wifi",                w: 1280, h: 1100, wait: ".joule-card", hold: 3000 },
  { name: "serial-desktop",         path: "/serial",              w: 1280, h: 900,  wait: "header",      hold: 2500 },

  // ---- Mobile 390×844 (iPhone 14) ----
  { name: "dash-mobile-overview",   path: "/dash",                w: 390,  h: 844,  wait: ".joule-card", hold: 2500 },
  { name: "dash-mobile",            path: "/dash",                w: 390,  h: 844,  wait: ".joule-card", hold: 2500 },
  { name: "ota-mobile",             path: "/ota",                 w: 390,  h: 844,  wait: ".joule-card", hold: 1500 },
  { name: "wifi-mobile",            path: "/wifi",                w: 390,  h: 900,  wait: ".joule-card", hold: 3000 },
  { name: "serial-mobile",          path: "/serial",              w: 390,  h: 844,  wait: "header",      hold: 2000 },
];

const browser = await chromium.launch({ headless: true });
const ctx     = await browser.newContext({
  colorScheme: "dark",                   // ensure dark theme even with auto-detect
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});

const results = [];
for (const s of SHOTS) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: s.w, height: s.h });
  try {
    await page.goto(PROXY + s.path, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(s.wait, { timeout: 25000 });
    // Wait extra ms so WebSocket layout + first value batch arrive and the
    // dashboard renders cards before we snapshot.
    await page.waitForTimeout(s.hold);
    const file = resolve(OUT, s.name + ".png");
    await page.screenshot({ path: file, fullPage: false });
    const sz = statSync(file).size;
    console.log(`  ${sz > 50000 ? "✓" : "⚠"}  ${s.name.padEnd(28)}  ${String(s.w).padStart(4)}×${String(s.h).padEnd(4)}  ${String(sz).padStart(7)} bytes`);
    results.push({ ...s, sz, ok: sz > 50000 });
  } catch (e) {
    console.log(`  ✗  ${s.name}  FAIL  ${e.message.split("\n")[0]}`);
    results.push({ ...s, sz: 0, ok: false, err: e.message });
  } finally {
    await page.close();
  }
}

await ctx.close();
await browser.close();

const ok = results.filter(r => r.ok).length;
console.log(`\n${ok} / ${results.length} shots captured`);
process.exit(ok === results.length ? 0 : 1);
