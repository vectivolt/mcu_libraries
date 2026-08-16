<!-- XY point plot with auto-scaled axes. The shell's chart card only ever draws
     y against time; a scatter is how you see one signal against another —
     current vs. RPM, temperature vs. duty.
     value: {"x":[…],"y":[…]}
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card, value } = $props();

  const W = 100, H = 62, PAD = 3;

  let pts = $derived.by(() => {
    let j;
    try { j = JSON.parse(value); } catch { return []; }
    const xs = Array.isArray(j?.x) ? j.x : [];
    const ys = Array.isArray(j?.y) ? j.y : [];
    const n = Math.min(xs.length, ys.length);
    const out = [];
    for (let i = 0; i < n && out.length < 400; i++) {
      const x = Number(xs[i]), y = Number(ys[i]);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y]);
    }
    return out;
  });

  // Degenerate spreads are the common failure: every sample identical gives a
  // zero range, and dividing by it puts every point at NaN. Pad it to 1.
  let ext = $derived.by(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x0, y0, xr: (x1 - x0) || 1, yr: (y1 - y0) || 1, x1, y1 };
  });

  let px = $derived((x) => PAD + ((x - ext.x0) / ext.xr) * (W - PAD * 2));
  let py = $derived((y) => H - PAD - ((y - ext.y0) / ext.yr) * (H - PAD * 2));
</script>

{#if pts.length}
  <div class="sc">
    <!-- No preserveAspectRatio="none" here: it would stretch every point into
         an ellipse, and a scatter's whole job is showing where dots sit. -->
    <svg viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet" role="img"
         aria-label="{card.label || card.id}: {pts.length} points, x from {ext.x0} to {ext.x1}, y from {ext.y0} to {ext.y1}">
      {#each [0.25, 0.5, 0.75] as t (t)}
        <line x1={PAD} x2={W - PAD} y1={PAD + t * (H - PAD * 2)} y2={PAD + t * (H - PAD * 2)}
              stroke="var(--color-line)" stroke-width=".5" vector-effect="non-scaling-stroke"/>
      {/each}
      {#each pts as [x, y], i (i)}
        <circle cx={px(x)} cy={py(y)} r="1.4" fill="var(--color-brand)" opacity=".85"/>
      {/each}
    </svg>
    <div class="ax tnum">
      <span>x {ext.x0} – {ext.x1}</span><span>y {ext.y0} – {ext.y1}</span>
    </div>
  </div>
{:else}
  <p class="empty">no data</p>
{/if}

<style>
.sc { margin-top: auto; display: flex; flex-direction: column; gap: 4px; }
.sc svg { width: 100%; aspect-ratio: 100 / 62; height: auto; display: block;
          background: var(--color-bg-soft); border-radius: var(--radius-ctl); }
.ax { display: flex; justify-content: space-between; gap: 8px; font-size: 10px;
      color: var(--color-muted); font-family: var(--font-mono); }
.ax span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { margin: auto 0 0; font-size: 12px; color: var(--color-muted); }
</style>
