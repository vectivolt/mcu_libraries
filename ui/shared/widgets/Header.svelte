<!-- Layout only: a section heading dropped into the card grid. No value, no
     interaction, and deliberately no chrome of its own — it exists to break a
     30-widget wall into readable groups, so anything eye-catching here would
     compete with the instruments it is labelling.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card } = $props();
</script>

<div class="hd">
  <h3>{card.label || card.id}</h3>
  {#if card.unit}<p>{card.unit}</p>{/if}
</div>

<style>
.hd { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
h3 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: .01em;
     color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
p  { margin: 0; font-size: 12px; color: var(--color-muted); }
</style>
