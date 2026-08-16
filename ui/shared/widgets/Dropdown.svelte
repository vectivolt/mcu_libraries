<!-- Select from firmware-supplied options. ESP-DASH has no select card at all;
     sketches fake it with a slider over an index.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card, value, cmd } = $props();
  // `opts` is the firmware's setOptions("a|b|c").
  let options = $derived(String(card.opts || "").split("|").filter(Boolean));
</script>

<label class="dd">
  <span class="sr-only">{card.label || card.id}</span>
  <select value={value} onchange={(e) => cmd(e.currentTarget.value)}
          aria-label={card.label || card.id}>
    {#if !options.length}
      <option value="">— no options set —</option>
    {/if}
    <!-- Keyed by index, not by option text: card.opts is firmware-supplied,
         and setOptions("Auto|Auto") or a trailing pipe produces duplicates.
         Svelte treats a duplicate key as fatal and would take the whole
         dashboard down, not just this card. -->
    {#each options as o, i (i)}
      <option value={o} selected={o === value}>{o}</option>
    {/each}
  </select>
</label>

<style>
.dd { margin-top: auto; display: block; }
select { width: 100%; padding: 9px 11px; font: inherit; font-size: 14px; cursor: pointer;
         color: var(--color-ink); background: var(--color-panel-2);
         border: 1px solid var(--color-line); border-radius: var(--radius-ctl); }
select:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 1px; }
</style>
