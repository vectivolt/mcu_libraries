<!-- Tiny inline sparkline rendered as SVG path. Used inside KPI cards to add
     a sense of time-series at a glance. -->
<script>
  let { data = [], height = 36, color = 'var(--color-brand)', fill = true } = $props();
  let w = 200; // viewBox width — the actual SVG is responsive via width:100%
  let path = $derived.by(() => {
    if (!data.length) return '';
    const min = Math.min(...data), max = Math.max(...data), rng = (max - min) || 1;
    const step = w / (data.length - 1 || 1);
    return data.map((y, i) => {
      const x = i * step;
      const yy = height - 4 - ((y - min) / rng) * (height - 8);
      return (i ? 'L' : 'M') + x.toFixed(1) + ',' + yy.toFixed(1);
    }).join(' ');
  });
  let area = $derived(path ? path + ` L${w},${height} L0,${height} Z` : '');
</script>
<svg viewBox="0 0 {w} {height}" preserveAspectRatio="none" class="block w-full" style:height="{height}px">
  <defs>
    <linearGradient id="spk-grad" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%"   stop-color="{color}" stop-opacity=".35" />
      <stop offset="100%" stop-color="{color}" stop-opacity="0"   />
    </linearGradient>
  </defs>
  {#if fill && area}<path d={area} fill="url(#spk-grad)" />{/if}
  {#if path}<path d={path} fill="none" stroke="{color}" stroke-width="1.6" stroke-linejoin="round" />{/if}
</svg>
