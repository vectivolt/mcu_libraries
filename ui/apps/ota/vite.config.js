import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteSingleFile } from "vite-plugin-singlefile";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [svelte(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true, useRecommendedBuildConfig: true })],
  resolve: { alias: { $shared: resolve(import.meta.dirname, "../../shared") } },
  build: {
    outDir: resolve(import.meta.dirname, "../../dist/ota"),
    emptyOutDir: true, cssCodeSplit: false, minify: "terser",
    terserOptions: { compress: { passes: 2 }, mangle: true },
    target: "es2020", assetsInlineLimit: 100000000,
  },
});
