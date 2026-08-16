<!-- Labelled vertical bars from a JSON bucket set. SVG rather than canvas: at
     this size the whole picture is a dozen rects, and SVG keeps the labels as
     real text a screen reader and a browser zoom can both use.
     value: {"l":["a","b"],"v":[1,2]}
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card, value } = $props();

  const W = 100, H = 58;

  // A half-sent frame from a rebooting device is normal here, not exceptional:
  // fall back to an empty chart rather than throwing out of the whole grid.
  let bars = $derived.by(() => {
    let j;
    try { j = JSON.parse(value); } catch { return []; }
    const v = Array.isArray(j?.v) ? j.v : [];
    const l = Array.isArray(j?.l) ? j.l : [];
    return v.map((y, i) => ({ y: Number(y), l: String(l[i] ?? i + 1) }))
            .filter((b) => Number.isFinite(b.y))
            .slice(0, 24);
  });

  // Baseline at zero when the data is all-positive; otherwise the bars would
  // float and a "0" bucket would look the same as the smallest one.
  let top = $derived(bars.reduce((m, b) => Math.max(m, b.y), 0) || 1);
  let bot = $derived(bars.reduce((m, b) => Math.min(m, b.y), 0));
  let rng = $derived((top - bot) || 1);
  let zero = $derived(H - ((0 - bot) / rng) * H);
  let step = $derived(W / (bars.length || 1));
</script>

{#if bars.length}
  <div class="hg">
    <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img"
         aria-label="{card.label || card.id}: {bars.map((b) => `${b.l} ${b.y}`).join(', ')}">
      <line x1="0" y1={zero} x2={W} y2={zero} stroke="var(--color-line)" stroke-width=".6"
            vector-effect="non-scaling-stroke"/>
      {#each bars as b, i (b.l + i)}
        {@const y = H - ((b.y - bot) / rng) * H}
        <rect x={i * step + step * 0.16} width={step * 0.68}
              y={Math.min(y, zero)} height={Math.max(Math.abs(zero - y), 0.6)}
              fill="var(--color-brand)" rx="0.8"
              style="transition:y .35s ease, height .35s ease"><title>{b.l}: {b.y}</title></rect>
      {/each}
    </svg>
    <div class="labels" style:grid-template-columns="repeat({bars.length}, 1fr)">
      {#each bars as b, i (b.l + i)}<span title="{b.l}: {b.y}">{b.l}</span>{/each}
    </div>
  </div>
{:else}
  <p class="empty">no data</p>
{/if}

<style>
.hg { margin-top: auto; display: flex; flex-direction: column; gap: 4px; }
.hg svg { width: 100%; height: 92px; display: block; overflow: visible; }
.labels { display: grid; gap: 0; }
.labels span { font-size: 9.5px; color: var(--color-muted); font-family: var(--font-mono);
               text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { margin: auto 0 0; font-size: 12px; color: var(--color-muted); }
</style>
