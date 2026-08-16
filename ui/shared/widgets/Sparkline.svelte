<!-- Trend card: the shared Sparkline component with the latest reading printed
     beside it. A trend line with no number tells you something changed but not
     what it is now, which is the half of the question that matters.
     Drawing is delegated to $shared/components/Sparkline.svelte — this file is
     only the card body around it.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import Spark from "$shared/components/Sparkline.svelte";
  import { num } from "$shared/lib/net.js";

  let { card, value } = $props();

  let data = $derived.by(() => {
    const raw = String(value ?? "").trim();
    if (!raw) return [];
    if (raw[0] === "[") {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) return p.map((n) => num(n, 0));
      } catch { /* malformed — fall back to the comma form */ }
    }
    return raw.split(",").filter((s) => s.trim()).map((s) => num(s, 0));
  });

  let last = $derived(data.length ? data[data.length - 1] : null);
  // Rounded for display only: a 4-decimal float from a sensor blows the card
  // width apart, and the trend line still uses the full precision.
  let shown = $derived(last == null ? "—" : String(Math.round(last * 100) / 100));
</script>

<div class="spk">
  <div class="head">
    <span class="val tnum">{shown}{#if card.unit}<em>{card.unit}</em>{/if}</span>
    <span class="n">{data.length} pts</span>
  </div>
  <div class="chart" role="img"
       aria-label="{card.label || card.id}: latest {shown}{card.unit || ''}, {data.length} samples">
    <Spark {data} height={38} />
  </div>
</div>

<style>
.spk { margin-top: auto; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.val { font-size: clamp(17px, 3.4vw, 22px); font-weight: 600; line-height: 1.1;
       color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.val em { font-style: normal; font-size: .5em; color: var(--color-muted); margin-left: .25em; }
.n { font-size: 10.5px; color: var(--color-muted); font-family: var(--font-mono); flex: none; }
.chart { min-width: 0; }
</style>
