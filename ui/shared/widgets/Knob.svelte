<!-- Rotary control with the usual 270° sweep. Drag vertically for fine work or
     grab the rim and sweep an arc; arrow keys nudge by step. The number is
     always in the centre, so the pointer angle is decoration, not the readout.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num, clamp01 } from "$shared/lib/net.js";
  let { card, value, cmd } = $props();

  const SWEEP = 270, A0 = -135;                 // degrees, 0 = 12 o'clock

  let lo   = $derived(num(card.min, 0));
  let hi   = $derived(num(card.max, 100));
  let step = $derived(num(card.step, 1) || 1);

  // Local value while dragging, dropped as soon as the device echoes.
  let local = $state(null);
  let seen = null;
  $effect(() => {
    const v = String(value ?? "");
    if (v !== seen) { seen = v; local = null; }
  });

  const clampv = (n) => (n < lo ? lo : n > hi ? hi : n);
  let val  = $derived(clampv(local ?? num(value, lo)));
  let frac = $derived(clamp01((val - lo) / ((hi - lo) || 1)));
  let ang  = $derived(A0 + SWEEP * frac);

  function set(v) {
    // Snap to the firmware's step, and shave the float dust that
    // (v - lo) / step * step leaves behind on values like 0.1.
    const snapped = clampv(+(lo + Math.round((v - lo) / step) * step).toFixed(6));
    if (snapped === val) return;
    local = snapped;
    cmd(String(snapped));
  }

  let el, base = null;                          // pointer-down anchor {y, v}

  function down(e) { try { el.setPointerCapture(e.pointerId); } catch { /* pointer already released */ } el.focus(); base = { y: e.clientY, v: val }; }
  function up() { base = null; }

  function move(e) {
    if (!base) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) > r.width * 0.3) {
      // Rim: follow the pointer angle. The 90° dead zone at the bottom clamps
      // to whichever end is nearer rather than wrapping around.
      let a = (Math.atan2(dx, -dy) * 180) / Math.PI;
      a = a > 135 ? 135 : a < -135 ? -135 : a;
      set(lo + ((a - A0) / SWEEP) * (hi - lo));
    } else {
      // Centre: vertical drag, full range over ~170 px. Anchored to the value
      // at pointer-down so the knob does not creep.
      set(base.v + ((base.y - e.clientY) / 170) * (hi - lo));
    }
  }

  function key(e) {
    const s = step * (e.shiftKey ? 10 : 1);
    if (e.key === "ArrowUp" || e.key === "ArrowRight") set(val + s);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") set(val - s);
    else if (e.key === "Home") set(lo);
    else if (e.key === "End") set(hi);
    else return;
    e.preventDefault();
  }

  const P = (a, r) => [50 + r * Math.sin((a * Math.PI) / 180), 50 - r * Math.cos((a * Math.PI) / 180)];
  function arc(a1, r = 38) {
    const [x0, y0] = P(A0, r), [x1, y1] = P(a1, r);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - A0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
</script>

<div class="knob" bind:this={el} tabindex="0" role="slider"
     aria-label={card.label || card.id}
     aria-valuemin={lo} aria-valuemax={hi} aria-valuenow={val}
     aria-valuetext="{val}{card.unit ? ' ' + card.unit : ''}"
     onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
     onkeydown={key}>
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <path class="trk" d={arc(A0 + SWEEP)}/>
    <path class="fil" d={arc(ang)}/>
    <line class="ind" x1={P(ang, 15)[0]} y1={P(ang, 15)[1]} x2={P(ang, 31)[0]} y2={P(ang, 31)[1]}/>
  </svg>
  <span class="val tnum">{val}{#if card.unit}<em>{card.unit}</em>{/if}</span>
</div>

<style>
.knob { position: relative; margin: auto auto 0; width: 100%; max-width: 132px; aspect-ratio: 1;
        display: grid; place-items: center; touch-action: none; cursor: ns-resize;
        border-radius: 50%; }
.knob:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
svg { position: absolute; inset: 0; width: 100%; height: 100%; fill: none;
      stroke-linecap: round; }
.trk { stroke: var(--color-line); stroke-width: 8; }
.fil { stroke: var(--color-brand); stroke-width: 8; }
.ind { stroke: var(--color-ink); stroke-width: 4; }
.val { font-size: clamp(15px, 5cqw, 20px); font-weight: 600; color: var(--color-ink);
       line-height: 1; max-width: 62%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.val em { font-style: normal; font-size: .55em; color: var(--color-muted); margin-left: .2em; }
</style>
