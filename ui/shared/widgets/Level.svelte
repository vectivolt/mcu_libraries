<!-- Vertical tank / level indicator. The industrial readout ESP-DASH has no
     equivalent for: a fill column with min/max end labels and an optional
     threshold marker. (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num, clamp01 } from "$shared/lib/net.js";
  let { card, value } = $props();

  let lo  = $derived(num(card.min, 0));
  let hi  = $derived(num(card.max, 100));
  let n   = $derived(num(value, lo));
  let pct = $derived(clamp01((n - lo) / ((hi - lo) || 1)) * 100);

  // Colour by fill, but the number is always shown too — a tank that is low is
  // readable without seeing the colour at all.
  let tone = $derived(pct <= 10 ? "var(--color-err)" : pct <= 25 ? "var(--color-warn)" : "var(--color-brand)");
</script>

<div class="lvl" role="img" aria-label="{card.label}: {n}{card.unit || ''} of {hi}{card.unit || ''}">
  <div class="tube">
    <div class="fill" style:height="{pct}%" style:background={tone}></div>
    <span class="tick" style="bottom:75%"></span>
    <span class="tick" style="bottom:50%"></span>
    <span class="tick" style="bottom:25%"></span>
  </div>
  <div class="side">
    <span class="hi tnum">{hi}</span>
    <span class="val tnum" style:color={tone}>{n}{#if card.unit}<em>{card.unit}</em>{/if}</span>
    <span class="lo tnum">{lo}</span>
  </div>
</div>

<style>
.lvl { display: flex; gap: 12px; align-items: stretch; margin-top: auto; min-height: 104px; }
.tube { position: relative; width: 34px; flex: none; border-radius: 7px; overflow: hidden;
        background: var(--color-bg-soft); border: 1px solid var(--color-line); }
.fill { position: absolute; inset: auto 0 0 0; transition: height .45s ease, background .3s; }
.tick { position: absolute; left: 0; right: 0; height: 1px; background: var(--color-line); opacity: .8; }
.side { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.hi, .lo { font-size: 10.5px; color: var(--color-muted); font-family: var(--font-mono); }
.val { font-size: clamp(17px, 3.4vw, 22px); font-weight: 600; line-height: 1.1;
       overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.val em { font-style: normal; font-size: .5em; color: var(--color-muted); margin-left: .25em; }
</style>
