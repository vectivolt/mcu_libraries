<!-- Multi-line text. Commits on blur and on Ctrl/Cmd+Enter, never per keystroke:
     every keystroke would be a WebSocket frame to a device that is also running
     a control loop. (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { uid } from "$shared/lib/net.js";
  let { card, value, cmd } = $props();

  const hintId = `ta-${uid()}`;
  let text = $state("");
  let seen = null;                       // last value we took from the device

  // Re-seed only when the device sends something we have not seen. Seeding on
  // every render would wipe half-typed text whenever an unrelated prop moved.
  $effect(() => {
    const v = String(value ?? "");
    if (v !== seen) { seen = v; text = v; }
  });

  let dirty = $derived(text !== String(value ?? ""));
  const commit = () => { if (dirty) cmd(text); };

  function key(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
  }
</script>

<div class="ta">
  <textarea rows="3" spellcheck="false"
            aria-label={card.label || card.id} aria-describedby={hintId}
            placeholder={card.unit || "Ctrl/⌘+Enter to send"}
            value={text} oninput={(e) => (text = e.currentTarget.value)}
            onblur={commit} onkeydown={key}></textarea>
  <!-- Text, not a coloured dot: "unsaved" has to survive greyscale. -->
  <span class="hint" id={hintId} aria-live="polite">{dirty ? "● unsaved" : ""}</span>
</div>

<style>
.ta { margin-top: auto; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
textarea { width: 100%; resize: vertical; padding: 8px 10px; font: inherit; font-size: 13.5px;
           line-height: 1.45; color: var(--color-ink); background: var(--color-panel-2);
           border: 1px solid var(--color-line); border-radius: var(--radius-ctl); }
textarea:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 1px; }
.hint { min-height: 14px; font-size: 10.5px; color: var(--color-warn);
        font-family: var(--font-mono); }
</style>
