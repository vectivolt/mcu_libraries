<!-- Full circular gauge — a 270° sweep with a needle and a big centre number.
     The shell's built-in `gauge` card is a 180° half-arc; a round instrument
     dial spreads the same range over half again as much arc, so a technician
     reads it to the division instead of guessing.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num, clamp01 } from "$shared/lib/net.js";
  let { card, value } = $props();

  const R = 38, SPAN = 270, START = 135;            // degrees, SVG-clockwise
  const LEN = 2 * Math.PI * R * (SPAN / 360);       // arc length for dasharray
  const pt = (a, r) => [50 + r * Math.cos(a * Math.PI / 180),
                        50 + r * Math.sin(a * Math.PI / 180)];

  let lo  = $derived(num(card.min, 0));
  let hi  = $derived(num(card.max, 100));
  let n   = $derived(num(value, lo));
  let f   = $derived(clamp01((n - lo) / ((hi - lo) || 1)));
  let tip = $derived(pt(START + f * SPAN, R - 7));
  let tail = $derived(pt(START + f * SPAN + 180, 7));

  // The track is one arc path; both ends are fixed so only the dasharray moves.
  const [ax, ay] = pt(START, R);
  const [bx, by] = pt(START + SPAN, R);
  const ARC = `M${ax.toFixed(2)},${ay.toFixed(2)} A${R},${R} 0 1 1 ${bx.toFixed(2)},${by.toFixed(2)}`;
</script>

<div class="dial" role="img"
     aria-label="{card.label || card.id}: {n}{card.unit || ''}, range {lo} to {hi}">
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    <path d={ARC} fill="none" stroke="var(--color-line)" stroke-width="7" stroke-linecap="round"/>
    <path d={ARC} fill="none" stroke="var(--color-brand)" stroke-width="7" stroke-linecap="round"
          stroke-dasharray="{(f * LEN).toFixed(2)} 999" style="transition:stroke-dasharray .45s ease"/>
    <line x1={tail[0]} y1={tail[1]} x2={tip[0]} y2={tip[1]}
          stroke="var(--color-ink)" stroke-width="2.4" stroke-linecap="round"
          style="transition:all .45s ease"/>
    <circle cx="50" cy="50" r="3.4" fill="var(--color-ink)"/>
  </svg>
  <span class="v tnum">{n}{#if card.unit}<em>{card.unit}</em>{/if}</span>
  <span class="end lo tnum">{lo}</span>
  <span class="end hi tnum">{hi}</span>
</div>

<style>
.dial { position: relative; margin-top: auto; width: 100%; max-width: 190px;
        align-self: center; aspect-ratio: 1; }
.dial svg { width: 100%; height: 100%; display: block; }
.v { position: absolute; inset: 58% 0 auto 0; text-align: center;
     font-family: var(--font-mono); font-size: clamp(16px, 5cqw, 22px);
     font-weight: 650; line-height: 1; color: var(--color-ink);
     overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v em { font-style: normal; font-size: .55em; color: var(--color-muted); margin-left: .2em; }
.end { position: absolute; bottom: 3%; font-family: var(--font-mono);
       font-size: 10px; color: var(--color-muted); }
.lo { left: 14%; }
.hi { right: 14%; }
</style>
