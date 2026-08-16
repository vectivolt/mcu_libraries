<!-- Status pill. Tone comes from `card.color`, the same vocabulary Card.svelte
     uses, so a badge and its card rail never disagree. The text carries the
     meaning — the colour only repeats it.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card, value } = $props();

  let text = $derived(value == null || value === "" ? "—" : String(value));
  let tone = $derived(
    card.color === "success" ? "var(--color-ok)"
    : card.color === "warning" ? "var(--color-warn)"
    : card.color === "danger"  ? "var(--color-err)"
    : card.color === "info"    ? "var(--color-info)"
    : card.color === "primary" ? "var(--color-brand)"
    : "var(--color-muted)"
  );
</script>

<div class="wrap">
  <span class="pill" style:--tone={tone} title={text}>{text}</span>
  {#if card.unit}<span class="unit">{card.unit}</span>{/if}
</div>

<style>
.wrap { margin-top: auto; display: flex; align-items: center; gap: 6px; min-width: 0; }
/* colour-mix keeps one token per tone: the fill and border are derived from
   the text colour rather than needing a second variable each. */
.pill { display: inline-block; max-width: 100%; padding: 4px 11px; font-size: 13px;
        font-weight: 600; line-height: 1.4; border-radius: 999px;
        color: var(--tone);
        background: color-mix(in srgb, var(--tone) 14%, transparent);
        border: 1px solid color-mix(in srgb, var(--tone) 38%, transparent);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.unit { font-size: 11px; color: var(--color-muted); flex: none; }
</style>
