/* ---------------------------------------------------------------------------
 * VectiSuite — documentation screenshot capture.
 *
 * Drives the mock device (tools/mock_device.js) with a real browser and writes
 * the full screenshot set used by the READMEs and docs/. Regenerating the docs
 * imagery is one command, so screenshots can never quietly drift from the UI
 * the way hand-captured ones do.
 *
 *   node tools/mock_device.js &            # from the repo root
 *   node ui/scripts/capture-docs.mjs
 *
 * (c) 2026 VectiVolt — Apache-2.0 License
 * ------------------------------------------------------------------------- */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../../docs/screenshots");
const BASE = process.env.BASE || "http://localhost:3137";

const DESKTOP = { width: 1360, height: 900 };
const PHONE = { width: 390, height: 844 };

/** page, tab-label → click the tab and wait for the grid to settle. */
async function pickTab(page, label) {
  const tab = page.locator('[role="tab"]', { hasText: new RegExp(`^${label}$`) });
  if (await tab.count()) {
    await tab.first().click();
    await page.waitForTimeout(500);
  }
}

async function setTheme(page, theme) {
  await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
  // One frame for the CSS custom properties to cascade, one for the charts to
  // re-resolve their stroke colours.
  await page.waitForTimeout(250);
}

const SHOTS = [
  // route, tab, theme, viewport, filename
  ["/dash",   "Overview",    "dark",  DESKTOP, "dash-overview-dark"],
  ["/dash",   "Overview",    "light", DESKTOP, "dash-overview-light"],
  ["/dash",   "Energy",      "dark",  DESKTOP, "dash-energy-dark"],
  ["/dash",   "Controls",    "light", DESKTOP, "dash-controls-light"],
  ["/dash",   "Diagnostics", "dark",  DESKTOP, "dash-diagnostics-dark"],
  ["/dash",   "Widgets",     "dark",  DESKTOP, "dash-widgets-dark"],
  ["/dash",   "Widgets",     "light", DESKTOP, "dash-widgets-light"],
  ["/dash",   "Overview",    "dark",  PHONE,   "dash-overview-phone"],
  ["/dash",   "Widgets",     "light", PHONE,   "dash-widgets-phone"],
  ["/ota",    null,          "dark",  DESKTOP, "ota-dark"],
  ["/ota",    null,          "light", DESKTOP, "ota-light"],
  ["/ota",    null,          "dark",  PHONE,   "ota-phone"],
  ["/serial", null,          "dark",  DESKTOP, "serial-dark"],
  ["/serial", null,          "light", DESKTOP, "serial-light"],
  ["/serial", null,          "dark",  PHONE,   "serial-phone"],
  ["/wifi",   null,          "dark",  DESKTOP, "net-dark"],
  ["/wifi",   null,          "light", DESKTOP, "net-light"],
  ["/wifi",   null,          "dark",  PHONE,   "net-phone"],
];

const browser = await chromium.launch();
mkdirSync(OUT, { recursive: true });
let n = 0;

for (const [route, tab, theme, vp, name] of SHOTS) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  // The dashboard paints from a WebSocket frame, not from the HTML — give the
  // socket a beat to deliver the layout before shooting.
  await page.waitForTimeout(1400);
  await setTheme(page, theme);
  if (tab) await pickTab(page, tab);
  await setTheme(page, theme);          // re-assert: a tab click can remount
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: vp === PHONE });
  await ctx.close();
  n++;
  console.log(`  ✓ ${name}.png  (${vp.width}x${vp.height}, ${theme})`);
}

await browser.close();
console.log(`\n${n} screenshots → docs/screenshots/`);
