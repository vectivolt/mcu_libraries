<!-- Single choice from the firmware's setOptions("a|b|c"), as a segmented
     control. A dropdown hides the alternatives behind a tap; a mode selector on
     an instrument panel should show every mode it has.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import Icon from "$shared/components/Icon.svelte";
  import { uid } from "$shared/lib/net.js";
  let { card, value, cmd } = $props();

  let options = $derived(String(card.opts || "").split("|").filter(Boolean));

  // One radio group per card instance. Two cards offering "On|Off" sharing a
  // name would behave as a single group and clear each other.
  const group = uid();
  let name = $derived(card.label || card.id);
</script>

<fieldset class="rd">
  <legend class="sr-only">{name}</legend>
  {#if !options.length}
    <p class="empty">— no options set —</p>
  {/if}
  <!-- Real radios in one group: arrow-key navigation, roving focus and the
       "one of N" announcement all come from the browser, for no bytes. -->
  <!-- Keyed by index, not by option text: card.opts is firmware-supplied,
       and setOptions("Auto|Auto") or a trailing pipe produces duplicates.
       Svelte treats a duplicate key as fatal and would take the whole
       dashboard down, not just this card. -->
  {#each options as o, i (i)}
    <label class="seg" class:on={o === value}>
      <input type="radio" name={group} value={o} checked={o === value}
             onchange={() => cmd(o)}/>
      <!-- The tick, not the fill, is what says "selected" without colour. -->
      <span class="tick" aria-hidden="true">
        {#if o === value}<Icon name="Check" size={12} strokeWidth={3}/>{/if}
      </span>
      <span class="lbl">{o}</span>
    </label>
  {/each}
</fieldset>

<style>
.rd { margin: 0; margin-top: auto; padding: 3px; border: 1px solid var(--color-line);
      border-radius: var(--radius-ctl); background: var(--color-panel-2);
      display: flex; flex-wrap: wrap; gap: 3px; min-width: 0; }
.empty { margin: 4px 6px; font-size: 12px; color: var(--color-muted); }
.seg { flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center;
       gap: 5px; padding: 7px 8px; cursor: pointer; border-radius: calc(var(--radius-ctl) - 2px);
       font-size: 13px; font-weight: 600; color: var(--color-muted); }
.seg.on { color: #fff; background: var(--color-brand); }
.seg:hover:not(.on) { color: var(--color-ink); background: var(--color-bg-soft); }
/* Hidden, not display:none — a removed input is not focusable and the arrow
   keys stop working, which is the usual way this pattern is broken. */
.seg input { position: absolute; width: 1px; height: 1px; opacity: 0; margin: 0; }
.seg:focus-within { outline: 2px solid var(--color-brand); outline-offset: 1px; }
.tick { display: inline-grid; place-items: center; width: 12px; flex: none; }
.lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@container (max-width: 190px) {
  .rd { flex-direction: column; }
  .seg { justify-content: flex-start; }
}
</style>
