// ---------------------------------------------------------------------------
// JouleSuite UI · build-all
// Author: Chinmoy Bhuyan <dikibhuyan@gmail.com>  (c) 2026 — MIT
// ---------------------------------------------------------------------------
//
// Sequentially builds every Svelte app under apps/, then runs the embed
// script that gzips dist/<app>/index.html and writes it as PROGMEM bytes
// into the matching libraries/Joule*/src/Joule*_ui_gz.h.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readdirSync, statSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const apps = readdirSync(resolve(here, "../apps"))
  .filter(d => statSync(resolve(here, "../apps", d)).isDirectory());

function run(cmd, args, cwd) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit" });
    p.on("exit", code => code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`)));
  });
}

for (const app of apps) {
  const cfg = resolve(here, `../apps/${app}/vite.config.js`);
  console.log(`\n──── building ${app} ────`);
  await run("npx", ["vite", "build", "--config", cfg], resolve(here, ".."));
}

await import("./embed-progmem.js");
console.log("\n✓ all UIs built + embedded");
