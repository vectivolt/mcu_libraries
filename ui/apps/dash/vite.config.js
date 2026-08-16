// ---------------------------------------------------------------------------
// VectiSuite UI · VectiDash
// Author: VectiVolt <team@vectivolt.com>  (c) 2026 VectiVolt — Apache-2.0
// ---------------------------------------------------------------------------
//
// Builds the VectiDash Svelte 5 SPA into a SINGLE self-contained HTML file
// at `dist/dash.html`. `scripts/embed-progmem.js` then gzips that file and
// writes the bytes to `libraries/VectiDash/src/VectiDash_ui_gz.h` so the
// ESP serves it directly from flash with `Content-Encoding: gzip`.

import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [
    svelte(),
    viteSingleFile({ removeViteModuleLoader: true, useRecommendedBuildConfig: true }),
  ],
  resolve: {
    alias: {
      $shared: resolve(import.meta.dirname, "../../shared"),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "../../dist/dash"),
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: "terser",
    terserOptions: { compress: { passes: 2 }, mangle: true },
    target: "es2020",
    assetsInlineLimit: 100000000,
  },
});
