<!-- Plain string readout. The workhorse: a firmware version, a MAC, a state
     name. Truncates rather than reflowing the card, and keeps the full text
     in `title` so it is still recoverable.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card, value } = $props();
  // `value` is always a string on the wire, but a card that has never been
  // set arrives as null — render an em dash, not "null".
  let text = $derived(value == null || value === "" ? "—" : String(value));
</script>

<div class="txt">
  <span class="val" title={text}>{text}</span>
  {#if card.unit}<span class="unit">{card.unit}</span>{/if}
</div>

<style>
.txt { margin-top: auto; display: flex; align-items: baseline; gap: 5px; min-width: 0; }
.val { font-size: clamp(17px, 3.4vw, 22px); font-weight: 600; line-height: 1.15;
       color: var(--color-ink); min-width: 0;
       overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.unit { font-size: 11px; color: var(--color-muted); flex: none; }
</style>
