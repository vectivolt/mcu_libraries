<!-- ---------------------------------------------------------------------------
  VectiSuite — SVG icon.

  Drop-in replacement for lucide-svelte's per-icon components, which cost
  4.7 KB gzipped per page because each glyph shipped as its own Svelte
  component around a shared wrapper. One component + a geometry table is
  the same picture for a fifth of the flash.

  Usage:  <Icon name="Upload" size={16} />
  Geometry and stroke defaults come from Lucide (ISC) — see shared/icons.js.

  (c) 2026 VectiVolt — Apache-2.0 License
--------------------------------------------------------------------------- -->
<script>
  import { ICONS } from "../icons.js";

  let { name, size = 24, strokeWidth = 2, class: klass = "" } = $props();
  let nodes = $derived(ICONS[name] || []);
</script>

<!-- aria-hidden by default: these icons sit beside text that already carries
     the meaning. A standalone icon button gets its name from aria-label on
     the button, not from here. -->
<svg xmlns="http://www.w3.org/2000/svg"
     width={size} height={size} viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width={strokeWidth}
     stroke-linecap="round" stroke-linejoin="round"
     class={klass} aria-hidden="true" focusable="false">
  {#each nodes as [tag, attrs] (tag + JSON.stringify(attrs))}
    {#if tag === "path"}<path {...attrs} />
    {:else if tag === "circle"}<circle {...attrs} />
    {:else if tag === "rect"}<rect {...attrs} />
    {:else if tag === "line"}<line {...attrs} />
    {:else if tag === "polyline"}<polyline {...attrs} />
    {:else if tag === "polygon"}<polygon {...attrs} />
    {:else if tag === "ellipse"}<ellipse {...attrs} />
    {/if}
  {/each}
</svg>

<style>
  svg { display: inline-block; flex: none; vertical-align: middle; }
</style>
