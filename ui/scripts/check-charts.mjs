// ---------------------------------------------------------------------------
// VectiSuite UI · chart regression check
//
//   node scripts/check-charts.mjs          # needs `npm run build` first
//
// Guards the one thing about these charts that unit tests cannot see: they are
// drawn by the browser, so "did it repaint" is a pixel question. Both charts
// used to read their colours from getComputedStyle at draw time and repaint
// only when a ResizeObserver fired, so a theme toggle left the old palette on
// screen until something resized the card. Both are SVG now and the colours are
// var() references the browser re-resolves itself — this asserts that stays
// true, plus the MultiChart behaviours that are easy to break while editing the
// path builder.
//
// Starts tools/mock_device.js itself if nothing is listening on 3137.
// (c) 2026 VectiVolt — Apache-2.0 License
// ---------------------------------------------------------------------------
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3137";

let mock = null;
if (!(await fetch(`${BASE}/dash`).then((r) => r.ok).catch(() => false))) {
  mock = spawn("node", [resolve(here, "../../tools/mock_device.js")], { stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    if (await fetch(`${BASE}/dash`).then((r) => r.ok).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
}

const T = [];
const ok = (name, cond, detail = "") => {
  T.push(cond);
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();

// ---- 1. theme toggle repaints, with no resize -------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/dash`, { waitUntil: "networkidle" });
  await page.waitForSelector("button.tab");

  for (const [name, tab, sel] of [
    ["multichart", "Widgets", "svg.plot"],
    ["shell chart", "Energy", "svg.chart"],
  ]) {
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await page.locator("button.tab", { hasText: new RegExp(`^${tab}$`) }).first().click();
    await page.waitForTimeout(600);
    const before = await page.locator(sel).first().screenshot();
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.evaluate(() => new Promise(requestAnimationFrame));   // exactly one frame
    const after = await page.locator(sel).first().screenshot();
    ok(`${name}: pixels change on data-theme flip, no resize`, !before.equals(after));
  }

  // the OS flipping while the app sits on "auto" — handled by theme.css, not JS
  await page.locator("button.tab", { hasText: /^Widgets$/ }).first().click();
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "auto"));
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(200);
  const l = await page.locator("svg.plot").first().screenshot();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  ok('multichart: pixels change when the OS flips on theme="auto"',
     !l.equals(await page.locator("svg.plot").first().screenshot()));
  await page.close();
}

// ---- 2. MultiChart behaviours, driven through a mocked socket ---------------
{
  const S = (n, y) => ({ n, y });
  const CASES = {
    cap:    { s: [1, 2, 3, 4, 5, 6, 7].map((k) => S(`S${k}`, [k, k + 1, k + 2, k + 1])) },
    // NB: Number(null) is 0, so a real hole has to arrive as a non-numeric string
    gap:    { s: [S("A", [0, 1, "nope", 3, 4])] },
    xok:    { x: [0, 1, 2, 90], s: [S("A", [0, 1, 0, 1])] },
    xbad:   { x: [0, 1],        s: [S("A", [0, 1, 0, 1])] },
    xnan:   { x: [0, 1, "zz", 90], s: [S("A", [0, 1, 0, 1])] },
    single: { s: [S("A", [5])] },
    allnan: { s: [S("A", ["a", "b", "c"])] },
    yscale: { s: [S("lo", [0, 1, 0, 1]), S("hi", [0, 500, 0, 500])] },
  };
  const VALUES = { ...Object.fromEntries(
    Object.entries(CASES).map(([k, v]) => [k, JSON.stringify(v)])), none: "not json" };

  const page = await browser.newPage({ viewport: { width: 1000, height: 2600 } });
  await page.routeWebSocket("**/dash/ws", (ws) => {
    ws.onMessage(() => {});
    const cards = Object.entries(VALUES).map(([id, value]) => ({
      id, type: "multichart", label: id, tab: "T", width: 12, min: 0, max: 100, step: 1,
      unit: "", color: "default", hidden: false, chartType: "line", opts: "", custom: "", value,
    }));
    ws.send(JSON.stringify({ type: "layout", title: "t", brand: "", tabs: ["T"], cards }));
  });
  await page.goto(`${BASE}/dash`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("svg.plot");

  const got = await page.$$eval("svg.plot", (svgs) => svgs.map((s) => ({
    label: s.getAttribute("aria-label"),
    role: s.getAttribute("role"),
    traces: [...s.querySelectorAll("path[stroke]")].map((p) => p.getAttribute("d")),
    legend: [...s.parentElement.querySelectorAll(".key li span")].map((x) => x.textContent),
    empty: s.parentElement.querySelector(".empty")?.textContent ?? null,
    stroke: [...s.querySelectorAll("path[stroke]")].map((p) => getComputedStyle(p).stroke),
    dash:   [...s.querySelectorAll("path[stroke]")].map((p) => getComputedStyle(p).strokeDasharray),
    vfx:    [...s.querySelectorAll("path[stroke]")].map((p) => getComputedStyle(p).vectorEffect),
    keyDash: [...s.parentElement.querySelectorAll(".key line")]
      .map((x) => x.getAttribute("stroke-dasharray")),
  })));
  const by = Object.fromEntries(Object.keys(VALUES).map((k, i) => [k, got[i]]));
  const ys = (d) => [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => +m[1]);
  const span = (d) => Math.max(...ys(d)) - Math.min(...ys(d));

  ok("at most 5 series drawn", by.cap.traces.length === 5, `${by.cap.traces.length} of 7`);
  ok("legend matches the drawn series", by.cap.legend.join() === "S1,S2,S3,S4,S5");
  ok("a non-finite y lifts the pen, never bridges the hole",
     (by.gap.traces[0].match(/M/g) || []).length === 2, by.gap.traces[0]);
  ok("x honoured when its length matches and all entries are finite",
     by.xok.traces[0] !== by.xbad.traces[0]);
  ok("x ignored on length mismatch or a non-finite entry",
     by.xbad.traces[0] === by.xnan.traces[0]);
  ok("one shared y scale across series",
     span(by.yscale.traces[0]) < 1 && span(by.yscale.traces[1]) > 120,
     `flat series spans ${span(by.yscale.traces[0]).toFixed(1)}px`);
  ok("unparseable value renders the no-data state",
     by.none.empty === "no data" && by.none.traces.length === 0);
  ok("a single point renders the no-data state", by.single.empty === "no data");
  ok("an all-non-finite series keeps its legend and draws nothing",
     by.allnan.empty === null && by.allnan.traces.length === 0);
  ok("colour-blind safe: 5 distinct colours AND 5 distinct dashes",
     new Set(by.cap.stroke).size === 5 && new Set(by.cap.dash).size === 5,
     `${new Set(by.cap.stroke).size} colours / ${new Set(by.cap.dash).size} dashes`);
  ok("legend swatches carry the dash patterns too",
     new Set(by.cap.keyDash).size === 5);
  ok("vector-effect: non-scaling-stroke on every trace",
     by.cap.vfx.every((v) => v === "non-scaling-stroke"));
  ok('role="img" with a name that identifies the card and its series',
     by.cap.role === "img" && by.cap.label === "cap: S1, S2, S3, S4, S5 over 4 samples",
     by.cap.label);
  await page.close();
}

await browser.close();
mock?.kill();
const bad = T.filter((x) => !x).length;
console.log(bad ? `\n${bad} FAILED` : `\nall ${T.length} checks passed`);
process.exit(bad ? 1 : 0);
