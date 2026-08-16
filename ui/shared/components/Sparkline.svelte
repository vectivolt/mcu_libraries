<!-- ---------------------------------------------------------------------------
  VectiSuite — inline sparkline for KPI cards.

  The gradient id is per-instance. A fixed id collided when more than one
  sparkline rendered on a page: SVG ids are document-global, so every
  sparkline resolved url(#spk-grad) to whichever instance mounted last and
  inherited that one's colour.

  (c) 2026 VectiVolt — Apache-2.0 License
--------------------------------------------------------------------------- -->
<script>
  let { data = [], height = 36, color = 'var(--color-brand)', fill = true } = $props();

  const W = 200;                    // viewBox width; rendered width is 100%
  const uid = `spk-${Math.random().toString(36).slice(2, 9)}`;

  let path = $derived.by(() => {
    if (data.length < 2) return '';   // a single point has no line to draw
    const min = Math.min(...data), max = Math.max(...data);
    const rng = (max - min) || 1;
    const step = W / (data.length - 1);
    return data.map((y, i) =>
      (i ? 'L' : 'M') + (i * step).toFixed(1) + ',' +
      (height - 3 - ((y - min) / rng) * (height - 6)).toFixed(1)
    ).join(' ');
  });
  let area = $derived(path ? `${path} L${W},${height} L0,${height} Z` : '');
</script>

<!-- Sizing is plain CSS, not Tailwind utilities. Tailwind v4 only scans each
     app's own directory, so classes used exclusively inside ui/shared were
     never emitted: this svg rendered at its intrinsic 200px and spilled out
     of the 58px KPI slot into the neighbouring card. -->
<svg viewBox="0 0 {W} {height}" preserveAspectRatio="none"
     style:height="{height}px"
     role="presentation" aria-hidden="true">
  <defs>
    <linearGradient id={uid} x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%"   stop-color={color} stop-opacity=".28" />
      <stop offset="100%" stop-color={color} stop-opacity="0" />
    </linearGradient>
  </defs>
  {#if fill && area}<path d={area} fill="url(#{uid})" />{/if}
  {#if path}<path d={path} fill="none" stroke={color} stroke-width="1.6"
                  stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />{/if}
</svg>

<style>
  svg { display: block; width: 100%; }
</style>
