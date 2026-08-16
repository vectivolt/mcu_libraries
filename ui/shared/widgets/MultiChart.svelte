<!-- Multi-series line chart — the one thing ESP-DASH cannot draw at all, and the
     reason sketches end up shipping four separate chart cards for four phases.

     SVG, not canvas. The header here used to justify canvas with "that many DOM
     nodes is what makes a phone stutter"; that was never true of a line chart —
     it is one <path> per series, five nodes total however many samples arrive.
     Canvas also cost correctness: it read its colours from getComputedStyle at
     draw time and only repainted when a ResizeObserver fired, so toggling the
     theme left the chart in the old palette until something resized the card.
     stroke="var(--color-brand)" is resolved by the browser and re-resolves the
     instant data-theme flips — the bug cannot be written here any more.

     Series differ by dash pattern as well as colour. Colour-blind readers and
     anyone printing this in greyscale get the same chart; that is also why the
     legend carries the pattern, not just a coloured square.

     value: {"x":[…],"s":[{"n":"L1","y":[…]},{"n":"L2","y":[…]}]}
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card, value } = $props();

  // Token + dash pairs, in assignment order. Five is the readable ceiling for
  // one card; beyond that the extra series are dropped rather than drawn in
  // colours nobody can tell apart.
  const SERIES = [
    ["--color-brand", "none"],
    ["--color-info",  "7 4"],
    ["--color-warn",  "2 3"],
    ["--color-err",   "10 3 2 3"],
    ["--color-ok",    "1 3"],
  ];

  // viewBox units, stretched to the card by preserveAspectRatio="none".
  // vector-effect="non-scaling-stroke" (see shared/components/Sparkline.svelte)
  // keeps the stroke a constant width through that non-uniform scale.
  // stroke-dasharray is not fully covered by it and still stretches a little at
  // extreme aspect ratios — invisible at these dash lengths, and the patterns
  // stay distinguishable from each other regardless.
  const W = 300, H = 140, PAD = 6;
  const GRID = [1, 2, 3]
    .map((i) => `M${PAD} ${PAD + (i * (H - PAD * 2)) / 4}H${W - PAD}`).join("");

  let data = $derived.by(() => {
    let j;
    try { j = JSON.parse(value); } catch { return null; }
    const s = (Array.isArray(j?.s) ? j.s : [])
      .filter((t) => Array.isArray(t?.y))
      .slice(0, SERIES.length)
      .map((t, i) => ({ n: String(t.n ?? `S${i + 1}`), y: t.y.map(Number) }));
    if (!s.some((t) => t.y.length > 1)) return null;
    const len = s.reduce((m, t) => Math.max(m, t.y.length), 0);
    const x = Array.isArray(j?.x) && j.x.length === len ? j.x.map(Number) : null;
    return { s, x: x && x.every(Number.isFinite) ? x : null, len };
  });

  // null when every sample is non-finite: gridlines and legend still render,
  // there is simply nothing to trace.
  let traces = $derived.by(() => {
    const d = data;
    if (!d) return null;

    // One shared y scale: separate scales per series would make two traces
    // that are decades apart look identical, which is the opposite of the point.
    let yMin = Infinity, yMax = -Infinity;
    for (const t of d.s)
      for (const v of t.y)
        if (Number.isFinite(v)) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
    if (yMin === Infinity) return null;
    const yRng = (yMax - yMin) || 1;

    const xMin = d.x ? Math.min(...d.x) : 0;
    const xRng = d.x ? (Math.max(...d.x) - xMin) || 1 : (d.len - 1) || 1;
    const px = (i) => (PAD + ((d.x ? d.x[i] - xMin : i) / xRng) * (W - PAD * 2)).toFixed(1);
    const py = (v) => (H - PAD - ((v - yMin) / yRng) * (H - PAD * 2)).toFixed(1);

    return d.s.map((t) => {
      // A gap in one series (a probe that dropped out) lifts the pen instead of
      // drawing a straight line across the hole.
      let out = "", pen = false;
      for (let i = 0; i < t.y.length; i++) {
        const v = t.y[i];
        if (!Number.isFinite(v)) { pen = false; continue; }
        out += `${pen ? "L" : "M"}${px(i)} ${py(v)}`;
        pen = true;
      }
      return out;
    });
  });
</script>

<div class="mc">
  <svg class="plot" viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img"
       aria-label="{card.label || card.id}: {data
         ? data.s.map((t) => t.n).join(', ') + ' over ' + data.len + ' samples'
         : 'no data'}">
    <path class="grid" d={GRID}/>
    {#each traces || [] as d, i (i)}
      <path class="tr" {d} stroke="var({SERIES[i][0]})" stroke-dasharray={SERIES[i][1]}/>
    {/each}
  </svg>
  {#if data}
    <ul class="key">
      {#each data.s as t, i (t.n + i)}
        <li>
          <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden="true">
            <line x1="0" y1="4" x2="20" y2="4" stroke="var({SERIES[i][0]})" stroke-width="2"
                  stroke-dasharray={SERIES[i][1]}/>
          </svg>
          <span>{t.n}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">no data</p>
  {/if}
</div>

<style>
.mc { margin-top: auto; display: flex; flex-direction: column; gap: 6px; }
.plot { display: block; width: 100%; height: 140px; background: var(--color-bg-soft);
        border-radius: var(--radius-ctl); }
path { fill: none; vector-effect: non-scaling-stroke; }
.grid { stroke: var(--color-line); }
/* butt caps (the default) not round: round caps smear short dashes. */
.tr { stroke-width: 1.9; stroke-linejoin: round; }
.key { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; padding: 0; list-style: none; }
.key li { display: flex; align-items: center; gap: 5px; font-size: 11px;
          color: var(--color-muted); font-family: var(--font-mono); }
.empty { margin: 0; font-size: 12px; color: var(--color-muted); }
@container (max-width: 200px) { .plot { height: 110px; } }
</style>
