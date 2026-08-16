<!-- Heading dial, 0-360°. Prints the cardinal name next to the degrees: a
     pointer alone is unreadable to a screen reader, and "SE" is what anyone
     actually says out loud. (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num } from "$shared/lib/net.js";
  let { card, value } = $props();

  const DIRS = ["N","NNE","NE","ENE","E","ESE","SE","SSE",
                "S","SSW","SW","WSW","W","WNW","NW","NNW"];

  // Wrap rather than clamp — a heading of 370 is 10, not "pinned at north",
  // and a gyro that free-runs past 360 is normal.
  let deg  = $derived(((num(value, 0) % 360) + 360) % 360);
  let name = $derived(DIRS[Math.round(deg / 22.5) % 16]);
</script>

<div class="cmp" role="img" aria-label="{card.label || card.id}: {Math.round(deg)} degrees, {name}">
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-line)" stroke-width="1.5"/>
    {#each [0, 45, 90, 135, 180, 225, 270, 315] as a (a)}
      <line x1="50" y1="8" x2="50" y2={a % 90 ? 13 : 16} stroke="var(--color-line)"
            stroke-width={a % 90 ? 1 : 1.8} transform="rotate({a} 50 50)"/>
    {/each}
    <text x="50" y="27" class="rose">N</text>
    <text x="73" y="53.5" class="rose">E</text>
    <text x="50" y="79" class="rose">S</text>
    <text x="27" y="53.5" class="rose">W</text>
    <g style="transition:transform .45s ease" style:transform="rotate({deg}deg)"
       style:transform-origin="50px 50px">
      <polygon points="50,14 44.5,52 55.5,52" fill="var(--color-brand)"/>
      <polygon points="50,84 44.5,52 55.5,52" fill="var(--color-line)"/>
    </g>
    <circle cx="50" cy="50" r="3" fill="var(--color-ink)"/>
  </svg>
  <span class="v tnum">{Math.round(deg)}° <em>{name}</em></span>
</div>

<style>
.cmp { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.cmp svg { width: 100%; max-width: 150px; aspect-ratio: 1; display: block; }
.rose { font-size: 9px; font-weight: 700; text-anchor: middle; dominant-baseline: middle;
        fill: var(--color-muted); font-family: var(--font-sans); }
.v { font-family: var(--font-mono); font-size: 17px; font-weight: 650;
     line-height: 1; color: var(--color-ink); }
.v em { font-style: normal; color: var(--color-brand); }
</style>
