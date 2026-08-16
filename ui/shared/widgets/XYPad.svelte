<!-- Absolute 2D pad. Unlike the joystick this does NOT self-centre: the dot
     stays where it is put, which is what a pan/tilt head or an XY setpoint
     actually wants. Wire format is "x,y", integers 0-100, y measured bottom-up.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num } from "$shared/lib/net.js";
  let { card, value, cmd } = $props();

  const cl = (n) => Math.round(n < 0 ? 0 : n > 100 ? 100 : n);

  // Malformed value → dead centre, never a throw and never NaN in the style.
  let pos = $derived.by(() => {
    const p = String(value ?? "").split(",");
    return { x: cl(num(p[0], 50)), y: cl(num(p[1], 50)) };
  });

  // Local override while dragging, cleared when the device echoes anything
  // new. If the echo never comes the dot still stays put — correct for an
  // absolute control.
  let lx = $state(null), ly = $state(null);
  let seen = null;
  $effect(() => {
    const v = String(value ?? "");
    if (v !== seen) { seen = v; lx = null; ly = null; }
  });

  let x = $derived(lx ?? pos.x);
  let y = $derived(ly ?? pos.y);

  let el;
  function put(nx, ny) {
    nx = cl(nx); ny = cl(ny);
    if (nx === x && ny === y) return;     // one frame per integer step, not per pixel
    lx = nx; ly = ny;
    cmd(`${nx},${ny}`);
  }

  function at(e) {
    const r = el.getBoundingClientRect();
    put(((e.clientX - r.left) / (r.width || 1)) * 100,
        100 - ((e.clientY - r.top) / (r.height || 1)) * 100);
  }

  function down(e) { el.setPointerCapture(e.pointerId); el.focus(); at(e); }
  function move(e) { if (el?.hasPointerCapture(e.pointerId)) at(e); }

  function key(e) {
    const s = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft") put(x - s, y);
    else if (e.key === "ArrowRight") put(x + s, y);
    else if (e.key === "ArrowUp") put(x, y + s);
    else if (e.key === "ArrowDown") put(x, y - s);
    else return;
    e.preventDefault();
  }
</script>

<div class="xy">
  <!-- role="application" matches the existing joystick: a focusable surface
       driven by arrow keys, which the linter has no better role for. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="pad" bind:this={el} tabindex="0" role="application"
       aria-label="{card.label || card.id}: drag or use arrow keys"
       onpointerdown={down} onpointermove={move} onkeydown={key}>
    <span class="ax v"></span><span class="ax h"></span>
    <span class="dot" style:left="{x}%" style:bottom="{y}%"></span>
  </div>
  <p class="rd tnum" aria-live="polite">X {x} · Y {y}</p>
</div>

<style>
.xy { margin-top: auto; display: flex; flex-direction: column; gap: 6px; }
.pad { position: relative; aspect-ratio: 1; width: 100%; max-width: 190px; margin: 0 auto;
       touch-action: none; cursor: crosshair; border-radius: var(--radius-ctl);
       background: var(--color-bg-soft); border: 1px solid var(--color-line); }
.pad:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
.ax { position: absolute; background: var(--color-line); }
.ax.v { left: 50%; top: 0; bottom: 0; width: 1px; }
.ax.h { top: 50%; left: 0; right: 0; height: 1px; }
.dot { position: absolute; width: 16px; height: 16px; margin: 0 0 -8px -8px;
       border-radius: 50%; background: var(--color-brand);
       box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-brand) 22%, transparent); }
.rd { margin: 0; text-align: center; font-size: 11.5px; color: var(--color-muted);
      font-family: var(--font-mono); }
</style>
