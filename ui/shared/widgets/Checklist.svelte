<!-- Multi-select over the firmware's setOptions("a|b|c") — enabled channels, the
     alarms that are armed, which pumps take part in a cycle. ESP-DASH needs one
     switch card per item, which costs a card and a tab.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card, value, cmd } = $props();

  let options = $derived(String(card.opts || "").split("|").filter(Boolean));
  // Selection is the same "|" format coming back. Entries the firmware no
  // longer offers are simply not rendered, and drop out on the next toggle.
  let chosen = $derived(new Set(String(value ?? "").split("|").filter(Boolean)));

  function toggle(o) {
    const next = new Set(chosen);
    if (!next.delete(o)) next.add(o);
    // Emitted in option order, not click order: the device gets a stable
    // string, so an unchanged selection never looks like a change.
    cmd(options.filter((x) => next.has(x)).join("|"));
  }

  let name = $derived(card.label || card.id);
</script>

<fieldset class="ck">
  <legend class="sr-only">{name}</legend>
  {#if !options.length}
    <p class="empty">— no options set —</p>
  {/if}
  <!-- Keyed by index, not by option text: card.opts is firmware-supplied,
       and setOptions("Auto|Auto") or a trailing pipe produces duplicates.
       Svelte treats a duplicate key as fatal and would take the whole
       dashboard down, not just this card. -->
  {#each options as o, i (i)}
    <label class="row">
      <input type="checkbox" checked={chosen.has(o)} onchange={() => toggle(o)}/>
      <span class="lbl">{o}</span>
    </label>
  {/each}
</fieldset>

<style>
/* Scrolls inside the card rather than growing it: a 20-entry checklist must
   not stretch its grid row and shove every neighbouring card down. */
.ck { margin: 0; margin-top: auto; padding: 0; border: 0; min-width: 0;
      display: flex; flex-direction: column; max-height: 170px; overflow-y: auto; }
.empty { margin: 2px 0; font-size: 12px; color: var(--color-muted); }
.row { display: flex; align-items: center; gap: 8px; padding: 5px 2px; cursor: pointer;
       font-size: 13.5px; color: var(--color-ink); min-width: 0; }
.row:hover { color: var(--color-brand); }
/* Native checkbox: the tick mark is the state, so it is legible without
   colour, and accent-color is one line instead of a custom control. */
.row input { width: 16px; height: 16px; flex: none; margin: 0; cursor: pointer;
             accent-color: var(--color-brand); }
.lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
