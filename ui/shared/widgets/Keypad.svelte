<!-- Numeric keypad: buffer locally, send once on enter. A PIN or a setpoint is
     typed a digit at a time and only the finished string is worth a frame.
     Real <button>s, so tab/space/enter work for free; typing digits while the
     pad has focus works too. (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card, value, cmd } = $props();

  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  let buf = $state("");

  const tap  = (k) => { if (buf.length < 16) buf += k; };
  const back = () => (buf = buf.slice(0, -1));
  const clr  = () => (buf = "");
  const send = () => { if (!buf) return; cmd(buf); buf = ""; };

  // Physical keyboard mirrors the on-screen pad. Bare keys only, so browser
  // shortcuts still work. Enter is deliberately absent: focus inside the pad
  // is always on a button, and Enter already activates that button.
  function key(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key >= "0" && e.key <= "9") tap(e.key);
    else if (e.key === "Backspace") back();
    else if (e.key === "Escape") clr();
    else return;
    e.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="kp" onkeydown={key}>
  <output class="rd tnum" aria-live="polite"
          aria-label="{card.label || card.id} entry">{buf || String(value ?? "") || "—"}</output>
  <div class="grid">
    {#each KEYS as k (k)}
      <button type="button" onclick={() => tap(k)}>{k}</button>
    {/each}
    <button type="button" class="alt" onclick={clr} aria-label="Clear">C</button>
    <button type="button" onclick={() => tap("0")}>0</button>
    <button type="button" class="ok" onclick={send} aria-label="Enter">↵</button>
  </div>
</div>

<style>
.kp { margin-top: auto; display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.rd { padding: 6px 9px; font-family: var(--font-mono); font-size: 15px; text-align: right;
      color: var(--color-ink); background: var(--color-bg-soft);
      border: 1px solid var(--color-line); border-radius: var(--radius-ctl);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
button { padding: 9px 0; font: inherit; font-size: 15px; font-family: var(--font-mono);
         cursor: pointer; color: var(--color-ink); background: var(--color-panel-2);
         border: 1px solid var(--color-line); border-radius: var(--radius-ctl); }
button:active { background: var(--color-bg-soft); }
button:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 1px; }
.alt { color: var(--color-err); }
.ok  { color: var(--color-brand); border-color: var(--color-brand); }
</style>
