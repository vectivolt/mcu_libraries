<!-- Layout only: a horizontal rule across the card, with card.label as a centred
     caption when the firmware set one. (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card } = $props();
</script>

<div class="dv" role="separator" aria-label={card.label || card.id}>
  <span class="ln"></span>
  {#if card.label}
    <span class="cap">{card.label}</span>
    <span class="ln"></span>
  {/if}
</div>

<style>
.dv { margin: auto 0; display: flex; align-items: center; gap: 9px; min-width: 0; }
.ln { flex: 1; height: 1px; background: var(--color-line); }
.cap { flex: none; max-width: 70%; font-size: 10.5px; font-weight: 600; letter-spacing: .07em;
       text-transform: uppercase; color: var(--color-muted);
       overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
