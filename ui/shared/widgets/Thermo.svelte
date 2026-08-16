<!-- Bulb-and-stem thermometer, scaled to the card's min/max. The shell's
     `temperature` card is a number with a glyph; this is the shape you can
     read across a workshop without focusing on the digits.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num, clamp01 } from "$shared/lib/net.js";
  let { card, value } = $props();

  let lo = $derived(num(card.min, 0));
  let hi = $derived(num(card.max, 100));
  let n  = $derived(num(value, lo));
  let f  = $derived(clamp01((n - lo) / ((hi - lo) || 1)));

  // Stem runs from y=76 (bulb neck) up to y=10. Mercury grows downward-anchored.
  let top = $derived(76 - f * 66);
</script>

<div class="th" role="img" aria-label="{card.label || card.id}: {n}{card.unit || ''}, range {lo} to {hi}">
  <svg viewBox="0 0 34 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect x="11" y="8" width="12" height="70" rx="6" fill="var(--color-bg-soft)"
          stroke="var(--color-line)" stroke-width="1.2"/>
    <circle cx="17" cy="84" r="11" fill="var(--color-bg-soft)"
            stroke="var(--color-line)" stroke-width="1.2"/>
    <rect x="13.5" y={top} width="7" height={80 - top} fill="var(--color-brand)"
          style="transition:y .45s ease, height .45s ease"/>
    <circle cx="17" cy="84" r="8.4" fill="var(--color-brand)"/>
    {#each [0.25, 0.5, 0.75] as t (t)}
      <line x1="24" y1={76 - t * 66} x2="29" y2={76 - t * 66}
            stroke="var(--color-line)" stroke-width="1.2"/>
    {/each}
  </svg>
  <div class="side">
    <span class="edge tnum">{hi}{card.unit || ""}</span>
    <span class="v tnum">{n}{#if card.unit}<em>{card.unit}</em>{/if}</span>
    <span class="edge tnum">{lo}{card.unit || ""}</span>
  </div>
</div>

<style>
.th { display: flex; gap: 10px; align-items: stretch; margin-top: auto; min-height: 118px; }
.th svg { width: 44px; flex: none; height: auto; align-self: stretch; }
.side { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.edge { font-size: 10.5px; color: var(--color-muted); font-family: var(--font-mono); }
.v { font-size: clamp(17px, 3.4vw, 22px); font-weight: 650; line-height: 1.1;
     font-family: var(--font-mono); color: var(--color-brand);
     overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v em { font-style: normal; font-size: .5em; color: var(--color-muted); margin-left: .25em; }
</style>
