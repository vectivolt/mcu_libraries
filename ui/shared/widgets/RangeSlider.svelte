<!-- Dual-handle band selection — an alarm window, a dead band, a legal operating
     range. ESP-DASH has one slider, so a range meant two cards and nothing
     stopping the low one being set above the high one.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num } from "$shared/lib/net.js";
  let { card, value, cmd } = $props();

  let lo   = $derived(num(card.min, 0));
  let hi   = $derived(num(card.max, 100));
  let step = $derived(Math.abs(num(card.step, 1)) || 1);

  // "lo,hi". Anything else — empty, one number, junk — falls back to the full
  // range rather than throwing or collapsing both handles onto zero.
  let parts = $derived(String(value ?? "").split(","));
  const bound = (x) => Math.min(hi, Math.max(lo, x));
  let a = $derived(bound(num(parts[0], lo)));
  let b = $derived(bound(num(parts[1], hi)));
  // A firmware that sent "80,20" must not draw an inverted track.
  let a0 = $derived(Math.min(a, b));
  let b0 = $derived(Math.max(a, b));

  const send = (x, y) => cmd(`${x},${y}`);
  const pct  = (x) => ((x - lo) / ((hi - lo) || 1)) * 100;

  let name = $derived(card.label || card.id);
  let u    = $derived(card.unit ? ` ${card.unit}` : "");
</script>

<div class="rs">
  <div class="top tnum">
    <span>{lo}</span>
    <strong>{a0} – {b0}{u}</strong>
    <span>{hi}</span>
  </div>

  <!-- Two real <input type="range">, stacked. A hand-rolled pointer track would
       be smaller, and unusable with a keyboard or a screen reader. -->
  <div class="track">
    <span class="rail"></span>
    <span class="sel" style:left="{pct(a0)}%" style:right="{100 - pct(b0)}%"></span>

    <input type="range" class="lo" min={lo} max={hi} step={step} value={a0}
           aria-label="{name} minimum"
           oninput={(e) => send(Math.min(num(e.currentTarget.value, lo), b0), b0)}/>
    <input type="range" class="hi" min={lo} max={hi} step={step} value={b0}
           aria-label="{name} maximum"
           oninput={(e) => send(a0, Math.max(num(e.currentTarget.value, hi), a0))}/>
  </div>
</div>

<style>
.rs { margin-top: auto; display: flex; flex-direction: column; gap: 4px; }
.top { display: flex; align-items: baseline; justify-content: space-between;
       font-size: 11.5px; color: var(--color-muted); gap: 6px; }
.top strong { font-size: 14px; font-weight: 650; color: var(--color-brand);
              white-space: nowrap; }

.track { position: relative; height: 22px; }
.rail, .sel { position: absolute; top: 50%; height: 5px; margin-top: -2.5px;
              border-radius: 5px; pointer-events: none; }
.rail { left: 0; right: 0; background: var(--color-line); }
.sel  { background: var(--color-brand); }

/* The inputs are transparent overlays: only their thumbs take the pointer, so
   the two tracks do not swallow each other's drags. Keyboard focus is
   unaffected by pointer-events, which is the whole point of this approach. */
.track input { position: absolute; left: 0; top: 0; width: 100%; height: 22px;
               margin: 0; appearance: none; -webkit-appearance: none;
               background: none; pointer-events: none; }
/* The high handle sits on top, so when the two meet the pair can still be
   pulled apart — dragging up always grabs something. */
.track input.hi { z-index: 1; }
.track input:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px;
                             border-radius: var(--radius-ctl); }

.track input::-webkit-slider-runnable-track { height: 5px; background: none; }
.track input::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto;
      width: 17px; height: 17px; margin-top: -6px; border-radius: 50%; cursor: pointer;
      background: var(--color-brand); border: 2px solid var(--color-panel);
      box-shadow: 0 1px 3px rgb(0 0 0 / .25); }
.track input::-moz-range-track { height: 5px; background: none; }
.track input::-moz-range-thumb { pointer-events: auto;
      width: 17px; height: 17px; border-radius: 50%; cursor: pointer;
      background: var(--color-brand); border: 2px solid var(--color-panel); }
</style>
