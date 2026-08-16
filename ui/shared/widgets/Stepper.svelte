<!-- Numeric entry with − / + and a typed field. The setpoint control ESP-DASH
     forces you to express as a slider: a slider cannot hit 21.5 °C on a phone,
     and a bare text box gives the technician no range at all.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num } from "$shared/lib/net.js";
  let { card, value, cmd } = $props();

  let lo   = $derived(num(card.min, 0));
  let hi   = $derived(num(card.max, 100));
  let step = $derived(Math.abs(num(card.step, 1)) || 1);

  // While a button is held the device has not echoed yet, so a local value
  // carries the repeat — otherwise every tick of the repeat sends the same
  // number. It is dropped the moment a fresh echo lands.
  let held = $state(null);
  $effect(() => { if (value !== undefined) held = null; });

  let echo = $derived(num(value, lo));
  let n    = $derived(held ?? echo);

  // Round to the step's own precision: 0.1 + 0.2 is 0.30000000000000004, and
  // that string went out on the wire.
  const places = (s) => (String(s).split(".")[1] || "").length;
  const fit = (x) => Math.min(hi, Math.max(lo, Number(x.toFixed(places(step)))));

  function set(next) {
    if (!Number.isFinite(next) || next === n) return false;
    held = next;
    cmd(String(next));
    return true;
  }
  // Hitting the end stops the repeat itself: the button goes `disabled` there,
  // and a disabled button never delivers the pointerup that would clear it.
  const bump = (dir) => { if (!set(fit(n + dir * step))) stop(); };

  // Press-and-hold repeat. Kick-off delay first so a single tap is one step.
  let wait = null, rep = null;
  function start(dir) {
    // Two fingers on − and + at once used to overwrite these handles and
    // leave the first timer running forever, stepping on its own.
    stop();
    bump(dir);
    wait = setTimeout(() => { rep = setInterval(() => bump(dir), 90); }, 420);
  }
  function stop() { clearTimeout(wait); clearInterval(rep); wait = rep = null; }
  $effect(() => stop);

  // Pointer drives pointerdown, keyboard drives keydown (whose default action
  // would be a click — preventing it keeps one press from stepping twice, and
  // the OS key-repeat gives the hold-repeat for free).
  const key = (e, dir) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    bump(dir);
  };

  function typed(e) {
    const next = fit(num(e.currentTarget.value, n));
    e.currentTarget.value = String(next);      // snap the field back into range
    set(next);
  }

  let name = $derived(card.label || card.id);
</script>

<div class="st">
  <button class="pm" aria-label="Decrease {name}" disabled={n <= lo}
          onpointerdown={() => start(-1)} onpointerup={stop} onpointercancel={stop}
          onpointerleave={stop} onblur={stop} onkeydown={(e) => key(e, -1)}>−</button>

  <input class="fld tnum" type="number" inputmode="decimal" aria-label={name}
         min={lo} max={hi} step={step} value={n} onchange={typed}/>

  <button class="pm" aria-label="Increase {name}" disabled={n >= hi}
          onpointerdown={() => start(1)} onpointerup={stop} onpointercancel={stop}
          onpointerleave={stop} onblur={stop} onkeydown={(e) => key(e, 1)}>+</button>
</div>
{#if card.unit}<div class="unit">{card.unit} · {lo}–{hi}</div>{/if}

<style>
.st { margin-top: auto; display: flex; align-items: stretch; gap: 6px; }
.pm { flex: none; width: 38px; touch-action: none; user-select: none;
      font: inherit; font-size: 19px; line-height: 1; cursor: pointer;
      color: var(--color-ink); background: var(--color-panel-2);
      border: 1px solid var(--color-line); border-radius: var(--radius-ctl); }
.pm:hover:not(:disabled) { border-color: var(--color-brand); color: var(--color-brand); }
/* Disabled is spelled out by the cursor and the fade AND by the button being
   unreachable by keyboard — the end of the range is never colour-only. */
.pm:disabled { opacity: .38; cursor: not-allowed; }
.fld { flex: 1; min-width: 0; width: 100%; padding: 8px 6px; text-align: center;
       font: inherit; font-family: var(--font-mono); font-size: 15px; font-weight: 600;
       color: var(--color-ink); background: var(--color-panel-2);
       border: 1px solid var(--color-line); border-radius: var(--radius-ctl); }
.fld:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 1px; }
.unit { font-size: 10.5px; color: var(--color-muted); font-family: var(--font-mono);
        text-align: center; }
@container (max-width: 150px) {
  .pm { width: 32px; }
  .unit { display: none; }
}
</style>
