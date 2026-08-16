<!-- Battery gauge. SVG rather than a div stack so the terminal nub and the
     fill stay in proportion at any card width. Low state is spelled out as
     the word "low" — a red bar alone is invisible to a colour-blind tech.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num, clamp01 } from "$shared/lib/net.js";
  import Icon from "$shared/components/Icon.svelte";

  let { card, value } = $props();

  let raw = $derived(String(value ?? ""));
  // A trailing "+" is the sketch's shorthand for "charging" ("87+"); num()
  // ignores the suffix, so both readings come off the same string.
  let charging = $derived(raw.trim().endsWith("+") || card.unit === "charging");

  let lo  = $derived(num(card.min, 0));
  let hi  = $derived(num(card.max, 100));
  let n   = $derived(num(raw, lo));
  let pct = $derived(Math.round(clamp01((n - lo) / ((hi - lo) || 1)) * 100));

  let low  = $derived(pct < 20);
  let tone = $derived(low ? "var(--color-err)" : charging ? "var(--color-ok)" : "var(--color-brand)");
</script>

<div class="bat" role="img"
     aria-label="{card.label || card.id}: {pct} percent{charging ? ', charging' : ''}{low ? ', low' : ''}">
  <svg viewBox="0 0 46 22" class="glyph" aria-hidden="true">
    <rect x="0.75" y="0.75" width="39.5" height="20.5" rx="4"
          fill="none" stroke="var(--color-line)" stroke-width="1.5" />
    <rect x="41.5" y="7" width="4" height="8" rx="1.5" fill="var(--color-line)" />
    <rect x="3" y="3" height="16" rx="2" width={Math.max(pct * 0.35, pct ? 1.5 : 0)} fill={tone} />
  </svg>
  <span class="val tnum" style:color={tone}>{pct}<em>%</em></span>
  {#if charging}<span class="bolt" style:color="var(--color-ok)"><Icon name="Bolt" size={15} /></span>{/if}
  {#if low}<span class="low">low</span>{/if}
</div>

<style>
.bat { margin-top: auto; display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.glyph { width: 52px; height: 25px; flex: none; }
.glyph rect { transition: width .45s ease, fill .3s; }
.val { font-size: clamp(17px, 3.4vw, 22px); font-weight: 600; line-height: 1.1; }
.val em { font-style: normal; font-size: .55em; color: var(--color-muted); margin-left: .12em; }
.bolt { display: inline-flex; }
.low { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
       color: var(--color-err); }
</style>
