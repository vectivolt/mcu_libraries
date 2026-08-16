<!-- Row-major matrix as a colour-scaled grid — thermal camera frames, RSSI
     surveys, per-channel duty. The legend is not decoration: a colour ramp
     with no numbers on it is unreadable on a phone nobody can hover.
     value: {"w":8,"v":[…]}
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num } from "$shared/lib/net.js";
  let { card, value } = $props();

  let grid = $derived.by(() => {
    let j;
    try { j = JSON.parse(value); } catch { return null; }
    let v = Array.isArray(j?.v) ? j.v.map(Number) : [];
    const w = Math.max(1, Math.round(num(j?.w, 0)));
    if (!v.length || !Number.isFinite(w) || w > 64) return null;
    // Cap the CELL COUNT, not just the width. w<=64 still admits a 64x500
    // payload, and 32 000 spans is a locked-up tab on a phone — the width
    // guard alone left the device able to hang its own dashboard.
    const MAX_CELLS = 2048;
    if (v.length > MAX_CELLS) v = v.slice(0, MAX_CELLS);
    // Min/max over the finite cells only: one NaN from a disconnected probe
    // must not collapse the whole scale.
    let lo = Infinity, hi = -Infinity;
    for (const n of v) { if (Number.isFinite(n)) { if (n < lo) lo = n; if (n > hi) hi = n; } }
    if (lo === Infinity) return null;
    return { v, w, rows: Math.ceil(v.length / w), lo, hi, rng: (hi - lo) || 1 };
  });

  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
</script>

{#if grid}
  <div class="hm">
    <!-- group, not img: an element with role="img" makes its subtree
         presentational, which would swallow every per-cell label below. -->
    <div class="cells" role="group"
         aria-label="{card.label || card.id}: {grid.w} by {grid.rows} matrix, values {fmt(grid.lo)} to {fmt(grid.hi)}{card.unit ? ' ' + card.unit : ''}"
         style:grid-template-columns="repeat({grid.w}, 1fr)">
      {#each grid.v as n, i (i)}
        {@const t = Number.isFinite(n) ? (n - grid.lo) / grid.rng : null}
        <!-- Magnitude was previously carried by colour alone, with title= as the
             only alternative — and title is mouse-hover, so it does not exist on
             a phone or for a screen reader. Each cell now states its own row,
             column and reading. -->
        <span role="img"
              aria-label="row {Math.floor(i / grid.w) + 1} column {(i % grid.w) + 1}: {Number.isFinite(n) ? fmt(n) + (card.unit || '') : 'no reading'}"
              title={Number.isFinite(n) ? `${n}${card.unit || ""}` : "no reading"}
              style:background={t === null
                ? "var(--color-bg-soft)"
                : `color-mix(in srgb, var(--color-brand) ${(t * 100).toFixed(1)}%, var(--color-line))`}
        ></span>
      {/each}
    </div>
    <div class="key tnum">
      <span>{fmt(grid.lo)}{card.unit || ""}</span>
      <i aria-hidden="true"></i>
      <span>{fmt(grid.hi)}{card.unit || ""}</span>
    </div>
  </div>
{:else}
  <p class="empty">no data</p>
{/if}

<style>
.hm { margin-top: auto; display: flex; flex-direction: column; gap: 6px; }
.cells { display: grid; gap: 1px; border-radius: var(--radius-ctl); overflow: hidden;
         border: 1px solid var(--color-line); background: var(--color-line); }
.cells span { aspect-ratio: 1; display: block; }
.key { display: flex; align-items: center; gap: 6px; font-size: 10px;
       color: var(--color-muted); font-family: var(--font-mono); }
.key i { flex: 1; height: 7px; border-radius: 99px; border: 1px solid var(--color-line);
         background: linear-gradient(90deg, var(--color-line), var(--color-brand)); }
.empty { margin: auto 0 0; font-size: 12px; color: var(--color-muted); }
</style>
